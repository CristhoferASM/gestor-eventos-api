package models

// AdicionalCatalogo representa un servicio o recurso técnico disponible en el catálogo de demostración.
type AdicionalCatalogo struct {
	ID          string  `json:"id"`
	Nombre      string  `json:"nombre"`
	TarifaHora  float64 `json:"tarifa_hora"`
	UnidadLabel string  `json:"unidad_label"`
	Unidad      string  `json:"unidad"`
}

// CatalogoAdicionalesSimulado define el catálogo compartido de adicionales del prototipo Showtech.
var CatalogoAdicionalesSimulado = []AdicionalCatalogo{
	{ID: "cochera", Nombre: "Cochera", TarifaHora: 10.0, UnidadLabel: "Cantidad de unidades", Unidad: "unidad"},
	{ID: "pantalla_led_5x4", Nombre: "Pantalla LED 5×4", TarifaHora: 200.0, UnidadLabel: "Cantidad de unidades", Unidad: "unidad"},
	{ID: "pantalla_led_4x3", Nombre: "Pantalla LED 4×3", TarifaHora: 150.0, UnidadLabel: "Cantidad de unidades", Unidad: "unidad"},
	{ID: "microfono", Nombre: "Micrófono inalámbrico", TarifaHora: 5.0, UnidadLabel: "Cantidad de unidades", Unidad: "unidad"},
	{ID: "teleprompter", Nombre: "Teleprompter", TarifaHora: 10.0, UnidadLabel: "Cantidad de unidades", Unidad: "unidad"},
}

// ObtenerAdicionalCatalogo busca un ítem en el catálogo por su identificador.
func ObtenerAdicionalCatalogo(id string) *AdicionalCatalogo {
	for _, a := range CatalogoAdicionalesSimulado {
		if a.ID == id {
			copia := a
			return &copia
		}
	}
	return nil
}

// AdicionalItem representa un adicional contratado o snapshot con su subtotal liquidado.
type AdicionalItem struct {
	ID         string  `json:"id"`
	Nombre     string  `json:"nombre"`
	Unidad     string  `json:"unidad"`
	Cantidad   int     `json:"cantidad"`
	Horas      int     `json:"horas"`
	TarifaHora float64 `json:"tarifa_hora"`
	Subtotal   float64 `json:"subtotal"`
}

// AdicionalPropuestoDTO representa la propuesta enviada por el cliente para un adicional específico.
type AdicionalPropuestoDTO struct {
	ID       string `json:"id"`
	Cantidad int    `json:"cantidad"`
	Horas    int    `json:"horas"`
}

