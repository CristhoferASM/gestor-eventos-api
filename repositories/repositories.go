package repositories

import (
	"context"
	"errors"

	"gestor-eventos-api/models"
)

var (
	// ErrEventoNoEncontrado indica que no existe un evento con el identificador solicitado.
	ErrEventoNoEncontrado = errors.New("evento no encontrado")

	// ErrSolicitudPendienteDuplicada indica que el evento ya tiene una solicitud en estado pendiente de revisión.
	ErrSolicitudPendienteDuplicada = errors.New("ya existe una solicitud pendiente de revisión para este evento")
)

// EventoRepository define las operaciones de consulta de eventos.
type EventoRepository interface {
	ObtenerEventos(ctx context.Context) ([]models.Evento, error)
	ObtenerEventoPorID(ctx context.Context, id uint) (models.Evento, error)
}

// SolicitudRepository define las operaciones de persistencia y consulta de solicitudes de modificación.
type SolicitudRepository interface {
	ObtenerSolicitudes(ctx context.Context) ([]models.Solicitud, error)
	CrearSolicitud(ctx context.Context, sol models.Solicitud) (models.Solicitud, error)
}

