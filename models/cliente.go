package models

// Cliente es la entidad que contrata los eventos (persona o empresa). Por ahora solo guarda lo mínimo que muestra
// la interfaz (código y razón social); los demás datos (RUC, contacto principal...) están por acordar con el ingeniero.
type Cliente struct {
	ID          string `json:"id"`           // Código visible, ej. "CLI-001"; es el valor de Evento.ClienteID
	RazonSocial string `json:"razon_social"` // Nombre del cliente o razón social
}
