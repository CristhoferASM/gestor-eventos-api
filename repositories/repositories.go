package repositories

import (
	"context"
	"errors"

	"gestor-eventos-api/models"
)

var (
	// ErrEventoNoEncontrado indica que no existe un evento con el identificador solicitado.
	ErrEventoNoEncontrado = errors.New("evento no encontrado")

	// ErrSolicitudNoEncontrada indica que no existe una solicitud con el identificador pedido.
	ErrSolicitudNoEncontrada = errors.New("solicitud no encontrada")

	// ErrSolicitudNoPendiente indica que la solicitud ya no está en estado pendiente de revisión.
	ErrSolicitudNoPendiente = errors.New("la solicitud ya no está pendiente de revisión")

	// ErrSolicitudPendienteDuplicada indica que el evento ya tiene una solicitud en estado pendiente de revisión.
	ErrSolicitudPendienteDuplicada = errors.New("ya existe una solicitud pendiente de revisión para este evento")
)

// EventoRepository define las operaciones de consulta de eventos.
type EventoRepository interface {
	ObtenerEventos(ctx context.Context) ([]models.Evento, error)
	ObtenerEventoPorID(ctx context.Context, id uint) (models.Evento, error)
}

// ClienteRepository define la consulta de los clientes registrados (ordenados por id).
type ClienteRepository interface {
	ObtenerClientes(ctx context.Context) ([]models.Cliente, error)
}

// AdicionalRepository define la consulta del catálogo de adicionales (recursos técnicos con su tarifa por hora).
type AdicionalRepository interface {
	ObtenerAdicionales(ctx context.Context) ([]models.AdicionalCatalogo, error)
}

// BloqueoRepository define la consulta de bloqueos institucionales del auditorio.
type BloqueoRepository interface {
	ObtenerBloqueos(ctx context.Context) ([]models.BloqueoInstitucional, error)
}

// SolicitudRepository define las operaciones de persistencia y consulta de solicitudes de modificación.
type SolicitudRepository interface {
	ObtenerSolicitudes(ctx context.Context) ([]models.Solicitud, error)
	CrearSolicitud(ctx context.Context, sol models.Solicitud) (models.Solicitud, error)
	// RetirarSolicitud pasa de forma atómica una solicitud pendiente a "Retirada por el cliente".
	// Devuelve ErrSolicitudNoEncontrada o ErrSolicitudNoPendiente.
	RetirarSolicitud(ctx context.Context, id uint, fechaRetiro string) (models.Solicitud, error)
}

var (
	// ErrUsuarioNoEncontrado indica que no existe un usuario con el correo indicado.
	ErrUsuarioNoEncontrado = errors.New("usuario no encontrado")

	// ErrDesafioNoEncontrado indica que el desafío de verificación no existe o ya fue consumido.
	ErrDesafioNoEncontrado = errors.New("desafío de verificación no encontrado")

	// ErrSesionNoEncontrada indica que no existe una sesión con ese token.
	ErrSesionNoEncontrada = errors.New("sesión no encontrada")
)

// UsuarioRepository define la consulta de usuarios por correo (ya normalizado en minúsculas).
type UsuarioRepository interface {
	ObtenerUsuarioPorCorreo(ctx context.Context, correo string) (models.Usuario, error)
	GuardarUsuario(ctx context.Context, u models.Usuario) error
	ObtenerUsuarios(ctx context.Context) ([]models.Usuario, error)
}

// SesionRepository define la persistencia de desafíos de verificación y sesiones autenticadas.
type SesionRepository interface {
	GuardarDesafio(ctx context.Context, d models.DesafioVerificacion) error
	ObtenerDesafio(ctx context.Context, id string) (models.DesafioVerificacion, error)
	EliminarDesafio(ctx context.Context, id string) error

	// GuardarVerificacionDiaria recuerda que en ese navegador (dispositivoID) la cuenta verificó su código el día indicado (YYYY-MM-DD, hora de Lima).
	GuardarVerificacionDiaria(ctx context.Context, dispositivoID, correo, dia string) error
	// ObtenerVerificacionDiaria devuelve el día de la última verificación, o "" si no hay.
	ObtenerVerificacionDiaria(ctx context.Context, dispositivoID, correo string) (string, error)

	GuardarSesion(ctx context.Context, s models.Sesion) error
	ObtenerSesion(ctx context.Context, token string) (models.Sesion, error)
	EliminarSesion(ctx context.Context, token string) error
}
