package storage

import (
	"context"
	"sort"
	"sync"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"
)

var (
	_ repositories.EventoRepository    = (*Store)(nil)
	_ repositories.SolicitudRepository = (*Store)(nil)
	_ repositories.BloqueoRepository   = (*Store)(nil)
)

// Store gestiona el almacenamiento en memoria protegido contra accesos concurrentes mediante RWMutex
type Store struct {
	mu          sync.RWMutex
	eventos     map[uint]models.Evento
	solicitudes []models.Solicitud
	nextSolID   uint

	bloqueos []models.BloqueoInstitucional
	verifDiaria map[string]string // clave: dispositivo|correo -> día de Lima

	// Autenticación (se inicializan de forma perezosa en auth_memory.go)
	usuarios map[string]models.Usuario // clave: correo en minúsculas
	desafios map[string]models.DesafioVerificacion
	sesiones map[string]models.Sesion
}

// NewEmptyMemoryStore inicializa un almacenamiento en memoria sin eventos ni solicitudes cargadas.
func NewEmptyMemoryStore() *Store {
	return &Store{
		eventos:     make(map[uint]models.Evento),
		solicitudes: make([]models.Solicitud, 0),
		nextSolID:   1,
	}
}

// NewMemoryStore inicializa el almacenamiento con dos eventos iniciales de SHOWTECH SOLUTIONS.
// Los datos de contacto, teléfono, correo y observaciones son datos ficticios de prueba para desarrollo.
func NewMemoryStore() *Store {
	s := NewEmptyMemoryStore()

	// Bloqueo institucional del prototipo (BLK-001)
	s.bloqueos = []models.BloqueoInstitucional{{
		ID: "BLK-001", Titulo: "Mantenimiento preventivo e iluminación institucional", Espacio: "Auditorio Showtech",
		Fecha: "2026-11-06", HoraInicio: "14:00", HoraFin: "17:00", Tipo: "Bloqueo institucional",
		Notas: "Calibración de consolas de audio digital, reflectores y cambio de lámparas.",
	}}

	// Dos eventos iniciales de demostración (datos de contacto, observaciones y tiempos técnicos para desarrollo)
	s.eventos[1] = models.Evento{
		ID:                   1,
		ClienteID:            "CLI-001",
		Nombre:               "Ceremonia de graduación",
		Espacio:              "Auditorio Showtech",
		Fecha:                "2026-11-15",
		HoraInicio:           "09:00",
		HoraFin:              "13:00",
		Estado:               "Confirmado",
		Contacto:             "María Rodríguez",
		Telefono:             "998 765 432",
		Correo:               "m.rodriguez@demo-showtech.test",
		Observaciones:        "Disposición de silletería para 350 personas, atril central y 2 micrófonos inalámbricos.",
		HasMontaje:           true,
		MontajeFecha:         "2026-11-15",
		MontajeHoraInicio:    "08:00",
		MontajeHoraFin:       "09:00",
		HasDesmontaje:        true,
		DesmontajeFecha:      "2026-11-15",
		DesmontajeHoraInicio: "13:00",
		DesmontajeHoraFin:    "14:00",
		HasEnsayo:            false,
		EnsayoFecha:          "",
		EnsayoHoraInicio:     "",
		EnsayoHoraFin:        "",
		Adicionales: []models.AdicionalItem{
			{
				ID:         "cochera",
				Nombre:     "Cochera",
				Unidad:     "unidad",
				Cantidad:   1,
				Horas:      4,
				TarifaHora: 10.0,
				Subtotal:   40.0,
			},
		},
	}

	s.eventos[2] = models.Evento{
		ID:                   2,
		ClienteID:            "CLI-002",
		Nombre:               "Encuentro de docentes",
		Espacio:              "Auditorio Showtech",
		Fecha:                "2026-11-20",
		HoraInicio:           "14:00",
		HoraFin:              "18:00",
		Estado:               "Confirmado",
		Contacto:             "Prof. Carlos Duarte",
		Telefono:             "997 654 321",
		Correo:               "c.duarte@demo-showtech.test",
		Observaciones:        "Proyección multimedia activa, sonido ambiental y mesa principal con 6 micrófonos.",
		HasMontaje:           false,
		MontajeFecha:         "",
		MontajeHoraInicio:    "",
		MontajeHoraFin:       "",
		HasDesmontaje:        false,
		DesmontajeFecha:      "",
		DesmontajeHoraInicio: "",
		DesmontajeHoraFin:    "",
		HasEnsayo:            false,
		EnsayoFecha:          "",
		EnsayoHoraInicio:     "",
		EnsayoHoraFin:        "",
		Adicionales:          []models.AdicionalItem{},
	}

	return s
}

