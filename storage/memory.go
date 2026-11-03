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
)

// Store gestiona el almacenamiento en memoria protegido contra accesos concurrentes mediante RWMutex
type Store struct {
	mu          sync.RWMutex
	eventos     map[uint]models.Evento
	solicitudes []models.Solicitud
	nextSolID   uint
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

	// Dos eventos iniciales de demostración (datos de contacto, observaciones y tiempos técnicos para desarrollo)
	s.eventos[1] = models.Evento{
		ID:                   1,
		Nombre:               "Lanzamiento Corporativo Showtech 2026",
		Espacio:              "Auditorio Principal A",
		Fecha:                "2026-11-15",
		HoraInicio:           "09:00",
		HoraFin:              "13:00",
		Estado:               "Confirmado",
		Contacto:             "María Rodríguez",
		Telefono:             "998 765 432",
		Correo:               "m.rodriguez@demo-showtech.test",
		Observaciones:        "Disposición de silletería para 200 personas, atril central y 2 micrófonos inalámbricos.",
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
	}

	s.eventos[2] = models.Evento{
		ID:                   2,
		Nombre:               "Taller de Producción Escénica y Luces",
		Espacio:              "Sala de Capacitación B",
		Fecha:                "2026-11-20",
		HoraInicio:           "14:00",
		HoraFin:              "18:00",
		Estado:               "Confirmado",
		Contacto:             "Carlos Duarte",
		Telefono:             "997 654 321",
		Correo:               "c.duarte@demo-showtech.test",
		Observaciones:        "Proyección multimedia activa, consola de iluminación DMX y mesa con 4 micrófonos.",
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
