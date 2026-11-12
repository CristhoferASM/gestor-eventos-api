package storage_test

import (
	"context"
	"errors"
	"os"
	"reflect"
	"regexp"
	"sync"
	"testing"
	"time"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"
	"gestor-eventos-api/services"
	"gestor-eventos-api/storage"

	"github.com/jackc/pgx/v5"
)

// Pruebas de integración contra la base de datos de la empresa en Neon (rama dev-backend, usuario backend_showtech).
// Se activan con TEST_EMPRESA_DATABASE_URL (la cadena de conexión del usuario del backend); sin ella se omiten.
//
// NUNCA apuntar a la rama production. Las pruebas que escriben usan el evento 3 (EV-0003, «Concierto Juvenil») y borran
// después todo lo que crean. Dependen de los datos de prueba oficiales (9 eventos, 2 solicitudes de modificación).
func abrirEmpresa(t *testing.T) (*storage.EmpresaStore, string) {
	t.Helper()
	url := os.Getenv("TEST_EMPRESA_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_EMPRESA_DATABASE_URL no está definida: se omiten las pruebas contra la base de la empresa")
	}
	ctx, cancelar := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancelar()
	s, err := storage.NewEmpresaStore(ctx, url)
	if err != nil {
		t.Fatalf("no se pudo abrir el almacén de la empresa: %v", err)
	}
	t.Cleanup(s.Close)
	return s, url
}

// borrarSolicitudes elimina las solicitudes de prueba (sus versiones se borran en cascada).
func borrarSolicitudes(t *testing.T, url string, ids ...uint) {
	t.Helper()
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Errorf("no se pudo limpiar: %v", err)
		return
	}
	defer conn.Close(ctx)
	for _, id := range ids {
		if _, err := conn.Exec(ctx, `DELETE FROM solicitud_modificacion WHERE id_solicitud_mod = $1`, int32(id)); err != nil {
			t.Errorf("no se pudo borrar la solicitud %d: %v", id, err)
		}
	}
}

var asesorPrueba = models.Usuario{ID: 2, Correo: "asesor@ejemplo.pe", Rol: models.RolAsesor}

// clientePrueba es un cliente dueño del evento 3 (CLI-0002). Como en la base de datos de la empresa, la solicitud la envía el
// cliente: el usuario 3 de la tabla usuario hace de solicitante (solo para la clave foránea; el dueño lo define ClienteID).
var clientePrueba = models.Usuario{ID: 3, Correo: "contacto@ejemplo.pe", Rol: models.RolCliente, ClienteID: "CLI-0002"}

func TestEmpresaLeeEventosConHorarioYAdicionales(t *testing.T) {
	s, _ := abrirEmpresa(t)
	ctx := context.Background()

	eventos, err := s.ObtenerEventos(ctx)
	if err != nil || len(eventos) < 9 {
		t.Fatalf("se esperaban al menos 9 eventos: %d, %v", len(eventos), err)
	}
	ev, err := s.ObtenerEventoPorID(ctx, 3)
	if err != nil {
		t.Fatal(err)
	}
	if ev.Codigo != "EV-0003" || ev.Nombre != "Concierto Juvenil" || ev.Estado != "CON_ADELANTO" || ev.Espacio != "Auditorio Showtech" {
		t.Errorf("EV-0003 inesperado: %+v", ev)
	}
	if ev.ClienteID == "" || ev.ClienteNombre == "" {
		t.Errorf("el evento debe traer su cliente: %+v", ev)
	}
	// El cambio de fecha aprobado dejó el evento el 2026-12-06 de 18:00 a 22:00, con montaje de 13:00 a 17:00
	if ev.Fecha != "2026-12-06" || ev.HoraInicio != "18:00" || ev.HoraFin != "22:00" || !ev.HasMontaje || ev.MontajeHoraInicio != "13:00" || ev.MontajeHoraFin != "17:00" {
		t.Errorf("horario de EV-0003 inesperado: %+v", ev)
	}
	if ev.NoOcupaHorario {
		t.Error("un evento CON_ADELANTO ocupa el auditorio")
	}
	if len(ev.Adicionales) != 1 || ev.Adicionales[0].ID != "MICROFONO" || ev.Adicionales[0].Cantidad != 6 || ev.Adicionales[0].Horas != 4 || ev.Adicionales[0].Subtotal != 120 {
		t.Errorf("adicionales de EV-0003: %+v", ev.Adicionales)
	}

	// Un evento solo RESERVADO (EV-0005) todavía no ocupa el auditorio
	reservado, err := s.ObtenerEventoPorID(ctx, 5)
	if err != nil || reservado.Estado != "RESERVADO" || !reservado.NoOcupaHorario {
		t.Errorf("EV-0005 (RESERVADO) no debía ocupar el auditorio: %+v, %v", reservado, err)
	}

	if _, err := s.ObtenerEventoPorID(ctx, 999999); !errors.Is(err, repositories.ErrEventoNoEncontrado) {
		t.Errorf("evento inexistente: %v", err)
	}
}

