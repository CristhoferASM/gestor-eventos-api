package models

// InformacionGeneralPropuestaDTO agrupa los datos generales y de contacto propuestos en POST /solicitudes.
// Si el bloque se omite en el JSON de entrada (nil), el servicio conserva los valores originales del evento
// para mantener la compatibilidad con peticiones anteriores que solo envían fecha y horario.
// Si el bloque se incluye, se trata como una propuesta completa: permite vaciar los campos opcionales
// (telefono, correo, observaciones) con "" y exige que los campos obligatorios (nombre, contacto) no estén vacíos.
type InformacionGeneralPropuestaDTO struct {
	Nombre        string `json:"nombre"`
	Contacto      string `json:"contacto"`
	Telefono      string `json:"telefono"`
	Correo        string `json:"correo"`
	Observaciones string `json:"observaciones"`
}

// TiemposTecnicosPropuestosDTO agrupa los tiempos técnicos propuestos (montaje, desmontaje y ensayo).
type TiemposTecnicosPropuestosDTO struct {
	HasMontaje           bool   `json:"has_montaje"`
	MontajeFecha         string `json:"montaje_fecha"`
	MontajeHoraInicio    string `json:"montaje_hora_inicio"`
	MontajeHoraFin       string `json:"montaje_hora_fin"`
	HasDesmontaje        bool   `json:"has_desmontaje"`
	DesmontajeFecha      string `json:"desmontaje_fecha"`
	DesmontajeHoraInicio string `json:"desmontaje_hora_inicio"`
	DesmontajeHoraFin    string `json:"desmontaje_hora_fin"`
	HasEnsayo            bool   `json:"has_ensayo"`
	EnsayoFecha          string `json:"ensayo_fecha"`
	EnsayoHoraInicio     string `json:"ensayo_hora_inicio"`
	EnsayoHoraFin        string `json:"ensayo_hora_fin"`
}

// DatosHorario agrupa el snapshot completo de información general, contacto, fecha, horario
// y tiempos técnicos de un evento (tanto para datos_originales como para datos_propuestos).
type DatosHorario struct {
	Nombre               string `json:"nombre"`
	Espacio              string `json:"espacio"`
	Contacto             string `json:"contacto"`
	Telefono             string `json:"telefono"`
	Correo               string `json:"correo"`
	Observaciones        string `json:"observaciones"`
	Fecha                string `json:"fecha"`
	HoraInicio           string `json:"hora_inicio"`
	HoraFin              string `json:"hora_fin"`
	HasMontaje           bool   `json:"has_montaje"`
	MontajeFecha         string `json:"montaje_fecha"`
	MontajeHoraInicio    string `json:"montaje_hora_inicio"`
	MontajeHoraFin       string `json:"montaje_hora_fin"`
	HasDesmontaje        bool   `json:"has_desmontaje"`
	DesmontajeFecha      string `json:"desmontaje_fecha"`
	DesmontajeHoraInicio string `json:"desmontaje_hora_inicio"`
	DesmontajeHoraFin    string `json:"desmontaje_hora_fin"`
	HasEnsayo            bool            `json:"has_ensayo"`
	EnsayoFecha          string          `json:"ensayo_fecha"`
	EnsayoHoraInicio     string          `json:"ensayo_hora_inicio"`
	EnsayoHoraFin        string          `json:"ensayo_hora_fin"`
	Adicionales          []AdicionalItem `json:"adicionales"`
}

