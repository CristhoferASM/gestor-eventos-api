package services

import (
	"context"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"
)

// EventoService coordina la lógica de consulta de eventos.
type EventoService struct {
	eventoRepo repositories.EventoRepository
}

// NewEventoService crea una nueva instancia de EventoService.
func NewEventoService(eventoRepo repositories.EventoRepository) *EventoService {
	return &EventoService{
		eventoRepo: eventoRepo,
	}
}

// ObtenerEventos retorna el listado de eventos disponibles garantizando un slice no nulo.
func (s *EventoService) ObtenerEventos(ctx context.Context) ([]models.Evento, error) {
	eventos, err := s.eventoRepo.ObtenerEventos(ctx)
	if err != nil {
		return nil, err
	}
	if eventos == nil {
		return make([]models.Evento, 0), nil
	}
	return eventos, nil
}

// ObtenerEventoPorID valida el identificador y consulta el detalle de un evento específico.
func (s *EventoService) ObtenerEventoPorID(ctx context.Context, id uint) (models.Evento, error) {
	if id == 0 {
		return models.Evento{}, nuevoErrorValidacion("El identificador del evento debe ser un número entero positivo.")
	}
	return s.eventoRepo.ObtenerEventoPorID(ctx, id)
}
