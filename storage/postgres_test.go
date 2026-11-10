package storage_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"
	"gestor-eventos-api/services"
	"gestor-eventos-api/storage"

	"github.com/jackc/pgx/v5"
)

// Estas pruebas necesitan una base de datos PostgreSQL real. Se activan con TEST_DATABASE_URL, por ejemplo:
//
//	postgres://showtech:showtech_dev@127.0.0.1:5433/gestor_eventos?sslmode=disable
//
// Sin esa variable se omiten (el resto de la suite no depende de PostgreSQL).
func urlPruebas(t *testing.T) string {
	t.Helper()
	u := os.Getenv("TEST_DATABASE_URL")
	if u == "" {
		t.Skip("TEST_DATABASE_URL no está definida: se omiten las pruebas de PostgreSQL")
	}
	return u
}

// nuevoPG crea un esquema propio para la prueba (aislamiento total) y lo elimina al terminar.
func nuevoPG(t *testing.T) (*storage.PostgresStore, string) {
	t.Helper()
	base := urlPruebas(t)
	ctx := context.Background()

	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatalf("no se pudo conectar a PostgreSQL: %v", err)
	}
	esquema := fmt.Sprintf("prueba_%d", time.Now().UnixNano())
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+esquema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(ctx, "DROP SCHEMA "+esquema+" CASCADE")
		_ = admin.Close(ctx)
	})

	sep := "?"
	if strings.Contains(base, "?") {
		sep = "&"
	}
	url := base + sep + "search_path=" + esquema
	s, err := storage.NewPostgresStore(ctx, url)
	if err != nil {
		t.Fatalf("no se pudo abrir el almacén: %v", err)
	}
	t.Cleanup(s.Close)
	return s, url
}

func solicitudPrueba(eventoID uint, motivo string) models.Solicitud {
	return models.Solicitud{
		EventoID: eventoID, Motivo: motivo, Estado: models.EstadoPendienteRevision,
		FechaPropuesta: "2026-12-01", HoraInicioPropuesta: "10:00", HoraFinPropuesta: "12:00",
		FechaCreacion:   "2026-11-09T10:00:00-05:00",
		DatosOriginales: models.DatosHorario{Nombre: "Original", Fecha: "2026-11-15", HoraInicio: "09:00", HoraFin: "13:00"},
		DatosPropuestos: models.DatosHorario{Nombre: "Propuesto", Fecha: "2026-12-01", HoraInicio: "10:00", HoraFin: "12:00"},
	}
}

func TestPGMigracionesSonIdempotentesYSembrarNoDuplicaNiPisa(t *testing.T) {
	s, url := nuevoPG(t)
	ctx := context.Background()

	if err := s.SembrarDemo(ctx); err != nil {
		t.Fatal(err)
	}
	eventos, _ := s.ObtenerEventos(ctx)
	bloqueos, _ := s.ObtenerBloqueos(ctx)
	usuarios, _ := s.ObtenerUsuarios(ctx)
	if len(eventos) != 2 || len(bloqueos) != 1 || len(usuarios) != 2 {
		t.Fatalf("datos demo inesperados: %d eventos, %d bloqueos, %d usuarios", len(eventos), len(bloqueos), len(usuarios))
	}
	if eventos[0].Nombre != "Ceremonia de graduación" || eventos[0].ClienteID != "CLI-001" || eventos[1].ClienteID != "CLI-002" {
		t.Errorf("eventos demo inesperados: %+v", eventos)
	}

	// Una cuenta modificada después del arranque no se pisa al volver a sembrar
	cliente, _ := s.ObtenerUsuarioPorCorreo(ctx, "cliente@horizonte.com")
	cliente.Nombre = "Nombre cambiado"
	if err := s.GuardarUsuario(ctx, cliente); err != nil {
		t.Fatal(err)
	}
	if err := s.SembrarDemo(ctx); err != nil {
		t.Fatal(err)
	}
	eventos, _ = s.ObtenerEventos(ctx)
	usuarios, _ = s.ObtenerUsuarios(ctx)
	cliente, _ = s.ObtenerUsuarioPorCorreo(ctx, "cliente@horizonte.com")
	if len(eventos) != 2 || len(usuarios) != 2 || cliente.Nombre != "Nombre cambiado" {
		t.Errorf("sembrar de nuevo no debe duplicar ni pisar: %d eventos, %d usuarios, nombre=%q", len(eventos), len(usuarios), cliente.Nombre)
	}

	// Abrir otra vez con las migraciones ya aplicadas no falla ni pierde datos
	s2, err := storage.NewPostgresStore(ctx, url)
	if err != nil {
		t.Fatalf("reabrir con el esquema ya migrado falló: %v", err)
	}
	defer s2.Close()
	if ev, _ := s2.ObtenerEventos(ctx); len(ev) != 2 {
		t.Errorf("los datos deben sobrevivir al reabrir: %d eventos", len(ev))
	}
}

