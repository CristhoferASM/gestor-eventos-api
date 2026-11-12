package storage

import (
	"encoding/json"
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"
	"gestor-eventos-api/storage/empresadb"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/sync/errgroup"
)

var (
	_ repositories.EventoRepository    = (*EmpresaStore)(nil)
	_ repositories.SolicitudRepository = (*EmpresaStore)(nil)
	_ repositories.BloqueoRepository   = (*EmpresaStore)(nil)
	_ repositories.ClienteRepository   = (*EmpresaStore)(nil)
	_ repositories.AdicionalRepository = (*EmpresaStore)(nil)
)

// ErrEsquemaEmpresaNoEncontrado indica que la base no tiene el esquema de la empresa (tabla `evento` visible en el
// search_path): se está usando otro usuario o otra rama.
var ErrEsquemaEmpresaNoEncontrado = errors.New("no se encontró el esquema de la empresa (tabla evento): revisa el usuario (backend_showtech) y la rama (dev-backend)")

// EmpresaStore implementa los repositorios del módulo sobre la base de datos de la empresa en Neon (esquema `showtech`).
//
// Solo LEE y ESCRIBE DATOS: nunca crea ni modifica tablas (el usuario backend_showtech no puede, y los cambios de
// estructura los hace el administrador con un script versionado). Las reglas del negocio las impone la base de datos
// (estados, un solo pedido pendiente por evento, cruces de horario de los eventos reservados...); aquí solo se traducen
// sus errores. Lo que la base NO controla, y por eso sigue haciendo este backend, es comprobar que el horario
// propuesto en una solicitud no choque con otros eventos ni bloqueos (las propuestas viven en evento_version*).
type EmpresaStore struct {
	pool *pgxpool.Pool
	q    *empresadb.Queries
}

