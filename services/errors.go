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

var (
	// ErrCredencialesInvalidas indica correo o contraseña incorrectos (HTTP 401). No distingue cuál falló.
	ErrCredencialesInvalidas = errors.New("correo o contraseña incorrectos")

	// ErrDesafioInvalido indica que el desafío de verificación no existe o ya fue usado (HTTP 401).
	ErrDesafioInvalido = errors.New("la verificación no es válida o ya fue utilizada; vuelve a iniciar sesión")

	// ErrCodigoIncorrecto indica que el código ingresado no coincide (HTTP 401).
	ErrCodigoIncorrecto = errors.New("el código de verificación es incorrecto")

	// ErrCodigoExpirado indica que el código venció y debe solicitarse uno nuevo (HTTP 401).
	ErrCodigoExpirado = errors.New("el código de verificación expiró; solicita uno nuevo")

	// ErrDemasiadosIntentos indica que se agotaron los intentos de código (HTTP 429).
	ErrDemasiadosIntentos = errors.New("demasiados intentos fallidos; vuelve a iniciar sesión")

	// ErrReenvioMuyPronto indica que aún no pasó el tiempo mínimo para reenviar el código (HTTP 429).
	ErrReenvioMuyPronto = errors.New("espera unos segundos antes de solicitar un nuevo código")

	// ErrTokenGoogleInvalido indica un ID token de Google/Firebase inválido, vencido o de otro proyecto (HTTP 401).
	ErrTokenGoogleInvalido = errors.New("no se pudo validar la cuenta de Google")

	// ErrCorreoGoogleNoVerificado indica que Google no verificó el correo de la cuenta (HTTP 401).
	ErrCorreoGoogleNoVerificado = errors.New("el correo de la cuenta de Google no está verificado")

	// ErrCuentaConContrasena indica que el correo ya pertenece a una cuenta con contraseña y no puede entrar por Google (HTTP 403).
	ErrCuentaConContrasena = errors.New("ese correo está registrado con contraseña; inicia sesión con correo y contraseña")

	// ErrGoogleNoDisponible indica que el acceso con Google no está configurado en el servidor (HTTP 503).
	ErrGoogleNoDisponible = errors.New("el acceso con Google no está disponible")

	// ErrAccesoDenegado indica que el rol del usuario no permite la operación (HTTP 403).
	ErrAccesoDenegado = errors.New("no tienes permiso para realizar esta acción")

	// ErrSolicitudNoEncontrada reexporta el error de repositorio cuando una solicitud no existe o no es del usuario (HTTP 404).
	ErrSolicitudNoEncontrada = repositories.ErrSolicitudNoEncontrada

	// ErrSolicitudNoPendiente reexporta el error de repositorio cuando la solicitud ya no se puede retirar (HTTP 409).
	ErrSolicitudNoPendiente = repositories.ErrSolicitudNoPendiente

	// ErrLoginBloqueado indica que el correo acumuló demasiados intentos fallidos de contraseña (HTTP 429).
	ErrLoginBloqueado = errors.New("demasiados intentos fallidos de contraseña; inténtalo de nuevo en unos minutos")

	// ErrSesionInvalida indica un token ausente, desconocido o vencido (HTTP 401).
	ErrSesionInvalida = errors.New("sesión no válida o expirada")
)