func TestPGClientesDemoSeSiembranSinDuplicarNiPisar(t *testing.T) {
	s, url := nuevoPG(t)
	ctx := context.Background()

	if clientes, err := s.ObtenerClientes(ctx); err != nil || len(clientes) != 0 {
		t.Fatalf("antes de sembrar no debía haber clientes: %+v, %v", clientes, err)
	}
	if err := s.SembrarDemo(ctx); err != nil {
		t.Fatal(err)
	}
	clientes, err := s.ObtenerClientes(ctx)
	if err != nil || len(clientes) != 2 || clientes[0].ID != "CLI-001" || clientes[0].RazonSocial != "Promoción Horizonte 2026" || clientes[1].ID != "CLI-002" {
		t.Fatalf("clientes demo inesperados: %+v, %v", clientes, err)
	}

	// Sembrar otra vez no duplica ni pisa un nombre corregido a mano
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	if _, err := conn.Exec(ctx, `UPDATE clientes SET razon_social = 'Nombre corregido' WHERE id = 'CLI-001'`); err != nil {
		t.Fatal(err)
	}
	if err := s.SembrarDemo(ctx); err != nil {
		t.Fatal(err)
	}
	clientes, _ = s.ObtenerClientes(ctx)
	if len(clientes) != 2 || clientes[0].RazonSocial != "Nombre corregido" {
		t.Errorf("sembrar de nuevo no debe duplicar ni pisar: %+v", clientes)
	}

	// Los servicios completan cliente_nombre sobre PostgreSQL
	ev, err := services.NewEventoService(s).ConClientes(s).ObtenerEventoPorID(ctx, 1)
	if err != nil || ev.ClienteNombre != "Nombre corregido" {
		t.Errorf("cliente_nombre sobre PostgreSQL: %+v, %v", ev, err)
	}
}

func TestPGEventosYUsuarios(t *testing.T) {
	s, _ := nuevoPG(t)
	ctx := context.Background()
	_ = s.SembrarDemo(ctx)

	ev, err := s.ObtenerEventoPorID(ctx, 1)
	if err != nil || ev.HoraInicio != "09:00" || !ev.HasMontaje || ev.MontajeHoraInicio != "08:00" {
		t.Errorf("evento 1 inesperado: %+v, %v", ev, err)
	}
	if _, err := s.ObtenerEventoPorID(ctx, 99); !errors.Is(err, repositories.ErrEventoNoEncontrado) {
		t.Errorf("evento inexistente: %v", err)
	}

	if _, err := s.ObtenerUsuarioPorCorreo(ctx, "nadie@x.com"); !errors.Is(err, repositories.ErrUsuarioNoEncontrado) {
		t.Errorf("usuario inexistente: %v", err)
	}
	nuevo := models.Usuario{Correo: "ana@gmail.com", Nombre: "Ana", Rol: models.RolCliente, Proveedor: "google"}
	_ = s.GuardarUsuario(ctx, nuevo)
	nuevo.ClienteID = "CLI-002"
	_ = s.GuardarUsuario(ctx, nuevo) // actualiza, no duplica
	got, _ := s.ObtenerUsuarioPorCorreo(ctx, "ana@gmail.com")
	todos, _ := s.ObtenerUsuarios(ctx)
	if got.ClienteID != "CLI-002" || got.Proveedor != "google" || len(todos) != 3 {
		t.Errorf("upsert de usuario inesperado: %+v (%d usuarios)", got, len(todos))
	}
}

