package models

// BloqueoInstitucional es un tramo en que el auditorio no está disponible (mantenimiento, uso interno...).
type BloqueoInstitucional struct {
	ID         string `json:"id"`
	Titulo     string `json:"titulo"`
	Espacio    string `json:"espacio"`
	Fecha      string `json:"fecha"`       // YYYY-MM-DD
	HoraInicio string `json:"hora_inicio"` // HH:MM
	HoraFin    string `json:"hora_fin"`    // HH:MM
	Tipo       string `json:"tipo"`
	Notas      string `json:"notas"`
}
