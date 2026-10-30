package models

// Evento representa un evento gestionado en SHOWTECH SOLUTIONS
type Evento struct {
	ID         uint   `json:"id"`
	Nombre     string `json:"nombre"`
	Espacio    string `json:"espacio"`
	Fecha      string `json:"fecha"`       // Formato YYYY-MM-DD
	HoraInicio string `json:"hora_inicio"` // Formato HH:MM
	HoraFin    string `json:"hora_fin"`    // Formato HH:MM
	Estado     string `json:"estado"`      // ej. "Confirmado", "Programado"
}