func TestPGSolicitudesReglasYSnapshots(t *testing.T) {
	s, _ := nuevoPG(t)
	ctx := context.Background()
	_ = s.SembrarDemo(ctx)

	creada, err := s.CrearSolicitud(ctx, solicitudPrueba(1, "primera"))
	if err != nil || creada.ID == 0 {
		t.Fatalf("crear: %+v, %v", creada, err)
	}
	if _, err := s.CrearSolicitud(ctx, solicitudPrueba(1, "duplicada")); !errors.Is(err, repositories.ErrSolicitudPendienteDuplicada) {
		t.Errorf("segunda pendiente del mismo evento: %v", err)
	}
	if _, err := s.CrearSolicitud(ctx, solicitudPrueba(99, "evento falso")); !errors.Is(err, repositories.ErrEventoNoEncontrado) {
		t.Errorf("evento inexistente: %v", err)
	}
	if _, err := s.CrearSolicitud(ctx, solicitudPrueba(2, "otro evento")); err != nil {
		t.Errorf("otro evento sí puede tener su propia pendiente: %v", err)
	}

	lista, _ := s.ObtenerSolicitudes(ctx)
	if len(lista) != 2 || lista[0].ID != creada.ID || lista[0].Motivo != "primera" ||
		lista[0].DatosOriginales.Nombre != "Original" || lista[0].DatosPropuestos.HoraInicio != "10:00" {
		t.Errorf("los snapshots deben conservarse exactos: %+v", lista)
	}
}

func TestPGSolicitudPendienteUnicaConConcurrencia(t *testing.T) {
	s, _ := nuevoPG(t)
	ctx := context.Background()
	_ = s.SembrarDemo(ctx)

	const intentos = 20
	var wg sync.WaitGroup
	var mu sync.Mutex
	exitos, duplicadas := 0, 0
	for i := 0; i < intentos; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := s.CrearSolicitud(ctx, solicitudPrueba(1, fmt.Sprintf("carrera %d", i)))
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				exitos++
			case errors.Is(err, repositories.ErrSolicitudPendienteDuplicada):
				duplicadas++
			default:
				t.Errorf("error inesperado: %v", err)
			}
		}(i)
	}
	wg.Wait()
	if exitos != 1 || duplicadas != intentos-1 {
		t.Errorf("la base de datos debe permitir exactamente 1 pendiente por evento: %d éxitos, %d duplicadas", exitos, duplicadas)
	}
}

func TestPGRetiroAtomicoYLiberaElEvento(t *testing.T) {
	s, _ := nuevoPG(t)
	ctx := context.Background()
	_ = s.SembrarDemo(ctx)
	creada, _ := s.CrearSolicitud(ctx, solicitudPrueba(1, "para retirar"))

	if _, err := s.RetirarSolicitud(ctx, 999, "x"); !errors.Is(err, repositories.ErrSolicitudNoEncontrada) {
		t.Errorf("solicitud inexistente: %v", err)
	}

	// Muchos retiros simultáneos: exactamente uno tiene éxito
	const intentos = 20
	var wg sync.WaitGroup
	var mu sync.Mutex
	exitos, noPendientes := 0, 0
	for i := 0; i < intentos; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := s.RetirarSolicitud(ctx, creada.ID, "2026-11-09T11:00:00-05:00")
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				exitos++
			case errors.Is(err, repositories.ErrSolicitudNoPendiente):
				noPendientes++
			default:
				t.Errorf("error inesperado: %v", err)
			}
		}()
	}
	wg.Wait()
	if exitos != 1 || noPendientes != intentos-1 {
		t.Errorf("se esperaba 1 éxito y %d rechazos, hubo %d y %d", intentos-1, exitos, noPendientes)
	}

	// La solicitud se conserva íntegra, con estado y fecha de retiro, tanto en la columna como en el documento
	lista, _ := s.ObtenerSolicitudes(ctx)
	if len(lista) != 1 || lista[0].Estado != models.EstadoRetiradaCliente || lista[0].FechaRetiro != "2026-11-09T11:00:00-05:00" ||
		lista[0].Motivo != "para retirar" || lista[0].DatosOriginales.Nombre != "Original" {
		t.Errorf("la solicitud retirada debe conservarse íntegra: %+v", lista)
	}
	// El evento queda libre para una nueva pendiente
	if _, err := s.CrearSolicitud(ctx, solicitudPrueba(1, "nueva")); err != nil {
		t.Errorf("tras retirar debe poder crearse otra pendiente: %v", err)
	}
}

