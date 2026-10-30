package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"gestor-eventos-api/services"

	"github.com/gin-gonic/gin"
)

// ListarEventosHandler retorna todos los eventos disponibles
func ListarEventosHandler(eventoService *services.EventoService) gin.HandlerFunc {
	return func(c *gin.Context) {
		eventos, err := eventoService.ObtenerEventos(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Error interno del servidor.",
			})
			return
		}
		c.JSON(http.StatusOK, eventos)
	}
}

// DetalleEventoHandler busca y retorna un evento específico por su ID o el código de error correspondiente
func DetalleEventoHandler(eventoService *services.EventoService) gin.HandlerFunc {
	return func(c *gin.Context) {
		idParam := c.Param("id")
		idUint, err := strconv.ParseUint(idParam, 10, 32)
		if err != nil || idUint == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "El identificador del evento debe ser un número entero positivo.",
			})
			return
		}

		evento, err := eventoService.ObtenerEventoPorID(c.Request.Context(), uint(idUint))
		if err != nil {
			switch {
			case errors.Is(err, services.ErrDatosInvalidos):
				c.JSON(http.StatusBadRequest, gin.H{
					"error": err.Error(),
				})
			case errors.Is(err, services.ErrEventoNoEncontrado):
				c.JSON(http.StatusNotFound, gin.H{
					"error": "Evento no encontrado.",
				})
			default:
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": "Error interno del servidor.",
				})
			}
			return
		}

		c.JSON(http.StatusOK, evento)
	}
}
