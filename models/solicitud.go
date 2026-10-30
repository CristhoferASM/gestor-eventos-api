package models

// DatosHorario agrupa la fecha y rango horario para registrar snapshots
type DatosHorario struct {
	Fecha      string `json:"fecha"`
	HoraInicio string `json:"hora_inicio"`
	HoraFin    string `json:"hora_fin"`
}

// SolicitudCreacionDTO representa la estructura del JSON recibido en POST /solicitudes
type SolicitudCreacionDTO struct {
	EventoID            uint   `json:"evento_id" binding:"required"`
	Motivo              string `json:"motivo" binding:"required"`
	FechaPropuesta      string `json:"fecha_propuesta" binding:"required"`
	HoraInicioPropuesta string `json:"hora_inicio_propuesta" binding:"required"`
	HoraFinPropuesta    string `json:"hora_fin_propuesta" binding:"required"`
}

// EstadoPendienteRevision es el estado inicial asignado a toda solicitud recién registrada.
const EstadoPendienteRevision = "Pendiente de revisión"

// Solicitud representa el registro de una solicitud de modificación de evento
type Solicitud struct {
	ID                  uint   `json:"id"`
	EventoID            uint   `json:"evento_id"`
	Motivo              string `json:"motivo"`
	FechaPropuesta      string `json:"fecha_propuesta"`
	HoraInicioPropuesta string `json:"hora_inicio_propuesta"`
	HoraFinPropuesta    string `json:"hora_fin_propuesta"`
	Estado              string `json:"estado"` // "Pendiente de revisión"
	// FechaCreacion conserva por ahora el formato "YYYY-MM-DD HH:MM:SS" en el contrato JSON actual.
	// Su formato (p. ej. RFC3339 / TIMESTAMPTZ) y el manejo explícito de zona horaria se revisarán
	// cuando se implemente la persistencia definitiva en PostgreSQL.
	FechaCreacion   string       `json:"fecha_creacion"`
	DatosOriginales DatosHorario `json:"datos_originales"`
	DatosPropuestos DatosHorario `json:"datos_propuestos"`
}