func TestEmpresaLeeClientesBloqueosYCatalogo(t *testing.T) {
	s, _ := abrirEmpresa(t)
	ctx := context.Background()

	clientes, err := s.ObtenerClientes(ctx)
	if err != nil || len(clientes) < 6 || clientes[0].ID != "CLI-0001" || clientes[0].RazonSocial != "Empresa Ejemplo S.A.C." {
		t.Errorf("clientes: %+v, %v", clientes, err)
	}

	bloqueos, err := s.ObtenerBloqueos(ctx)
	if err != nil {
		t.Fatal(err)
	}
	encontrado := false
	for _, b := range bloqueos {
		if b.ID == "BLQ-1" && b.Fecha == "2026-11-20" && b.HoraInicio == "06:00" && b.HoraFin == "22:00" && b.Tipo == "MINEDU" {
			encontrado = true
		}
	}
	if !encontrado {
		t.Errorf("falta el bloqueo MINEDU del 2026-11-20: %+v", bloqueos)
	}

	catalogo, err := s.ObtenerAdicionales(ctx)
	if err != nil || len(catalogo) < 5 {
		t.Fatalf("catálogo: %+v, %v", catalogo, err)
	}
	if catalogo[0].ID != "COCHERA" || catalogo[0].TarifaHora != 10 {
		t.Errorf("primer adicional: %+v", catalogo[0])
	}
}