// ObtenerEventos devuelve la lista de eventos ordenados por ID de forma segura
func (s *Store) ObtenerEventos(ctx context.Context) ([]models.Evento, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	lista := make([]models.Evento, 0, len(s.eventos))
	for _, e := range s.eventos {
		lista = append(lista, e)
	}

	sort.Slice(lista, func(i, j int) bool {
		return lista[i].ID < lista[j].ID
	})

	return lista, nil
}

// ObtenerEventoPorID busca un evento por su ID
func (s *Store) ObtenerEventoPorID(ctx context.Context, id uint) (models.Evento, error) {
	if err := ctx.Err(); err != nil {
		return models.Evento{}, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	evento, existe := s.eventos[id]
	if !existe {
		return models.Evento{}, repositories.ErrEventoNoEncontrado
	}
	return evento, nil
}

// CrearSolicitud guarda una nueva solicitud asignando ID secuencial e impidiendo duplicados pendientes concurrentes
func (s *Store) CrearSolicitud(ctx context.Context, sol models.Solicitud) (models.Solicitud, error) {
	if err := ctx.Err(); err != nil {
		return models.Solicitud{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, existe := s.eventos[sol.EventoID]; !existe {
		return models.Solicitud{}, repositories.ErrEventoNoEncontrado
	}

	// Validación atómica bajo bloqueo de escritura
	for _, existing := range s.solicitudes {
		if existing.EventoID == sol.EventoID && existing.Estado == models.EstadoPendienteRevision {
			return models.Solicitud{}, repositories.ErrSolicitudPendienteDuplicada
		}
	}

	sol.ID = s.nextSolID
	s.nextSolID++

	s.solicitudes = append(s.solicitudes, sol)
	return sol, nil
}

// ObtenerSolicitudes devuelve una copia de todas las solicitudes registradas
func (s *Store) ObtenerSolicitudes(ctx context.Context) ([]models.Solicitud, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	copia := make([]models.Solicitud, len(s.solicitudes))
	copy(copia, s.solicitudes)
	return copia, nil
}

// RetirarSolicitud cambia a "Retirada por el cliente" una solicitud pendiente, de forma atómica.
// No elimina nada: conserva motivo, snapshots y código; el evento queda libre para una nueva solicitud.
func (s *Store) RetirarSolicitud(ctx context.Context, id uint, fechaRetiro string) (models.Solicitud, error) {
	if err := ctx.Err(); err != nil {
		return models.Solicitud{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.solicitudes {
		if s.solicitudes[i].ID != id {
			continue
		}
		if s.solicitudes[i].Estado != models.EstadoPendienteRevision {
			return models.Solicitud{}, repositories.ErrSolicitudNoPendiente
		}
		s.solicitudes[i].Estado = models.EstadoRetiradaCliente
		s.solicitudes[i].FechaRetiro = fechaRetiro
		return s.solicitudes[i], nil
	}
	return models.Solicitud{}, repositories.ErrSolicitudNoEncontrada
}

// ObtenerBloqueos devuelve una copia de los bloqueos institucionales.
func (s *Store) ObtenerBloqueos(ctx context.Context) ([]models.BloqueoInstitucional, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	copia := make([]models.BloqueoInstitucional, len(s.bloqueos))
	copy(copia, s.bloqueos)
	return copia, nil
}

// AgregarBloqueo registra un bloqueo institucional (útil en pruebas).
func (s *Store) AgregarBloqueo(b models.BloqueoInstitucional) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.bloqueos = append(s.bloqueos, b)
}