// SolicitudCreacionDTO representa la estructura del JSON recibido en POST /solicitudes.
type SolicitudCreacionDTO struct {
	EventoID                    uint                            `json:"evento_id" binding:"required"`
	Motivo                      string                          `json:"motivo" binding:"required"`
	FechaPropuesta              string                          `json:"fecha_propuesta" binding:"required"`
	HoraInicioPropuesta         string                          `json:"hora_inicio_propuesta" binding:"required"`
	HoraFinPropuesta            string                          `json:"hora_fin_propuesta" binding:"required"`
	InformacionGeneralPropuesta *InformacionGeneralPropuestaDTO `json:"informacion_general_propuesta,omitempty"`
	TiemposTecnicosPropuestos   *TiemposTecnicosPropuestosDTO   `json:"tiempos_tecnicos_propuestos,omitempty"`
	AdicionalesPropuestos       *[]AdicionalPropuestoDTO        `json:"adicionales_propuestos,omitempty"`
	// Campos directos opcionales para máxima interoperabilidad
	HasMontaje           *bool  `json:"has_montaje,omitempty"`
	MontajeFecha         string `json:"montaje_fecha,omitempty"`
	MontajeHoraInicio    string `json:"montaje_hora_inicio,omitempty"`
	MontajeHoraFin       string `json:"montaje_hora_fin,omitempty"`
	HasDesmontaje        *bool  `json:"has_desmontaje,omitempty"`
	DesmontajeFecha      string `json:"desmontaje_fecha,omitempty"`
	DesmontajeHoraInicio string `json:"desmontaje_hora_inicio,omitempty"`
	DesmontajeHoraFin    string `json:"desmontaje_hora_fin,omitempty"`
	HasEnsayo            *bool  `json:"has_ensayo,omitempty"`
	EnsayoFecha          string `json:"ensayo_fecha,omitempty"`
	EnsayoHoraInicio     string `json:"ensayo_hora_inicio,omitempty"`
	EnsayoHoraFin        string `json:"ensayo_hora_fin,omitempty"`
}

// EstadoPendienteRevision es el estado inicial asignado a toda solicitud recién registrada.
const EstadoPendienteRevision = "Pendiente de revisión"

// EstadoRetiradaCliente es el estado de una solicitud que el propio cliente retiró mientras estaba pendiente.
// La solicitud se conserva íntegra en el historial; solo cambia su estado.
const EstadoRetiradaCliente = "Retirada por el cliente"

// EstadoAprobada y EstadoRechazada son los estados que la base de datos de la empresa asigna cuando el asesor resuelve
// una solicitud (el flujo de aprobación aún no está implementado en esta API; solo se muestran si ya existen).
const (
	EstadoAprobada  = "Aprobada"
	EstadoRechazada = "Rechazada"
)

// Solicitud representa el registro de una solicitud de modificación de evento.
type Solicitud struct {
	ID uint `json:"id"`
	// Codigo es el código visible de la solicitud en la base de datos de la empresa (ej. "SOLM-2026-0002"). Con el
	// almacén en memoria no existe y el frontend lo calcula como SOL-AAAA-NNN.
	Codigo string `json:"codigo,omitempty"`
	// SolicitanteID es el id del usuario que la envía; lo completa el servicio y no viaja en el JSON.
	SolicitanteID               uint                           `json:"-"`
	EventoID                    uint                           `json:"evento_id"`
	Motivo                      string                         `json:"motivo"`
	FechaPropuesta              string                         `json:"fecha_propuesta"`
	HoraInicioPropuesta         string                         `json:"hora_inicio_propuesta"`
	HoraFinPropuesta            string                         `json:"hora_fin_propuesta"`
	InformacionGeneralPropuesta InformacionGeneralPropuestaDTO `json:"informacion_general_propuesta"`
	TiemposTecnicosPropuestos   *TiemposTecnicosPropuestosDTO  `json:"tiempos_tecnicos_propuestos,omitempty"`
	AdicionalesPropuestos       *[]AdicionalPropuestoDTO       `json:"adicionales_propuestos,omitempty"`
	Estado                      string                         `json:"estado"` // "Pendiente de revisión" o "Retirada por el cliente"
	// FechaRetiro (RFC 3339) solo existe si el cliente retiró la solicitud.
	FechaRetiro string `json:"fecha_retiro,omitempty"`
	// FechaCreacion se genera en formato RFC 3339 con offset de zona horaria explícito (time.RFC3339).
	// El frontend convierte el instante a America/Lima y mantiene compatibilidad con registros legacy ("YYYY-MM-DD HH:MM:SS").
	FechaCreacion   string       `json:"fecha_creacion"`
	DatosOriginales DatosHorario `json:"datos_originales"`
	DatosPropuestos DatosHorario `json:"datos_propuestos"`
}
