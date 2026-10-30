package services

import (
	"errors"

	"gestor-eventos-api/repositories"
)

var (
	// ErrDatosInvalidos identifica errores de validación de entrada o reglas de negocio (HTTP 400).
	ErrDatosInvalidos = errors.New("datos de entrada inválidos")

	// ErrEventoNoEncontrado reexporta el error de repositorio cuando un evento no existe (HTTP 404).
	ErrEventoNoEncontrado = repositories.ErrEventoNoEncontrado

	// ErrSolicitudPendienteDuplicada reexporta el error de repositorio cuando ya existe una solicitud pendiente (HTTP 409).
	ErrSolicitudPendienteDuplicada = repositories.ErrSolicitudPendienteDuplicada
)

// ErrorValidacion encapsula un mensaje de validación legible conservando la identificación mediante errors.Is y errors.As.
type ErrorValidacion struct {
	Mensaje string
}

func (e *ErrorValidacion) Error() string {
	return e.Mensaje
}

func (e *ErrorValidacion) Unwrap() error {
	return ErrDatosInvalidos
}

func nuevoErrorValidacion(mensaje string) error {
	return &ErrorValidacion{Mensaje: mensaje}
}

