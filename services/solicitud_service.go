package services

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"
)

// ClockFunc define una función proveedora de tiempo para permitir pruebas deterministas de fecha_creacion.
type ClockFunc func() time.Time

// SolicitudService contiene las validaciones de negocio, construcción de snapshots y registro de solicitudes.
//
// Nota sobre fecha_creacion: por compatibilidad con el contrato JSON actual, se formatea como
// "2006-01-02 15:04:05" usando el reloj configurado. Su formato definitivo (p. ej. RFC3339 / TIMESTAMPTZ)
// y el criterio de zona horaria se revisarán al incorporar la persistencia en PostgreSQL.
type SolicitudService struct {
	eventoRepo    repositories.EventoRepository
	solicitudRepo repositories.SolicitudRepository
	clock         ClockFunc
}

// NewSolicitudService crea un SolicitudService utilizando time.Now como reloj por defecto.
func NewSolicitudService(eventoRepo repositories.EventoRepository, solicitudRepo repositories.SolicitudRepository) *SolicitudService {
	return NewSolicitudServiceWithClock(eventoRepo, solicitudRepo, time.Now)
}

// NewSolicitudServiceWithClock crea un SolicitudService con un reloj inyectable para pruebas.
func NewSolicitudServiceWithClock(eventoRepo repositories.EventoRepository, solicitudRepo repositories.SolicitudRepository, clock ClockFunc) *SolicitudService {
	if clock == nil {
		clock = time.Now
	}
	return &SolicitudService{
		eventoRepo:    eventoRepo,
		solicitudRepo: solicitudRepo,
		clock:         clock,
	}
}

func esDigitoASCII(b byte) bool {
	return b >= '0' && b <= '9'
}

// parseHora valida y normaliza una hora exigiendo estrictamente el formato HH:MM (dos dígitos, dos puntos y dos dígitos)
// tras eliminar espacios externos.
func parseHora(h string) (time.Time, string, error) {
	h = strings.TrimSpace(h)
	if len(h) != 5 || h[2] != ':' ||
		!esDigitoASCII(h[0]) || !esDigitoASCII(h[1]) ||
		!esDigitoASCII(h[3]) || !esDigitoASCII(h[4]) {
		return time.Time{}, "", fmt.Errorf("formato no reconocido")
	}

	t, err := time.Parse("15:04", h)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("hora inválida")
	}

	return t, fmt.Sprintf("%02d:%02d", t.Hour(), t.Minute()), nil
}

// CrearSolicitud valida las reglas de negocio, construye los snapshots y coordina el registro atómico en el repositorio.
func (s *SolicitudService) CrearSolicitud(ctx context.Context, dto models.SolicitudCreacionDTO) (models.Solicitud, error) {
	if dto.EventoID == 0 {
		return models.Solicitud{}, nuevoErrorValidacion("El identificador del evento debe ser un número entero positivo.")
	}

	// 1. Validar que el evento existe
	evento, err := s.eventoRepo.ObtenerEventoPorID(ctx, dto.EventoID)
	if err != nil {
		return models.Solicitud{}, err
	}

	// 2. Validar motivo limpio, no vacío y longitud <= 400 caracteres Unicode
	motivoLimpio := strings.TrimSpace(dto.Motivo)
	if motivoLimpio == "" {
		return models.Solicitud{}, nuevoErrorValidacion("El motivo no puede estar vacío.")
	}
	if utf8.RuneCountInString(motivoLimpio) > 400 {
		return models.Solicitud{}, nuevoErrorValidacion("El motivo no puede exceder los 400 caracteres.")
	}

	// 3. Validar formato de fecha YYYY-MM-DD
	fechaLimpia := strings.TrimSpace(dto.FechaPropuesta)
	if _, err := time.Parse("2006-01-02", fechaLimpia); err != nil {
		return models.Solicitud{}, nuevoErrorValidacion("La fecha propuesta debe tener el formato YYYY-MM-DD (ejemplo: 2026-11-25).")
	}

	// 4. Validar formato estricto de horas (HH:MM)
	tInicio, horaInicioNorm, errInicio := parseHora(dto.HoraInicioPropuesta)
	tFin, horaFinNorm, errFin := parseHora(dto.HoraFinPropuesta)
	if errInicio != nil || errFin != nil {
		return models.Solicitud{}, nuevoErrorValidacion("Las horas propuestas deben tener el formato HH:MM (ej. '09:00').")
	}

	// 5. Validar rango horario permitido: entre 06:00 y 22:00, inclusive
	limiteMin, _ := time.Parse("15:04", "06:00")
	limiteMax, _ := time.Parse("15:04", "22:00")
	if tInicio.Before(limiteMin) || tInicio.After(limiteMax) || tFin.Before(limiteMin) || tFin.After(limiteMax) {
		return models.Solicitud{}, nuevoErrorValidacion("Los horarios deben estar comprendidos entre las 06:00 y las 22:00 inclusive.")
	}

	// 6. Validar que inicio sea anterior al fin
	if !tInicio.Before(tFin) {
		return models.Solicitud{}, nuevoErrorValidacion("La hora de inicio propuesta debe ser anterior a la hora de fin.")
	}

	// 7. Validar existencia de algún cambio respecto al evento original
	if fechaLimpia == evento.Fecha && horaInicioNorm == evento.HoraInicio && horaFinNorm == evento.HoraFin {
		return models.Solicitud{}, nuevoErrorValidacion("La solicitud debe proponer al menos un cambio en la fecha o el horario respecto al evento original.")
	}

	// 8. Construir solicitud con snapshots de datos originales y propuestos, estado inicial y fecha de creación
	nuevaSolicitud := models.Solicitud{
		EventoID:            evento.ID,
		Motivo:              motivoLimpio,
		FechaPropuesta:      fechaLimpia,
		HoraInicioPropuesta: horaInicioNorm,
		HoraFinPropuesta:    horaFinNorm,
		Estado:              models.EstadoPendienteRevision,
		FechaCreacion:       s.clock().Format("2006-01-02 15:04:05"),
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

	// 9. Coordinar el registro atómico mediante el repositorio
	creada, err := s.solicitudRepo.CrearSolicitud(ctx, nuevaSolicitud)
	if err != nil {
		return models.Solicitud{}, err
	}

	return creada, nil
}

// ObtenerSolicitudes retorna la lista de solicitudes registradas garantizando un slice no nulo.
func (s *SolicitudService) ObtenerSolicitudes(ctx context.Context) ([]models.Solicitud, error) {
	solicitudes, err := s.solicitudRepo.ObtenerSolicitudes(ctx)
	if err != nil {
		return nil, err
	}
	if solicitudes == nil {
		return make([]models.Solicitud, 0), nil
	}
	return solicitudes, nil
}