func TestEmpresaLeeSolicitudesConSusSnapshots(t *testing.T) {
	s, _ := abrirEmpresa(t)
	sols, err := s.ObtenerSolicitudes(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var pendiente *models.Solicitud
	for i := range sols {
		if sols[i].Codigo == "SOLM-2026-0002" {
			pendiente = &sols[i]
		}
	}
	if pendiente == nil {
		t.Fatalf("falta SOLM-2026-0002: %+v", sols)
	}
	if pendiente.Estado != models.EstadoPendienteRevision || pendiente.EventoID != 4 || pendiente.Motivo == "" {
		t.Errorf("solicitud pendiente: %+v", pendiente)
	}
	// Los «antes y después» salen de evento_version: la propuesta agrega la pantalla LED 4x3. (En los datos de ejemplo
	// de la empresa esta solicitud no tiene bloques de horario cargados, solo datos generales y adicionales.)
	if pendiente.DatosOriginales.Nombre != "Feria de Ciencias" || pendiente.DatosOriginales.Contacto != "Rosa Directora" {
		t.Errorf("datos originales: %+v", pendiente.DatosOriginales)
	}
	if pendiente.DatosPropuestos.Nombre != "Feria de Ciencias" || pendiente.TiemposTecnicosPropuestos == nil || pendiente.AdicionalesPropuestos == nil {
		t.Errorf("datos propuestos: %+v", pendiente.DatosPropuestos)
	}
	if len(pendiente.DatosPropuestos.Adicionales) <= len(pendiente.DatosOriginales.Adicionales) {
		t.Errorf("la propuesta debía tener un adicional más: original=%+v propuesta=%+v", pendiente.DatosOriginales.Adicionales, pendiente.DatosPropuestos.Adicionales)
	}
	if ok, _ := regexp.MatchString(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-05:00$`, pendiente.FechaCreacion); !ok {
		t.Errorf("fecha_creacion debía ser RFC 3339 con la zona de Lima: %q", pendiente.FechaCreacion)
	}
}

func TestEmpresaCuentasDemoSalenDeLaTablaUsuario(t *testing.T) {
	s, _ := abrirEmpresa(t)
	usuarios, err := s.UsuariosDemo(context.Background(), "ClavePrueba123!")
	if err != nil {
		t.Fatal(err)
	}
	var asesor, cliente *models.Usuario
	for i := range usuarios {
		switch usuarios[i].Correo {
		case "asesor@ejemplo.pe":
			asesor = &usuarios[i]
		case "contacto@ejemplo.pe":
			cliente = &usuarios[i]
		}
		if usuarios[i].PasswordHash == "" || usuarios[i].PasswordHash == "ClavePrueba123!" {
			t.Errorf("la contraseña debe guardarse como hash bcrypt: %+v", usuarios[i])
		}
	}
	if asesor == nil || asesor.Rol != models.RolAsesor || asesor.ID != 2 {
		t.Errorf("asesor: %+v", asesor)
	}
	if cliente == nil || cliente.Rol != models.RolCliente || cliente.ClienteID != "CLI-0001" {
		t.Errorf("cliente: %+v", cliente)
	}
}

// servicioEmpresa arma el servicio de solicitudes sobre la base real, como en main.go.
func servicioEmpresa(s *storage.EmpresaStore) *services.SolicitudService {
	return services.NewSolicitudService(s, s).ConBloqueos(s).ConCatalogo(s).SoloClientesEnvian()
}

// cambioObservaciones es una solicitud sin cambio de horario sobre el evento 3 (no toca la disponibilidad).
func cambioObservaciones(texto string) models.SolicitudCreacionDTO {
	return models.SolicitudCreacionDTO{
		EventoID: 3, Motivo: "Prueba automática de integración (se borra al terminar)",
		FechaPropuesta: "2026-12-06", HoraInicioPropuesta: "18:00", HoraFinPropuesta: "22:00",
		InformacionGeneralPropuesta: &models.InformacionGeneralPropuestaDTO{
			Nombre: "Concierto Juvenil", Contacto: "Pedro Ejemplo", Telefono: "900000002", Correo: "persona@ejemplo.pe", Observaciones: texto,
		},
	}
}

func TestEmpresaCrearYRetirarSolicitudDeModificacion(t *testing.T) {
	s, url := abrirEmpresa(t)
	ctx := context.Background()
	svc := servicioEmpresa(s)

	creada, err := svc.CrearSolicitudDe(ctx, clientePrueba, cambioObservaciones("Observación de prueba"))
	if errors.Is(err, services.ErrSolicitudPendienteDuplicada) {
		t.Skip("el evento 3 ya tiene una solicitud pendiente de otra persona: se omite para no interferir")
	}
	if err != nil {
		t.Fatalf("crear: %v", err)
	}
	t.Cleanup(func() { borrarSolicitudes(t, url, creada.ID) })

	if ok, _ := regexp.MatchString(`^SOLM-\d{4}-\d{4}$`, creada.Codigo); !ok {
		t.Errorf("código inesperado: %q", creada.Codigo)
	}
	if creada.Estado != models.EstadoPendienteRevision || creada.EventoID != 3 || creada.SolicitanteID != clientePrueba.ID {
		t.Errorf("solicitud creada: %+v", creada)
	}
	// Los snapshots quedan en evento_version: el original es el evento actual y la propuesta lleva el cambio
	if creada.DatosOriginales.Observaciones != "" || creada.DatosPropuestos.Observaciones != "Observación de prueba" {
		t.Errorf("snapshots: original=%q propuesta=%q", creada.DatosOriginales.Observaciones, creada.DatosPropuestos.Observaciones)
	}
	if creada.DatosOriginales.Fecha != "2026-12-06" || creada.DatosOriginales.HoraInicio != "18:00" || !creada.DatosOriginales.HasMontaje ||
		len(creada.DatosOriginales.Adicionales) != 1 || creada.DatosOriginales.Adicionales[0].ID != "MICROFONO" {
		t.Errorf("el original debe ser el evento tal como estaba: %+v", creada.DatosOriginales)
	}

	// Aparece en el listado con el mismo código
	todas, _ := s.ObtenerSolicitudes(ctx)
	visto := false
	for _, x := range todas {
		visto = visto || x.ID == creada.ID
	}
	if !visto {
		t.Error("la solicitud creada debe aparecer en el listado")
	}

	// Una segunda solicitud pendiente sobre el mismo evento la rechaza la base (índice único parcial)
	if _, err := svc.CrearSolicitudDe(ctx, clientePrueba, cambioObservaciones("otra")); !errors.Is(err, services.ErrSolicitudPendienteDuplicada) {
		t.Errorf("segunda pendiente: se esperaba ErrSolicitudPendienteDuplicada, se obtuvo %v", err)
	}

	// Retiro: atómico, conserva la solicitud y no se repite
	retirada, err := s.RetirarSolicitud(ctx, creada.ID, time.Now().Format(time.RFC3339))
	if err != nil || retirada.Estado != models.EstadoRetiradaCliente || retirada.FechaRetiro == "" {
		t.Fatalf("retiro: %+v, %v", retirada, err)
	}
	if retirada.DatosPropuestos.Observaciones != "Observación de prueba" {
		t.Error("el retiro no debe perder los datos de la solicitud")
	}
	if _, err := s.RetirarSolicitud(ctx, creada.ID, time.Now().Format(time.RFC3339)); !errors.Is(err, repositories.ErrSolicitudNoPendiente) {
		t.Errorf("segundo retiro: %v", err)
	}
	if _, err := s.RetirarSolicitud(ctx, 999999, time.Now().Format(time.RFC3339)); !errors.Is(err, repositories.ErrSolicitudNoEncontrada) {
		t.Errorf("retiro inexistente: %v", err)
	}
	// Libera el evento: ahora se puede enviar otra pendiente
	otra, err := svc.CrearSolicitudDe(ctx, clientePrueba, cambioObservaciones("tras el retiro"))
	if err != nil {
		t.Fatalf("tras retirar debía poder crearse otra: %v", err)
	}
	borrarSolicitudes(t, url, otra.ID)
}

func TestEmpresaSolicitudesSimultaneasSoloUnaPendiente(t *testing.T) {
	s, url := abrirEmpresa(t)
	ctx := context.Background()
	svc := servicioEmpresa(s)

	// Si hay una pendiente ajena, la prueba no tiene sentido
	if previa, err := svc.CrearSolicitudDe(ctx, clientePrueba, cambioObservaciones("sonda")); errors.Is(err, services.ErrSolicitudPendienteDuplicada) {
		t.Skip("el evento 3 ya tiene una solicitud pendiente de otra persona")
	} else if err != nil {
		t.Fatal(err)
	} else {
		borrarSolicitudes(t, url, previa.ID)
	}

	const n = 8
	var (
		wg        sync.WaitGroup
		mu        sync.Mutex
		creadas   []uint
		duplicada int
		otros     []error
	)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sol, err := svc.CrearSolicitudDe(ctx, clientePrueba, cambioObservaciones("simultánea"))
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				creadas = append(creadas, sol.ID)
			case errors.Is(err, services.ErrSolicitudPendienteDuplicada):
				duplicada++
			default:
				otros = append(otros, err)
			}
		}()
	}
	wg.Wait()
	borrarSolicitudes(t, url, creadas...)
	if len(creadas) != 1 || duplicada != n-1 || len(otros) != 0 {
		t.Errorf("con %d peticiones simultáneas debía crearse exactamente 1: creadas=%d duplicadas=%d otros=%v", n, len(creadas), duplicada, otros)
	}
}

func TestEmpresaCambioDeHorarioGuardaElCronogramaPropuesto(t *testing.T) {
	s, url := abrirEmpresa(t)
	ctx := context.Background()
	svc := servicioEmpresa(s)

	// Se adelanta una hora el evento (19:00-22:00): el montaje 13:00-17:00 sigue siendo previo y no choca con nadie
	dto := cambioObservaciones("")
	dto.HoraInicioPropuesta = "19:00"
	// Los tiempos técnicos se envían explícitos (si se omiten, el servicio los recalcula: comportamiento por revisar)
	dto.TiemposTecnicosPropuestos = &models.TiemposTecnicosPropuestosDTO{
		HasMontaje: true, MontajeFecha: "2026-12-06", MontajeHoraInicio: "13:00", MontajeHoraFin: "17:00",
	}
	creada, err := svc.CrearSolicitudDe(ctx, clientePrueba, dto)
	if errors.Is(err, services.ErrSolicitudPendienteDuplicada) {
		t.Skip("el evento 3 ya tiene una solicitud pendiente de otra persona")
	}
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { borrarSolicitudes(t, url, creada.ID) })
	if creada.DatosOriginales.HoraInicio != "18:00" || creada.DatosPropuestos.HoraInicio != "19:00" || creada.HoraInicioPropuesta != "19:00" {
		t.Errorf("original=%q propuesta=%q", creada.DatosOriginales.HoraInicio, creada.DatosPropuestos.HoraInicio)
	}
	// Los tiempos técnicos se conservan en la propuesta
	if !creada.DatosPropuestos.HasMontaje || creada.DatosPropuestos.MontajeHoraInicio != "13:00" || creada.DatosPropuestos.MontajeHoraFin != "17:00" {
		t.Errorf("montaje propuesto: %+v", creada.DatosPropuestos)
	}
}

func TestEmpresaDisponibilidadUsaLosBloqueosYLosEventosReservados(t *testing.T) {
	s, _ := abrirEmpresa(t)
	ctx := context.Background()
	svc := servicioEmpresa(s)

	// El 2026-11-20 el auditorio está bloqueado todo el día (MINEDU)
	dto := cambioObservaciones("")
	dto.FechaPropuesta = "2026-11-20"
	dto.HoraInicioPropuesta, dto.HoraFinPropuesta = "09:00", "12:00"
	dto.TiemposTecnicosPropuestos = &models.TiemposTecnicosPropuestosDTO{}
	err := svc.ConsultarDisponibilidadDe(ctx, asesorPrueba, dto)
	if !errors.Is(err, services.ErrSinDisponibilidad) {
		t.Fatalf("el bloqueo MINEDU del 20/11 debía impedirlo: %v", err)
	}

	// El 2026-12-12 está ocupado por EV-0004 (CON_ADELANTO) de 06:00 a 15:00
	dto.FechaPropuesta = "2026-12-12"
	dto.HoraInicioPropuesta, dto.HoraFinPropuesta = "10:00", "12:00"
	if err := svc.ConsultarDisponibilidadDe(ctx, asesorPrueba, dto); !errors.Is(err, services.ErrSinDisponibilidad) {
		t.Errorf("EV-0004 ocupa ese día: %v", err)
	}

	// El 2026-12-19 solo tiene EV-0005, que está RESERVADO (sin primer pago): no ocupa el auditorio
	dto.FechaPropuesta = "2026-12-19"
	dto.HoraInicioPropuesta, dto.HoraFinPropuesta = "18:00", "20:00"
	if err := svc.ConsultarDisponibilidadDe(ctx, asesorPrueba, dto); err != nil {
		t.Errorf("un evento solo RESERVADO no debía bloquear el horario: %v", err)
	}
}

func TestEmpresaElAsesorNoEnviaSolicitudesPeroSiConsultaDisponibilidad(t *testing.T) {
	s, _ := abrirEmpresa(t)
	ctx := context.Background()
	svc := servicioEmpresa(s)

	// Como en la base: el solicitante es el cliente; el asesor aplica cambios directos (modificacion_evento)
	if _, err := svc.CrearSolicitudDe(ctx, asesorPrueba, cambioObservaciones("no debe guardarse")); !errors.Is(err, services.ErrAccesoDenegado) {
		t.Errorf("el asesor no debe enviar solicitudes: %v", err)
	}
	if todas, _ := s.ObtenerSolicitudes(ctx); len(todas) > 0 {
		for _, sol := range todas {
			if sol.Motivo == cambioObservaciones("").Motivo && sol.SolicitanteID == asesorPrueba.ID {
				t.Errorf("no debía guardarse nada a nombre del asesor: %+v", sol)
			}
		}
	}
	// La consulta de disponibilidad (que usa el paso 3 del portal del asesor) sigue permitida
	dto := cambioObservaciones("")
	dto.TiemposTecnicosPropuestos = &models.TiemposTecnicosPropuestosDTO{}
	if err := svc.ConsultarDisponibilidadDe(ctx, asesorPrueba, dto); err != nil && !errors.Is(err, services.ErrSinDisponibilidad) {
		t.Errorf("el asesor debe poder consultar la disponibilidad: %v", err)
	}
}

func TestEmpresaElEventoTraeLaTarifaVigenteDelAuditorio(t *testing.T) {
	s, _ := abrirEmpresa(t)
	ev, err := s.ObtenerEventoPorID(context.Background(), 3)
	if err != nil || ev.TarifaHoraAlquiler != 100 {
		t.Errorf("la tarifa vigente de los datos de prueba es S/ 100 por hora: %v, %v", ev.TarifaHoraAlquiler, err)
	}
	eventos, _ := s.ObtenerEventos(context.Background())
	for _, e := range eventos {
		if e.TarifaHoraAlquiler != 100 {
			t.Errorf("%s: tarifa %v", e.Codigo, e.TarifaHoraAlquiler)
		}
	}
}

// Crear una solicitud devuelve lo que ya sabe en vez de releer todas las solicitudes (era lo más lento del envío): el
// resultado tiene que ser idéntico a lo que después entrega la lista.
func TestEmpresaLaSolicitudCreadaEsIgualALaQueDevuelveLaLista(t *testing.T) {
	s, url := abrirEmpresa(t)
	ctx := context.Background()
	svc := servicioEmpresa(s)

	dto := cambioObservaciones("")
	dto.HoraInicioPropuesta = "19:00"
	dto.TiemposTecnicosPropuestos = &models.TiemposTecnicosPropuestosDTO{
		HasMontaje: true, MontajeFecha: "2026-12-06", MontajeHoraInicio: "13:00", MontajeHoraFin: "17:00",
	}
	adicionales := []models.AdicionalPropuestoDTO{{ID: "COCHERA", Cantidad: 2, Horas: 3}}
	dto.AdicionalesPropuestos = &adicionales
	creada, err := svc.CrearSolicitudDe(ctx, clientePrueba, dto)
	if errors.Is(err, services.ErrSolicitudPendienteDuplicada) {
		t.Skip("el evento 3 ya tiene una solicitud pendiente de otra persona")
	}
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { borrarSolicitudes(t, url, creada.ID) })

	lista, err := s.ObtenerSolicitudes(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, leida := range lista {
		if leida.ID == creada.ID {
			if !reflect.DeepEqual(creada, leida) {
				t.Errorf("la solicitud devuelta al crear difiere de la que entrega la lista; creada=%+v; leida=%+v", creada, leida)
			}
			return
		}
	}
	t.Fatalf("la solicitud %d no aparece en la lista", creada.ID)
}
