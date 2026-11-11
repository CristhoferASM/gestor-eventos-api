package handlers

import (
	"net/http"

	"gestor-eventos-api/services"

	"github.com/gin-gonic/gin"
)

// ListarCatalogoAdicionalesHandler expone el catálogo de servicios técnicos y recursos adicionales con su tarifa por
// hora. Viene del repositorio (la tabla `adicional` de la base de datos de la empresa) o, sin él, del catálogo simulado
// del prototipo Showtech.
func ListarCatalogoAdicionalesHandler(eventoService *services.EventoService) gin.HandlerFunc {
	return func(c *gin.Context) {
		catalogo, err := eventoService.ObtenerCatalogo(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error interno del servidor."})
			return
		}
		c.JSON(http.StatusOK, catalogo)
	}
}
