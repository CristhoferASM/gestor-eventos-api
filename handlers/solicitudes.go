package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"gestor-eventos-api/models"
	"gestor-eventos-api/storage"

	"github.com/gin-gonic/gin"
)

// parseHora valida y normaliza una hora en formato HH:MM o HH
func parseHora(h string) (time.Time, string, error) {
	h = strings.TrimSpace(h)
	// Admite formato HH:MM (ej: 09:00, 14:30)
	if t, err := time.Parse("15:04", h); err == nil {
		return t, fmt.Sprintf("%02d:%02d", t.Hour(), t.Minute()), nil
	}
	// Admite formato HH (ej: 09, 14)
	if t, err := time.Parse("15", h); err == nil {
		return t, fmt.Sprintf("%02d:00", t.Hour()), nil
	}
	return time.Time{}, "", fmt.Errorf("formato no reconocido")
}

// CrearSolicitudHandler valida la entrada y registra una solicitud de modificación
func CrearSolicitudHandler(store *storage.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		var dto models.SolicitudCreacionDTO
		if err := c.ShouldBindJSON(&dto); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Cuerpo de solicitud inválido o campos obligatorios faltantes (evento_id, motivo, fecha_propuesta, hora_inicio_propuesta, hora_fin_propuesta).",
			})
			return
		}

		// 1. Validar que el evento existe
		evento, existe := store.ObtenerEventoPorID(dto.EventoID)
		if !existe {
			c.JSON(http.StatusNotFound, gin.H{
				"error": fmt.Sprintf("El evento con ID %d no existe.", dto.EventoID),
			})
			return
		}

		// 2. Validar motivo no vacío tras trim y longitud <= 400 caracteres
		motivoLimpio := strings.TrimSpace(dto.Motivo)
		if motivoLimpio == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "El motivo no puede estar vacío.",
			})
			return
		}
		if utf8.RuneCountInString(motivoLimpio) > 400 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "El motivo no puede exceder los 400 caracteres.",
			})
			return
		}

		// 3. Validar formato de fecha YYYY-MM-DD
		fechaLimpia := strings.TrimSpace(dto.FechaPropuesta)
		if _, err := time.Parse("2006-01-02", fechaLimpia); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "La fecha propuesta debe tener el formato YYYY-MM-DD (ejemplo: 2026-11-25).",
			})
			return
		}

		// 4. Validar formato de horas
		tInicio, horaInicioNorm, errInicio := parseHora(dto.HoraInicioPropuesta)
		tFin, horaFinNorm, errFin := parseHora(dto.HoraFinPropuesta)
		if errInicio != nil || errFin != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Las horas propuestas deben tener un formato válido (HH:MM o HH, ej. '09:00' o '09').",
			})
			return
		}

		// 5. Validar rango horario permitido: entre 06:00 y 22:00, inclusive
		limiteMin, _ := time.Parse("15:04", "06:00")
		limiteMax, _ := time.Parse("15:04", "22:00")
		if tInicio.Before(limiteMin) || tInicio.After(limiteMax) || tFin.Before(limiteMin) || tFin.After(limiteMax) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Los horarios deben estar comprendidos entre las 06:00 y las 22:00 inclusive.",
			})
			return
		}

		// 6. Validar que inicio sea anterior al fin
		if !tInicio.Before(tFin) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "La hora de inicio propuesta debe ser anterior a la hora de fin.",
			})
			return
		}

		// 7. Validar existencia de algún cambio respecto al evento original
		if fechaLimpia == evento.Fecha && horaInicioNorm == evento.HoraInicio && horaFinNorm == evento.HoraFin {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "La solicitud debe proponer al menos un cambio en la fecha o el horario respecto al evento original.",
			})
			return
		}

		// 8. Validar máximo una solicitud pendiente por evento
		if store.TieneSolicitudPendiente(dto.EventoID) {
			c.JSON(http.StatusConflict, gin.H{
				"error": "Ya existe una solicitud pendiente de revisión para este evento.",
			})
			return
		}

		// 9. Registrar la solicitud conservando copia de datos originales y propuestos
		nuevaSolicitud := models.Solicitud{
			EventoID:            evento.ID,
			Motivo:              motivoLimpio,
			FechaPropuesta:      fechaLimpia,
			HoraInicioPropuesta: horaInicioNorm,
			HoraFinPropuesta:    horaFinNorm,
			Estado:              "Pendiente de revisión",
			FechaCreacion:       time.Now().Format("2006-01-02 15:04:05"),
			DatosOriginales: models.DatosHorario{
				Fecha:      evento.Fecha,
				HoraInicio: evento.HoraInicio,
				HoraFin:    evento.HoraFin,
			},
			DatosPropuestos: models.DatosHorario{
				Fecha:      fechaLimpia,
				HoraInicio: horaInicioNorm,
				HoraFin:    horaFinNorm,
			},
		}

		creada, err := store.CrearSolicitud(nuevaSolicitud)
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{
				"error": err.Error(),
			})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"mensaje":   "Solicitud registrada exitosamente.",
			"solicitud": creada,
		})
	}
}

// ListarSolicitudesHandler retorna la lista de solicitudes creadas durante la ejecución
func ListarSolicitudesHandler(store *storage.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		solicitudes := store.ObtenerSolicitudes()
		c.JSON(http.StatusOK, solicitudes)
	}
}