func TestPGSesionesDesafiosYVerificacionDiaria(t *testing.T) {
	s, url := nuevoPG(t)
	ctx := context.Background()
	ahora := time.Now().UTC().Truncate(time.Second)

	// Desafíos
	if _, err := s.ObtenerDesafio(ctx, "no-existe"); !errors.Is(err, repositories.ErrDesafioNoEncontrado) {
		t.Errorf("desafío inexistente: %v", err)
	}
	d := models.DesafioVerificacion{ID: "id-secreto-123", Correo: "a@b.com", Codigo: "123456", ExpiraEn: ahora.Add(time.Minute), ReenvioPermitidoDesde: ahora.Add(30 * time.Second)}
	_ = s.GuardarDesafio(ctx, d)
	d.Intentos = 3
	_ = s.GuardarDesafio(ctx, d) // actualiza
	got, err := s.ObtenerDesafio(ctx, "id-secreto-123")
	if err != nil || got.Intentos != 3 || got.Codigo != "123456" || got.ID != "id-secreto-123" || !got.ExpiraEn.Equal(d.ExpiraEn) {
		t.Errorf("desafío inesperado: %+v, %v", got, err)
	}
	_ = s.EliminarDesafio(ctx, "id-secreto-123")
	if _, err := s.ObtenerDesafio(ctx, "id-secreto-123"); !errors.Is(err, repositories.ErrDesafioNoEncontrado) {
		t.Errorf("tras eliminar: %v", err)
	}

	// Sesiones
	ses := models.Sesion{Token: "token-secreto-xyz", Correo: "a@b.com", ExpiraEn: ahora.Add(time.Hour)}
	_ = s.GuardarSesion(ctx, ses)
	gs, err := s.ObtenerSesion(ctx, "token-secreto-xyz")
	if err != nil || gs.Correo != "a@b.com" || gs.Token != "token-secreto-xyz" || !gs.ExpiraEn.Equal(ses.ExpiraEn) {
		t.Errorf("sesión inesperada: %+v, %v", gs, err)
	}
	_ = s.EliminarSesion(ctx, "token-secreto-xyz")
	if _, err := s.ObtenerSesion(ctx, "token-secreto-xyz"); !errors.Is(err, repositories.ErrSesionNoEncontrada) {
		t.Errorf("tras eliminar: %v", err)
	}

	// Verificación diaria
	if dia, _ := s.ObtenerVerificacionDiaria(ctx, "disp", "a@b.com"); dia != "" {
		t.Errorf("sin registro debe devolver vacío, devolvió %q", dia)
	}
	_ = s.GuardarVerificacionDiaria(ctx, "disp", "a@b.com", "2026-11-09")
	_ = s.GuardarVerificacionDiaria(ctx, "disp", "a@b.com", "2026-11-10")
	if dia, _ := s.ObtenerVerificacionDiaria(ctx, "disp", "a@b.com"); dia != "2026-11-10" {
		t.Errorf("debe quedar el último día: %q", dia)
	}

	// Lo guardado en la base de datos NO contiene los secretos en claro (solo su hash)
	_ = s.GuardarSesion(ctx, ses)
	_ = s.GuardarDesafio(ctx, d)
	raw, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close(ctx)
	for _, consulta := range []string{
		"SELECT count(*) FROM sesiones WHERE token_hash = 'token-secreto-xyz'",
		"SELECT count(*) FROM desafios WHERE id_hash = 'id-secreto-123'",
		"SELECT count(*) FROM verificaciones_diarias WHERE dispositivo_hash = 'disp'",
	} {
		var n int
		if err := raw.QueryRow(ctx, consulta).Scan(&n); err != nil || n != 0 {
			t.Errorf("%s -> %d (no debe haber secretos en claro): %v", consulta, n, err)
		}
	}
}

