package storage

import (
	"fmt"
	"sort"
	"sync"

	"gestor-eventos-api/models"
)

// Store gestiona el almacenamiento en memoria protegido contra accesos concurrentes mediante RWMutex
type Store struct {
	mu          sync.RWMutex
	eventos     map[uint]models.Evento
	solicitudes []models.Solicitud
	nextSolID   uint
}

// NewMemoryStore inicializa el almacenamiento con dos eventos iniciales de SHOWTECH SOLUTIONS
func NewMemoryStore() *Store {
	s := &Store{
		eventos:     make(map[uint]models.Evento),
		solicitudes: make([]models.Solicitud, 0),
		nextSolID:   1,
	}

	// Dos eventos iniciales de demostración
	s.eventos[1] = models.Evento{
		ID:         1,
		Nombre:     "Lanzamiento Corporativo Showtech 2026",
		Espacio:    "Auditorio Principal A",
		Fecha:      "2026-11-15",
		HoraInicio: "09:00",
		HoraFin:    "13:00",
		Estado:     "Confirmado",
	}

	s.eventos[2] = models.Evento{
		ID:         2,
		Nombre:     "Taller de Producción Escénica y Luces",
		Espacio:    "Sala de Capacitación B",
		Fecha:      "2026-11-20",
		HoraInicio: "14:00",
		HoraFin:    "18:00",
		Estado:     "Confirmado",
	}

	return s
}

// ObtenerEventos devuelve la lista de eventos ordenados por ID de forma segura
func (s *Store) ObtenerEventos() []models.Evento {
	s.mu.RLock()
	defer s.mu.RUnlock()

	lista := make([]models.Evento, 0, len(s.eventos))
	for _, e := range s.eventos {
		lista = append(lista, e)
	}

	sort.Slice(lista, func(i, j int) bool {
		return lista[i].ID < lista[j].ID
	})

	return lista
}

// ObtenerEventoPorID busca un evento por su ID
func (s *Store) ObtenerEventoPorID(id uint) (models.Evento, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	evento, existe := s.eventos[id]
	return evento, existe
}

// TieneSolicitudPendiente verifica si existe alguna solicitud pendiente para un evento dado
func (s *Store) TieneSolicitudPendiente(eventoID uint) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, sol := range s.solicitudes {
		if sol.EventoID == eventoID && sol.Estado == "Pendiente de revisión" {
			return true
		}
	}
	return false
}

// CrearSolicitud guarda una nueva solicitud asignando ID secuencial e impidiendo duplicados pendientes concurrentes
func (s *Store) CrearSolicitud(sol models.Solicitud) (models.Solicitud, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Validación atómica bajo bloqueo de escritura
	for _, existing := range s.solicitudes {
		if existing.EventoID == sol.EventoID && existing.Estado == "Pendiente de revisión" {
			return models.Solicitud{}, fmt.Errorf("ya existe una solicitud pendiente de revisión para el evento %d", sol.EventoID)
		}
	}

	sol.ID = s.nextSolID
	s.nextSolID++

	s.solicitudes = append(s.solicitudes, sol)
	return sol, nil
}

// ObtenerSolicitudes devuelve una copia de todas las solicitudes registradas
func (s *Store) ObtenerSolicitudes() []models.Solicitud {
	s.mu.RLock()
	defer s.mu.RUnlock()

	copia := make([]models.Solicitud, len(s.solicitudes))
	copy(copia, s.solicitudes)
	return copia
}
