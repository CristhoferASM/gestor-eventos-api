package models

import "time"

// Roles disponibles en el sistema.
const (
	RolAsesor  = "asesor"
	RolCliente = "cliente"
)

// Usuario representa una cuenta que puede iniciar sesión.
// El hash de la contraseña nunca se serializa a JSON.
type Usuario struct {
	ID           uint   `json:"id"`
	Correo       string `json:"correo"`
	Nombre       string `json:"nombre"`
	Rol          string `json:"rol"`
	ClienteID    string `json:"cliente_id,omitempty"` // Solo para rol cliente (ej. "CLI-001")
	Proveedor    string `json:"proveedor,omitempty"`  // "google" para cuentas creadas con Google; vacío si usa contraseña
	PasswordHash string `json:"-"`
}

// DesafioVerificacion es el segundo paso del acceso: un código de 6 dígitos asociado a un usuario
// que ya superó correo y contraseña.
type DesafioVerificacion struct {
	ID                    string
	Correo                string
	Codigo                string
	ExpiraEn              time.Time
	ReenvioPermitidoDesde time.Time
	Intentos              int
}

// Sesion es una sesión autenticada identificada por un token opaco.
type Sesion struct {
	Token    string
	Correo   string
	ExpiraEn time.Time
}

// LoginDTO es el JSON recibido en POST /auth/login.
type LoginDTO struct {
	Correo   string `json:"correo" binding:"required"`
	Password string `json:"password" binding:"required"`
	// DispositivoID lo completa el servidor desde la cookie del navegador (nunca viene en el JSON).
	DispositivoID string `json:"-"`
}

// VerificarCodigoDTO es el JSON recibido en POST /auth/verificar.
type VerificarCodigoDTO struct {
	DesafioID string `json:"desafio_id" binding:"required"`
	Codigo    string `json:"codigo" binding:"required"`
	// DispositivoID lo completa el servidor desde la cookie del navegador (nunca viene en el JSON).
	DispositivoID string `json:"-"`
}

// ReenviarCodigoDTO es el JSON recibido en POST /auth/reenviar-codigo.
type ReenviarCodigoDTO struct {
	DesafioID string `json:"desafio_id" binding:"required"`
}

// RespuestaDesafio es lo que devuelven /auth/login y /auth/reenviar-codigo.
// CodigoPrueba existe SOLO porque la verificación por correo es simulada (no hay envío real);
// debe eliminarse cuando se integre un servicio de correo.
type RespuestaDesafio struct {
	DesafioID         string `json:"desafio_id"`
	CorreoEnmascarado string `json:"correo_enmascarado"`
	ExpiraEnSegundos  int    `json:"expira_en_segundos"`
	ReenvioEnSegundos int    `json:"reenvio_en_segundos"`
	CodigoPrueba      string `json:"codigo_prueba,omitempty"`

	// RecordatorioDiario avisa de que a este rol solo se le pide el código una vez al día en cada navegador.
	RecordatorioDiario bool `json:"recordatorio_diario,omitempty"`
	// Sesion viene informada (y no hay desafío) cuando el código ya se verificó hoy en este navegador:
	// la contraseña correcta abre la sesión directamente.
	Sesion *RespuestaSesion `json:"sesion,omitempty"`
}

// RespuestaSesion es lo que devuelve POST /auth/verificar.
type RespuestaSesion struct {
	Token    string    `json:"token"`
	ExpiraEn time.Time `json:"expira_en"`
	Usuario  Usuario   `json:"usuario"`
}

// VincularCuentaDTO es el JSON recibido en POST /usuarios/vincular (solo asesor).
type VincularCuentaDTO struct {
	Correo    string `json:"correo" binding:"required"`
	ClienteID string `json:"cliente_id" binding:"required"`
}

// LoginGoogleDTO es el JSON recibido en POST /auth/google (ID token emitido por Firebase tras el popup de Google).
type LoginGoogleDTO struct {
	IDToken string `json:"id_token" binding:"required"`
}
