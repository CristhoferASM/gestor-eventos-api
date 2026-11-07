package models

// Evento representa un evento gestionado en SHOWTECH SOLUTIONS.
type Evento struct {
	ID            uint   `json:"id"`
	Nombre        string `json:"nombre"`
	Espacio       string `json:"espacio"`
	Fecha         string `json:"fecha"`       // Formato YYYY-MM-DD
	HoraInicio    string `json:"hora_inicio"` // Formato HH:MM
	HoraFin       string `json:"hora_fin"`    // Formato HH:MM
	Estado        string `json:"estado"`      // ej. "Confirmado", "Programado"
	Contacto      string `json:"contacto"`
	Telefono      string `json:"telefono"`
	Correo        string `json:"correo"`
	Observaciones string `json:"observaciones"`

	// Tiempos técnicos adicionales
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

	// Adicionales contratados vigentes
	Adicionales []AdicionalItem `json:"adicionales"`
}