// NewEmpresaStore se conecta, comprueba la conexión y que exista el esquema de la empresa. No migra nada.
func NewEmpresaStore(ctx context.Context, url string) (*EmpresaStore, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("configuración de PostgreSQL inválida: %w", err)
	}
	// El plan gratis de Neon duerme la base a los 5 min sin uso: la primera conexión puede tardar unos segundos
	cfg.ConnConfig.ConnectTimeout = 30 * time.Second
	// El host con «-pooler» usa PgBouncer en modo transacción: no se pueden usar sentencias preparadas con nombre
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeCacheDescribe
	cfg.MaxConns = 5
	// Conexiones siempre abiertas: las consultas en paralelo no pagan el arranque de una conexión nueva (~1 s hasta São Paulo).
	cfg.MinConns = 4
	cfg.HealthCheckPeriod = 30 * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("configuración de PostgreSQL inválida: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("no se pudo conectar con PostgreSQL: %w", err)
	}
	var existe bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('evento') IS NOT NULL`).Scan(&existe); err != nil || !existe {
		pool.Close()
		if err != nil {
			return nil, err
		}
		return nil, ErrEsquemaEmpresaNoEncontrado
	}
	return &EmpresaStore{pool: pool, q: empresadb.New(pool)}, nil
}

// Close libera las conexiones.
func (s *EmpresaStore) Close() { s.pool.Close() }

// ---------------------------------------------------------------- eventos

func agruparBloques[T any](filas []T, idDe func(T) int32, aBloque func(T) (bloqueHorario, bool)) (map[int32][]bloqueHorario, map[int32]bool) {
	bloques := map[int32][]bloqueHorario{}
	ocupa := map[int32]bool{}
	for _, f := range filas {
		b, bloquea := aBloque(f)
		id := idDe(f)
		bloques[id] = append(bloques[id], b)
		if b.Tipo == tipoBloqueEvento {
			ocupa[id] = bloquea
		}
	}
	return bloques, ocupa
}

func (s *EmpresaStore) ObtenerEventos(ctx context.Context) ([]models.Evento, error) {
	// Las tres consultas son independientes: se lanzan a la vez (cada ida y vuelta a la base en la nube cuesta ~0,4 s)
	var (
		filas        []empresadb.ListarEventosRow
		bloquesFilas []empresadb.ListarBloquesEventosRow
		adicFilas    []empresadb.ListarAdicionalesEventosRow
	)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() (err error) { filas, err = s.q.ListarEventos(gctx); return })
	g.Go(func() (err error) { bloquesFilas, err = s.q.ListarBloquesEventos(gctx); return })
	g.Go(func() (err error) { adicFilas, err = s.q.ListarAdicionalesEventos(gctx); return })
	if err := g.Wait(); err != nil {
		return nil, err
	}
	bloques, ocupa := agruparBloques(bloquesFilas,
		func(b empresadb.ListarBloquesEventosRow) int32 { return b.IDEvento },
		func(b empresadb.ListarBloquesEventosRow) (bloqueHorario, bool) {
			return bloqueHorario{Tipo: b.Tipo, Inicio: b.Inicio, Fin: b.Fin}, b.Bloquea
		})
	adicionales := map[int32][]adicionalFila{}
	for _, a := range adicFilas {
		adicionales[a.IDEvento] = append(adicionales[a.IDEvento], adicionalFila{
			Codigo: a.Codigo, Nombre: a.Nombre, Unidad: a.Unidad, PrecioHora: a.PrecioHora, Cantidad: a.Cantidad, Inicio: a.Inicio, Fin: a.Fin,
		})
	}
	lista := make([]models.Evento, 0, len(filas))
	for _, f := range filas {
		lista = append(lista, eventoDeFilas(f, bloques[f.IDEvento], ocupa[f.IDEvento], adicionales[f.IDEvento]))
	}
	return lista, nil
}

func (s *EmpresaStore) ObtenerEventoPorID(ctx context.Context, id uint) (models.Evento, error) {
	return s.eventoPorID(ctx, s.q, int32(id))
}

func (s *EmpresaStore) eventoPorID(ctx context.Context, q *empresadb.Queries, id int32) (models.Evento, error) {
	var (
		fila         empresadb.ObtenerEventoRow
		bloquesFilas []empresadb.ListarBloquesDeEventoRow
		adicFilas    []empresadb.ListarAdicionalesDeEventoRow
	)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() (err error) { fila, err = q.ObtenerEvento(gctx, id); return })
	g.Go(func() (err error) { bloquesFilas, err = q.ListarBloquesDeEvento(gctx, id); return })
	g.Go(func() (err error) { adicFilas, err = q.ListarAdicionalesDeEvento(gctx, id); return })
	if err := g.Wait(); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Evento{}, repositories.ErrEventoNoEncontrado
		}
		return models.Evento{}, err
	}
	bloques, ocupa := agruparBloques(bloquesFilas,
		func(b empresadb.ListarBloquesDeEventoRow) int32 { return b.IDEvento },
		func(b empresadb.ListarBloquesDeEventoRow) (bloqueHorario, bool) {
			return bloqueHorario{Tipo: b.Tipo, Inicio: b.Inicio, Fin: b.Fin}, b.Bloquea
		})
	adicionales := make([]adicionalFila, 0, len(adicFilas))
	for _, a := range adicFilas {
		adicionales = append(adicionales, adicionalFila{
			Codigo: a.Codigo, Nombre: a.Nombre, Unidad: a.Unidad, PrecioHora: a.PrecioHora, Cantidad: a.Cantidad, Inicio: a.Inicio, Fin: a.Fin,
		})
	}
	return eventoDeFilas(empresadb.ListarEventosRow(fila), bloques[id], ocupa[id], adicionales), nil
}

// ---------------------------------------------------------------- clientes, bloqueos y catálogo

func (s *EmpresaStore) ObtenerClientes(ctx context.Context) ([]models.Cliente, error) {
	filas, err := s.q.ListarClientes(ctx)
	if err != nil {
		return nil, err
	}
	lista := make([]models.Cliente, 0, len(filas))
	for _, f := range filas {
		lista = append(lista, models.Cliente{ID: f.Codigo, RazonSocial: f.NombreRazonSocial})
	}
	return lista, nil
}

func (s *EmpresaStore) ObtenerBloqueos(ctx context.Context) ([]models.BloqueoInstitucional, error) {
	filas, err := s.q.ListarBloqueosActivos(ctx)
	if err != nil {
		return nil, err
	}
	lista := make([]models.BloqueoInstitucional, 0, len(filas))
	for _, f := range filas {
		lista = append(lista, bloqueosPorDia(f.IDBloqueo, f.Espacio, f.Tipo, f.Titulo, texto(f.Observaciones), f.Inicio, f.Fin)...)
	}
	return lista, nil
}

func (s *EmpresaStore) ObtenerAdicionales(ctx context.Context) ([]models.AdicionalCatalogo, error) {
	filas, err := s.q.ListarCatalogoAdicionales(ctx)
	if err != nil {
		return nil, err
	}
	lista := make([]models.AdicionalCatalogo, 0, len(filas))
	for _, f := range filas {
		lista = append(lista, models.AdicionalCatalogo{
			ID: f.Codigo, Nombre: f.Nombre, TarifaHora: f.PrecioHora, UnidadLabel: "Cantidad de unidades", Unidad: f.Unidad,
		})
	}
	return lista, nil
}

// ---------------------------------------------------------------- solicitudes de modificación


// solicitudesDeFilas arma las solicitudes de la API (con sus «antes y después») a partir de sus filas, leyendo las
// versiones ORIGINAL y PROPUESTA con sus bloques y adicionales.
func (s *EmpresaStore) solicitudesDeFilas(ctx context.Context, filas []empresadb.ListarSolicitudesModRow) ([]models.Solicitud, error) {
	if len(filas) == 0 {
		return []models.Solicitud{}, nil
	}
	var (
		versiones    []empresadb.ListarVersionesSolicitudesRow
		bloquesFilas []empresadb.ListarVersionBloquesSolicitudesRow
		adicFilas    []empresadb.ListarVersionAdicionalesSolicitudesRow
		eventos      []empresadb.ListarEventosRow // solo para el nombre del espacio de cada evento
	)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() (err error) { versiones, err = s.q.ListarVersionesSolicitudes(gctx); return })
	g.Go(func() (err error) { bloquesFilas, err = s.q.ListarVersionBloquesSolicitudes(gctx); return })
	g.Go(func() (err error) { adicFilas, err = s.q.ListarVersionAdicionalesSolicitudes(gctx); return })
	g.Go(func() (err error) { eventos, err = s.q.ListarEventos(gctx); return })
	if err := g.Wait(); err != nil {
		return nil, err
	}
	espacioDe := map[int32]string{}
	for _, e := range eventos {
		espacioDe[e.IDEvento] = e.Espacio
	}

	bloquesDe := map[int32][]bloqueHorario{}
	for _, b := range bloquesFilas {
		bloquesDe[b.IDVersion] = append(bloquesDe[b.IDVersion], bloqueHorario{Tipo: b.Tipo, Inicio: b.Inicio, Fin: b.Fin})
	}
	adicDe := map[int32][]adicionalFila{}
	for _, a := range adicFilas {
		adicDe[a.IDVersion] = append(adicDe[a.IDVersion], adicionalFila{
			Codigo: a.Codigo, Nombre: a.Nombre, Unidad: a.Unidad, PrecioHora: a.PrecioHora, Cantidad: a.Cantidad, Inicio: a.Inicio, Fin: a.Fin,
		})
	}
	// versiones por solicitud y tipo
	type clave struct {
		sol  int32
		tipo string
	}
	versionDe := map[clave]empresadb.ListarVersionesSolicitudesRow{}
	for _, v := range versiones {
		if v.IDSolicitudMod.Valid {
			versionDe[clave{v.IDSolicitudMod.Int32, v.Tipo}] = v
		}
	}
	datosDe := func(v empresadb.ListarVersionesSolicitudesRow, espacio string) models.DatosHorario {
		d := models.DatosHorario{
			Nombre: v.NombreEvento, Espacio: espacio, Contacto: v.Contacto,
			Telefono: texto(v.Telefono), Correo: texto(v.Correo), Observaciones: texto(v.Observaciones),
			Adicionales: adicionalesAItems(adicDe[v.IDVersion]),
		}
		aplicarBloques(&d, bloquesDe[v.IDVersion])
		return d
	}

	lista := make([]models.Solicitud, 0, len(filas))
	for _, f := range filas {
		sol := models.Solicitud{
			ID:            uint(f.IDSolicitudMod),
			Codigo:        f.Codigo,
			EventoID:      uint(f.IDEvento),
			SolicitanteID: uint(f.SolicitanteUsuario),
			Motivo:        f.Motivo,
			Estado:        estadoSolicitudDeBD(f.Estado),
			FechaCreacion: f.EnviadaEn.In(zonaLimaBD).Format(time.RFC3339),
		}
		if f.RetiradaEn.Valid {
			sol.FechaRetiro = f.RetiradaEn.Time.In(zonaLimaBD).Format(time.RFC3339)
		}
		espacio := espacioDe[f.IDEvento]
		if v, ok := versionDe[clave{f.IDSolicitudMod, versionOriginal}]; ok {
			sol.DatosOriginales = datosDe(v, espacio)
		}
		if v, ok := versionDe[clave{f.IDSolicitudMod, versionPropuesta}]; ok {
			p := datosDe(v, espacio)
			sol.DatosPropuestos = p
			sol.FechaPropuesta, sol.HoraInicioPropuesta, sol.HoraFinPropuesta = p.Fecha, p.HoraInicio, p.HoraFin
			sol.InformacionGeneralPropuesta = models.InformacionGeneralPropuestaDTO{
				Nombre: p.Nombre, Contacto: p.Contacto, Telefono: p.Telefono, Correo: p.Correo, Observaciones: p.Observaciones,
			}
			sol.TiemposTecnicosPropuestos = &models.TiemposTecnicosPropuestosDTO{
				HasMontaje: p.HasMontaje, MontajeFecha: p.MontajeFecha, MontajeHoraInicio: p.MontajeHoraInicio, MontajeHoraFin: p.MontajeHoraFin,
				HasDesmontaje: p.HasDesmontaje, DesmontajeFecha: p.DesmontajeFecha, DesmontajeHoraInicio: p.DesmontajeHoraInicio, DesmontajeHoraFin: p.DesmontajeHoraFin,
				HasEnsayo: p.HasEnsayo, EnsayoFecha: p.EnsayoFecha, EnsayoHoraInicio: p.EnsayoHoraInicio, EnsayoHoraFin: p.EnsayoHoraFin,
			}
			propuestos := make([]models.AdicionalPropuestoDTO, 0, len(p.Adicionales))
			for _, a := range p.Adicionales {
				propuestos = append(propuestos, models.AdicionalPropuestoDTO{ID: a.ID, Cantidad: a.Cantidad, Horas: a.Horas})
			}
			sol.AdicionalesPropuestos = &propuestos
		}
		lista = append(lista, sol)
	}
	return lista, nil
}

func (s *EmpresaStore) ObtenerSolicitudes(ctx context.Context) ([]models.Solicitud, error) {
	filas, err := s.q.ListarSolicitudesMod(ctx)
	if err != nil {
		return nil, err
	}
	return s.solicitudesDeFilas(ctx, filas)
}

func (s *EmpresaStore) solicitudPorID(ctx context.Context, id int32) (models.Solicitud, error) {
	fila, err := s.q.ObtenerSolicitudMod(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Solicitud{}, repositories.ErrSolicitudNoEncontrada
	}
	if err != nil {
		return models.Solicitud{}, err
	}
	lista, err := s.solicitudesDeFilas(ctx, []empresadb.ListarSolicitudesModRow{empresadb.ListarSolicitudesModRow(fila)})
	if err != nil || len(lista) == 0 {
		return models.Solicitud{}, err
	}
	return lista[0], nil
}

// Nombres de las restricciones de la base que se traducen a errores de dominio.
const (
	restriccionPendienteUnica = "un_solicitud_mod_pendiente"
	restriccionCodigoUnico    = "solicitud_modificacion_codigo_key"
)

// CrearSolicitud guarda la solicitud y sus dos versiones (ORIGINAL y PROPUESTA) en una sola transacción. La base
// garantiza que haya a lo sumo una solicitud PENDIENTE por evento (índice único parcial), también con peticiones
// simultáneas. El código (SOLM-AAAA-NNNN) se calcula aquí; si dos peticiones eligen el mismo número, se reintenta.
func (s *EmpresaStore) CrearSolicitud(ctx context.Context, sol models.Solicitud) (models.Solicitud, error) {
	if sol.SolicitanteID == 0 {
		return models.Solicitud{}, repositories.ErrSolicitanteNoRegistrado
	}
	const maxIntentos = 5
	for intento := 0; intento < maxIntentos; intento++ {
		insertada, err := s.insertarSolicitud(ctx, sol)
		if err == nil {
			// Se devuelve lo que ya se sabe (más lo que asignó la base): releer todas las solicitudes costaba más de un segundo.
			creada := sol
			creada.ID = uint(insertada.ID)
			creada.Codigo = insertada.Codigo
			creada.Estado = models.EstadoPendienteRevision
			creada.FechaCreacion = insertada.EnviadaEn.In(zonaLimaBD).Format(time.RFC3339)
			return creada, nil
		}
		if esViolacionDe(err, pgViolacionUnica, restriccionCodigoUnico) {
			continue // otra petición tomó el mismo número de código: se recalcula
		}
		return models.Solicitud{}, err
	}
	return models.Solicitud{}, errors.New("no se pudo asignar un código único a la solicitud")
}

// solicitudInsertada es lo que la base asigna al guardar una solicitud.
type solicitudInsertada struct {
	ID        int32
	Codigo    string
	EnviadaEn time.Time
}

func (s *EmpresaStore) insertarSolicitud(ctx context.Context, sol models.Solicitud) (solicitudInsertada, error) {
	var vacia solicitudInsertada
	versiones, bloques, adicionales, err := documentosDeVersiones(sol)
	if err != nil {
		return vacia, err
	}
	// Cada ida y vuelta a la base cuesta ~0,3 s (São Paulo): la solicitud, sus dos versiones, todos sus bloques de horario y sus
	// adicionales se guardan con UNA sola consulta, que es atómica por sí misma (no hace falta una transacción aparte).
	anio := time.Now().In(zonaLimaBD).Year()
	fila, err := s.q.CrearSolicitudModCompleta(ctx, empresadb.CrearSolicitudModCompletaParams{
		Prefijo:     fmt.Sprintf("SOLM-%d-", anio),
		IDEvento:    int32(sol.EventoID),
		Solicitante: int32(sol.SolicitanteID),
		Motivo:      sol.Motivo,
		Versiones:   versiones,
		Bloques:     bloques,
		Adicionales: adicionales,
	})
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return vacia, repositories.ErrEventoNoEncontrado // el evento no existe: la consulta no insertó nada
	case esViolacionDe(err, pgViolacionUnica, restriccionPendienteUnica):
		return vacia, repositories.ErrSolicitudPendienteDuplicada
	case esViolacionDe(err, pgViolacionFK, ""):
		return vacia, repositories.ErrEventoNoEncontrado
	case err != nil:
		return vacia, err
	}
	return solicitudInsertada{ID: fila.IDSolicitudMod, Codigo: fila.Codigo, EnviadaEn: fila.EnviadaEn}, nil
}

const formatoMomentoBD = "2006-01-02T15:04:05" // hora de pared de Lima, sin zona (columnas timestamp)

// documentosDeVersiones arma los documentos JSON que recibe CrearSolicitudModCompleta: las dos versiones (ORIGINAL y PROPUESTA),
// todos sus bloques de horario y todos sus adicionales.
func documentosDeVersiones(sol models.Solicitud) (versiones, bloques, adicionales []byte, err error) {
	type versionJSON struct {
		Tipo          string `json:"tipo"`
		Delta         int32  `json:"delta"` // 0 = versión actual del evento, 1 = la siguiente (propuesta)
		Nombre        string `json:"nombre"`
		Contacto      string `json:"contacto"`
		Telefono      string `json:"telefono"`
		Correo        string `json:"correo"`
		Observaciones string `json:"observaciones"`
	}
	type bloqueJSON struct {
		Version string `json:"version"`
		Tipo    string `json:"tipo"`
		Inicio  string `json:"inicio"`
		Fin     string `json:"fin"`
	}
	type adicionalJSON struct {
		Version  string `json:"version"`
		Codigo   string `json:"codigo"`
		Cantidad int32  `json:"cantidad"`
		Inicio   string `json:"inicio"`
		Fin      string `json:"fin"`
	}
	origen := []struct {
		tipo  string
		delta int32
		datos models.DatosHorario
	}{
		{versionOriginal, 0, sol.DatosOriginales},
		{versionPropuesta, 1, sol.DatosPropuestos},
	}
	listaVersiones := make([]versionJSON, 0, len(origen))
	listaBloques := []bloqueJSON{}
	listaAdicionales := []adicionalJSON{}
	for _, o := range origen {
		d := o.datos
		listaVersiones = append(listaVersiones, versionJSON{o.tipo, o.delta, d.Nombre, d.Contacto, d.Telefono, d.Correo, d.Observaciones})
		bloquesDeVersion, err := bloquesDeDatos(d)
		if err != nil {
			return nil, nil, nil, err
		}
		var inicioEvento time.Time
		for _, b := range bloquesDeVersion {
			if b.Tipo == tipoBloqueEvento {
				inicioEvento = b.Inicio
			}
			listaBloques = append(listaBloques, bloqueJSON{o.tipo, b.Tipo, b.Inicio.Format(formatoMomentoBD), b.Fin.Format(formatoMomentoBD)})
		}
		// Los adicionales se usan desde el inicio del evento durante las horas indicadas
		for _, a := range d.Adicionales {
			listaAdicionales = append(listaAdicionales, adicionalJSON{
				o.tipo, a.ID, int32(a.Cantidad),
				inicioEvento.Format(formatoMomentoBD), inicioEvento.Add(time.Duration(a.Horas) * time.Hour).Format(formatoMomentoBD),
			})
		}
	}
	if versiones, err = json.Marshal(listaVersiones); err != nil {
		return nil, nil, nil, err
	}
	if bloques, err = json.Marshal(listaBloques); err != nil {
		return nil, nil, nil, err
	}
	if adicionales, err = json.Marshal(listaAdicionales); err != nil {
		return nil, nil, nil, err
	}
	return versiones, bloques, adicionales, nil
}

func (s *EmpresaStore) RetirarSolicitud(ctx context.Context, id uint, fechaRetiro string) (models.Solicitud, error) {
	retirada, err := time.Parse(time.RFC3339, fechaRetiro)
	if err != nil {
		retirada = time.Now()
	}
	_, err = s.q.RetirarSolicitudMod(ctx, empresadb.RetirarSolicitudModParams{
		IDSolicitudMod: int32(id),
		RetiradaEn:     pgtype.Timestamptz{Time: retirada, Valid: true},
	})
	if err == nil {
		return s.solicitudPorID(ctx, int32(id))
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return models.Solicitud{}, err
	}
	// Ninguna fila cambió: o no existe, o ya no estaba pendiente
	existe, err := s.q.ExisteSolicitudMod(ctx, int32(id))
	if err != nil {
		return models.Solicitud{}, err
	}
	if !existe {
		return models.Solicitud{}, repositories.ErrSolicitudNoEncontrada
	}
	return models.Solicitud{}, repositories.ErrSolicitudNoPendiente
}

// esViolacionDe indica si el error es una violación del código de PostgreSQL indicado y, si se pide, de la restricción
// con ese nombre.
func esViolacionDe(err error, codigo, restriccion string) bool {
	var pgErr interface {
		error
		SQLState() string
	}
	if !errors.As(err, &pgErr) || pgErr.SQLState() != codigo {
		return false
	}
	if restriccion == "" {
		return true
	}
	return strings.Contains(err.Error(), restriccion)
}

// ---------------------------------------------------------------- cuentas de demostración

// UsuariosDemo devuelve las cuentas de la tabla `usuario` que tienen el rol de asesor comercial o de cliente, como
// usuarios del módulo, todas con la misma contraseña de demostración (bcrypt). Las contraseñas reales de la base de
// datos son de ejemplo (HASH_EJEMPLO) y no sirven para entrar; la autenticación completa contra las tablas de acceso de
// la empresa está pendiente, por eso estas cuentas viven solo en memoria y NUNCA se escriben en la base de datos.
func (s *EmpresaStore) UsuariosDemo(ctx context.Context, clave string) ([]models.Usuario, error) {
	filas, err := s.q.ListarUsuariosConRol(ctx)
	if err != nil {
		return nil, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(clave), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	vistos := map[int32]bool{}
	var usuarios []models.Usuario
	for _, f := range filas {
		var rol string
		switch f.Rol {
		case "ASESOR_COMERCIAL":
			rol = models.RolAsesor
		case "CLIENTE":
			rol = models.RolCliente
		default:
			continue
		}
		if vistos[f.IDUsuario] {
			continue
		}
		vistos[f.IDUsuario] = true
		nombre := strings.TrimSpace(f.Nombres + " " + texto(f.Apellidos))
		usuarios = append(usuarios, models.Usuario{
			ID: uint(f.IDUsuario), Correo: strings.ToLower(strings.TrimSpace(texto(f.Correo))), Nombre: nombre,
			Rol: rol, ClienteID: texto(f.ClienteCodigo), PasswordHash: string(hash),
		})
	}
	return usuarios, nil
}
