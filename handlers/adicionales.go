package handlers

import (
	"net/http"

	"gestor-eventos-api/models"

	"github.com/gin-gonic/gin"
)

// ListarCatalogoAdicionalesHandler expone el catálogo de servicios técnicos y recursos adicionales con tarifas simuladas del prototipo Showtech.
func ListarCatalogoAdicionalesHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, models.CatalogoAdicionalesSimulado)
	}
}

