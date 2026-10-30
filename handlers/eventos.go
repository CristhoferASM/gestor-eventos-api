package handlers

import (
	"net/http"
	"strconv"

	"gestor-eventos-api/storage"

	"github.com/gin-gonic/gin"
)

// ListarEventosHandler retorna todos los eventos disponibles
func ListarEventosHandler(store *storage.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		eventos := store.ObtenerEventos()
		c.JSON(http.StatusOK, eventos)
	}
}

// DetalleEventoHandler busca y retorna un evento específico por su ID o 404 si no existe
func DetalleEventoHandler(store *storage.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		idParam := c.Param("id")
		idUint, err := strconv.ParseUint(idParam, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "El identificador del evento debe ser un número entero positivo.",
			})
			return
		}

		evento, existe := store.ObtenerEventoPorID(uint(idUint))
		if !existe {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Evento no encontrado.",
			})
			return
		}

		c.JSON(http.StatusOK, evento)
	}
}
