package handlers

import (
	"errors"
	"fmt"
	"net/http"

	"gestor-eventos-api/models"
	"gestor-eventos-api/services"

	"github.com/gin-gonic/gin"
)

// CrearSolicitudHandler lee el JSON de entrada, delega la validación y creación al servicio y traduce errores a HTTP
func CrearSolicitudHandler(solicitudService *services.SolicitudService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var dto models.SolicitudCreacionDTO
		if err := c.ShouldBindJSON(&dto); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Cuerpo de solicitud inválido o campos obligatorios faltantes (evento_id, motivo, fecha_propuesta, hora_inicio_propuesta, hora_fin_propuesta).",
			})
			return
		}

		creada, err := solicitudService.CrearSolicitud(c.Request.Context(), dto)
		if err != nil {
			switch {
			case errors.Is(err, services.ErrDatosInvalidos):
				c.JSON(http.StatusBadRequest, gin.H{
					"error": err.Error(),
				})
			case errors.Is(err, services.ErrEventoNoEncontrado):
				c.JSON(http.StatusNotFound, gin.H{
					"error": fmt.Sprintf("El evento con ID %d no existe.", dto.EventoID),
				})
			case errors.Is(err, services.ErrSolicitudPendienteDuplicada):
				c.JSON(http.StatusConflict, gin.H{
					"error": "Ya existe una solicitud pendiente de revisión para este evento.",
				})
			default:
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": "Error interno del servidor.",
				})
			}
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"mensaje":   "Solicitud registrada exitosamente.",
			"solicitud": creada,
		})
	}
}

// ListarSolicitudesHandler retorna la lista de solicitudes creadas durante la ejecución
func ListarSolicitudesHandler(solicitudService *services.SolicitudService) gin.HandlerFunc {
	return func(c *gin.Context) {
		solicitudes, err := solicitudService.ObtenerSolicitudes(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Error interno del servidor.",
			})
			return
		}
		c.JSON(http.StatusOK, solicitudes)
	}
}