// Los servicios funcionan igual sobre PostgreSQL: acceso en dos pasos, atajo diario del asesor, retiro y disponibilidad.
func TestPGServiciosSobrePostgreSQL(t *testing.T) {
	s, _ := nuevoPG(t)
	ctx := context.Background()
	_ = s.SembrarDemo(ctx)

	n := 0
	auth := services.NewAuthServiceCompleto(s, s, time.Now,
		func() (string, error) { return "123456", nil },
		func() (string, error) { n++; return fmt.Sprintf("token-aleatorio-%d", n), nil },
	)
	const navegador = "navegador-pg-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

	d, err := auth.IniciarLogin(ctx, models.LoginDTO{Correo: "asesor@showtech.com", Password: "Asesor2026!", DispositivoID: navegador})
	if err != nil || d.DesafioID == "" {
		t.Fatalf("login: %+v, %v", d, err)
	}
	ses, err := auth.VerificarCodigo(ctx, models.VerificarCodigoDTO{DesafioID: d.DesafioID, Codigo: "123456", DispositivoID: navegador})
	if err != nil || ses.Usuario.Rol != models.RolAsesor {
		t.Fatalf("verificar: %+v, %v", ses, err)
	}
	if u, err := auth.UsuarioDeSesion(ctx, ses.Token); err != nil || u.Correo != "asesor@showtech.com" {
		t.Errorf("sesión: %+v, %v", u, err)
	}
	// Atajo diario persistido en PostgreSQL
	d2, err := auth.IniciarLogin(ctx, models.LoginDTO{Correo: "asesor@showtech.com", Password: "Asesor2026!", DispositivoID: navegador})
	if err != nil || d2.Sesion == nil {
		t.Errorf("el segundo ingreso del día debía abrir sesión directa: %+v, %v", d2, err)
	}
	if err := auth.CerrarSesion(ctx, ses.Token); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.UsuarioDeSesion(ctx, ses.Token); !errors.Is(err, services.ErrSesionInvalida) {
		t.Errorf("tras cerrar sesión: %v", err)
	}

	sol := services.NewSolicitudService(s, s).ConBloqueos(s)
	cliente := models.Usuario{Correo: "cliente@horizonte.com", Rol: models.RolCliente, ClienteID: "CLI-001"}
	creada, err := sol.CrearSolicitudDe(ctx, cliente, models.SolicitudCreacionDTO{
		EventoID: 1, Motivo: "Inicio más tarde", FechaPropuesta: "2026-11-15", HoraInicioPropuesta: "10:00", HoraFinPropuesta: "13:00",
	})
	if err != nil || creada.ID == 0 {
		t.Fatalf("crear solicitud: %+v, %v", creada, err)
	}
	// Disponibilidad contra el otro evento (ambos en PostgreSQL)
	_, err = sol.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
		EventoID: 2, Motivo: "Choque", FechaPropuesta: "2026-11-15", HoraInicioPropuesta: "13:30", HoraFinPropuesta: "14:30",
	})
	if !errors.Is(err, services.ErrSinDisponibilidad) {
		t.Errorf("el choque debe detectarse sobre PostgreSQL: %v", err)
	}
	// Retiro por el dueño; el asesor no puede
	if _, err := sol.RetirarSolicitud(ctx, models.Usuario{Rol: models.RolAsesor}, creada.ID); !errors.Is(err, services.ErrAccesoDenegado) {
		t.Errorf("el asesor no retira: %v", err)
	}
	retirada, err := sol.RetirarSolicitud(ctx, cliente, creada.ID)
	if err != nil || retirada.Estado != models.EstadoRetiradaCliente {
		t.Errorf("retiro: %+v, %v", retirada, err)
	}
}
