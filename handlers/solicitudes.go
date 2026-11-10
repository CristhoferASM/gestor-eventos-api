package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"

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

		creada, err := solicitudService.CrearSolicitudDe(c.Request.Context(), usuarioActual(c), dto)
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
			case errors.Is(err, services.ErrSinDisponibilidad):
				c.JSON(http.StatusConflict, gin.H{
					"error": err.Error(),
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

// ConsultarDisponibilidadHandler responde si el horario propuesto está libre, sin registrar nada (POST /disponibilidad).
// Recibe el mismo cuerpo que POST /solicitudes, pero el motivo es opcional. Siempre responde 200 con
// {"disponible": true|false, "mensaje": "..."}; los datos mal formados responden 400 y un evento ajeno, 404.
func ConsultarDisponibilidadHandler(solicitudService *services.SolicitudService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var dto models.SolicitudCreacionDTO
		// No se usa ShouldBindJSON: exigiría el motivo, que la consulta no necesita. El servicio valida el resto.
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20)
		if err := json.NewDecoder(c.Request.Body).Decode(&dto); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Cuerpo de solicitud inválido (se esperan evento_id, fecha_propuesta, hora_inicio_propuesta y hora_fin_propuesta).",
			})
			return
		}

		err := solicitudService.ConsultarDisponibilidadDe(c.Request.Context(), usuarioActual(c), dto)
		switch {
		case err == nil:
			c.JSON(http.StatusOK, gin.H{"disponible": true})
		case errors.Is(err, services.ErrSinDisponibilidad):
			c.JSON(http.StatusOK, gin.H{"disponible": false, "mensaje": err.Error()})
		case errors.Is(err, services.ErrDatosInvalidos):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrEventoNoEncontrado):
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("El evento con ID %d no existe.", dto.EventoID)})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error interno del servidor."})
		}
	}
}

// ListarSolicitudesHandler retorna la lista de solicitudes creadas durante la ejecución
func ListarSolicitudesHandler(solicitudService *services.SolicitudService) gin.HandlerFunc {
	return func(c *gin.Context) {
		solicitudes, err := solicitudService.ObtenerSolicitudesDe(c.Request.Context(), usuarioActual(c))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Error interno del servidor.",
			})
			return
		}
		c.JSON(http.StatusOK, solicitudes)
	}
}

// RetirarSolicitudHandler permite al cliente retirar una solicitud pendiente (POST /solicitudes/:id/retirar).
func RetirarSolicitudHandler(solicitudService *services.SolicitudService) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseUint(c.Param("id"), 10, 32)
		if err != nil || id == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "El identificador de la solicitud debe ser un número entero positivo."})
			return
		}

		retirada, err := solicitudService.RetirarSolicitud(c.Request.Context(), usuarioActual(c), uint(id))
		if err != nil {
			switch {
			case errors.Is(err, services.ErrDatosInvalidos):
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			case errors.Is(err, services.ErrAccesoDenegado):
				c.JSON(http.StatusForbidden, gin.H{"error": "Solo el cliente puede retirar su solicitud."})
			case errors.Is(err, services.ErrSolicitudNoEncontrada), errors.Is(err, services.ErrEventoNoEncontrado):
				c.JSON(http.StatusNotFound, gin.H{"error": "Solicitud no encontrada."})
			case errors.Is(err, services.ErrSolicitudNoPendiente):
				c.JSON(http.StatusConflict, gin.H{"error": "Solo es posible retirar solicitudes que sigan pendientes de revisión."})
			default:
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Error interno del servidor."})
			}
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"mensaje":   "Solicitud retirada. Tu reserva se mantiene sin cambios.",
			"solicitud": retirada,
		})
	}
}
