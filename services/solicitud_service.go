package services

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"
)

const (
	MaxRunasMotivo        = 400
	MaxRunasNombreEvento  = 120
	MaxRunasContacto      = 80
	MaxRunasTelefono      = 25
	MaxRunasCorreo        = 80
	MaxRunasObservaciones = 300
)

var patronCorreoBasico = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`)

// ClockFunc define una función proveedora de tiempo para permitir pruebas deterministas de fecha_creacion.
type ClockFunc func() time.Time

// SolicitudService contiene las validaciones de negocio, construcción de snapshots y registro de solicitudes.
//
// Nota sobre fecha_creacion: se formatea en RFC 3339 con offset de zona horaria explícito usando el reloj configurado
// (s.clock().Format(time.RFC3339)), permitiendo una conversión precisa de instantes en el frontend (America/Lima).
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

// esCorreoValido comprueba que un correo electrónico no vacío tenga un formato sintáctico válido,
// utilizando la misma regla determinista que el frontend Angular.
func esCorreoValido(correo string) bool {
	if !patronCorreoBasico.MatchString(correo) || strings.Contains(correo, "..") {
		return false
	}
	partes := strings.Split(correo, "@")
	if len(partes) != 2 {
		return false
	}
	local, dominio := partes[0], partes[1]
	if strings.HasPrefix(local, ".") || strings.HasSuffix(local, ".") ||
		strings.HasPrefix(dominio, ".") || strings.HasSuffix(dominio, ".") {
		return false
	}
	etiquetas := strings.Split(dominio, ".")
	if len(etiquetas) < 2 {
		return false
	}
	for _, et := range etiquetas {
		if et == "" || strings.HasPrefix(et, "-") || strings.HasSuffix(et, "-") {
			return false
		}
	}
	return true
}

func sonAdicionalesIguales(orig, prop []models.AdicionalItem) bool {
	if len(orig) != len(prop) {
		return false
	}
	mapOrig := make(map[string]models.AdicionalItem, len(orig))
	for _, item := range orig {
		mapOrig[item.ID] = item
	}
	for _, item := range prop {
		o, ok := mapOrig[item.ID]
		if !ok {
			return false
		}
		if o.Cantidad != item.Cantidad || o.Horas != item.Horas || o.TarifaHora != item.TarifaHora || o.Subtotal != item.Subtotal {
			return false
		}
	}
	return true
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
	if utf8.RuneCountInString(motivoLimpio) > MaxRunasMotivo {
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

	// 7. Procesar y validar el bloque de información general y contacto
	origNombre := strings.TrimSpace(evento.Nombre)
	origContacto := strings.TrimSpace(evento.Contacto)
	origTelefono := strings.TrimSpace(evento.Telefono)
	origCorreo := strings.TrimSpace(evento.Correo)
	origObservaciones := strings.TrimSpace(evento.Observaciones)

	nombreProp := origNombre
	contactoProp := origContacto
	telefonoProp := origTelefono
	correoProp := origCorreo
	observacionesProp := origObservaciones

	if dto.InformacionGeneralPropuesta != nil {
		nombreProp = strings.TrimSpace(dto.InformacionGeneralPropuesta.Nombre)
		contactoProp = strings.TrimSpace(dto.InformacionGeneralPropuesta.Contacto)
		telefonoProp = strings.TrimSpace(dto.InformacionGeneralPropuesta.Telefono)
		correoProp = strings.TrimSpace(dto.InformacionGeneralPropuesta.Correo)
		observacionesProp = strings.TrimSpace(dto.InformacionGeneralPropuesta.Observaciones)

		if nombreProp == "" {
			return models.Solicitud{}, nuevoErrorValidacion("El nombre del evento es obligatorio.")
		}
		if utf8.RuneCountInString(nombreProp) > MaxRunasNombreEvento {
			return models.Solicitud{}, nuevoErrorValidacion("El nombre del evento no puede exceder los 120 caracteres.")
		}

		if contactoProp == "" {
			return models.Solicitud{}, nuevoErrorValidacion("La persona de contacto es obligatoria.")
		}
		if utf8.RuneCountInString(contactoProp) > MaxRunasContacto {
			return models.Solicitud{}, nuevoErrorValidacion("La persona de contacto no puede exceder los 80 caracteres.")
		}

		if utf8.RuneCountInString(telefonoProp) > MaxRunasTelefono {
			return models.Solicitud{}, nuevoErrorValidacion("El teléfono de contacto no puede exceder los 25 caracteres.")
		}

		if utf8.RuneCountInString(correoProp) > MaxRunasCorreo {
			return models.Solicitud{}, nuevoErrorValidacion("El correo electrónico no puede exceder los 80 caracteres.")
		}
		if correoProp != "" && !esCorreoValido(correoProp) {
			return models.Solicitud{}, nuevoErrorValidacion("El correo electrónico no tiene un formato válido.")
		}

		if utf8.RuneCountInString(observacionesProp) > MaxRunasObservaciones {
			return models.Solicitud{}, nuevoErrorValidacion("Las observaciones y requerimientos no pueden exceder los 300 caracteres.")
		}
	}

	// 8. Procesar y validar tiempos técnicos (montaje, desmontaje y ensayo)
	hasMontajeProp := evento.HasMontaje
	montajeFechaProp := strings.TrimSpace(evento.MontajeFecha)
	montajeHoraInicioProp := strings.TrimSpace(evento.MontajeHoraInicio)
	montajeHoraFinProp := strings.TrimSpace(evento.MontajeHoraFin)

	hasDesmontajeProp := evento.HasDesmontaje
	desmontajeFechaProp := strings.TrimSpace(evento.DesmontajeFecha)
	desmontajeHoraInicioProp := strings.TrimSpace(evento.DesmontajeHoraInicio)
	desmontajeHoraFinProp := strings.TrimSpace(evento.DesmontajeHoraFin)

	hasEnsayoProp := evento.HasEnsayo
	ensayoFechaProp := strings.TrimSpace(evento.EnsayoFecha)
	ensayoHoraInicioProp := strings.TrimSpace(evento.EnsayoHoraInicio)
	ensayoHoraFinProp := strings.TrimSpace(evento.EnsayoHoraFin)

	tiemposEspecificados := false
	if dto.TiemposTecnicosPropuestos != nil {
		tiemposEspecificados = true
		hasMontajeProp = dto.TiemposTecnicosPropuestos.HasMontaje
		montajeFechaProp = strings.TrimSpace(dto.TiemposTecnicosPropuestos.MontajeFecha)
		montajeHoraInicioProp = strings.TrimSpace(dto.TiemposTecnicosPropuestos.MontajeHoraInicio)
		montajeHoraFinProp = strings.TrimSpace(dto.TiemposTecnicosPropuestos.MontajeHoraFin)

		hasDesmontajeProp = dto.TiemposTecnicosPropuestos.HasDesmontaje
		desmontajeFechaProp = strings.TrimSpace(dto.TiemposTecnicosPropuestos.DesmontajeFecha)
		desmontajeHoraInicioProp = strings.TrimSpace(dto.TiemposTecnicosPropuestos.DesmontajeHoraInicio)
		desmontajeHoraFinProp = strings.TrimSpace(dto.TiemposTecnicosPropuestos.DesmontajeHoraFin)

		hasEnsayoProp = dto.TiemposTecnicosPropuestos.HasEnsayo
		ensayoFechaProp = strings.TrimSpace(dto.TiemposTecnicosPropuestos.EnsayoFecha)
		ensayoHoraInicioProp = strings.TrimSpace(dto.TiemposTecnicosPropuestos.EnsayoHoraInicio)
		ensayoHoraFinProp = strings.TrimSpace(dto.TiemposTecnicosPropuestos.EnsayoHoraFin)
	} else if dto.HasMontaje != nil || dto.HasDesmontaje != nil || dto.HasEnsayo != nil {
		tiemposEspecificados = true
		if dto.HasMontaje != nil {
			hasMontajeProp = *dto.HasMontaje
			montajeFechaProp = strings.TrimSpace(dto.MontajeFecha)
			montajeHoraInicioProp = strings.TrimSpace(dto.MontajeHoraInicio)
			montajeHoraFinProp = strings.TrimSpace(dto.MontajeHoraFin)
		}
		if dto.HasDesmontaje != nil {
			hasDesmontajeProp = *dto.HasDesmontaje
			desmontajeFechaProp = strings.TrimSpace(dto.DesmontajeFecha)
			desmontajeHoraInicioProp = strings.TrimSpace(dto.DesmontajeHoraInicio)
			desmontajeHoraFinProp = strings.TrimSpace(dto.DesmontajeHoraFin)
		}
		if dto.HasEnsayo != nil {
			hasEnsayoProp = *dto.HasEnsayo
			ensayoFechaProp = strings.TrimSpace(dto.EnsayoFecha)
			ensayoHoraInicioProp = strings.TrimSpace(dto.EnsayoHoraInicio)
			ensayoHoraFinProp = strings.TrimSpace(dto.EnsayoHoraFin)
		}
	} else {
		// En peticiones compatibles que no envían tiempos técnicos, si el evento tiene franjas activas,
		// sus fechas se sincronizan con la fecha propuesta y sus horarios se mantienen coherentes
		// con el horario del evento (montaje finaliza al iniciar el evento y desmontaje inicia al concluir).
		if hasMontajeProp {
			montajeFechaProp = fechaLimpia
			tMIniOrig, _, _ := parseHora(evento.MontajeHoraInicio)
			tMFinOrig, _, _ := parseHora(evento.MontajeHoraFin)
			duracion := tMFinOrig.Sub(tMIniOrig)
			if duracion <= 0 {
				duracion = time.Hour
			}
			nuevoFin := tInicio
			nuevoInicio := nuevoFin.Add(-duracion)
			if nuevoInicio.Before(limiteMin) {
				if tInicio.After(limiteMin) {
					nuevoInicio = limiteMin
					montajeHoraInicioProp = fmt.Sprintf("%02d:%02d", nuevoInicio.Hour(), nuevoInicio.Minute())
					montajeHoraFinProp = fmt.Sprintf("%02d:%02d", nuevoFin.Hour(), nuevoFin.Minute())
				} else {
					hasMontajeProp = false
					montajeFechaProp = ""
					montajeHoraInicioProp = ""
					montajeHoraFinProp = ""
				}
			} else {
				montajeHoraInicioProp = fmt.Sprintf("%02d:%02d", nuevoInicio.Hour(), nuevoInicio.Minute())
				montajeHoraFinProp = fmt.Sprintf("%02d:%02d", nuevoFin.Hour(), nuevoFin.Minute())
			}
		}
		if hasDesmontajeProp {
			desmontajeFechaProp = fechaLimpia
			tDIniOrig, _, _ := parseHora(evento.DesmontajeHoraInicio)
			tDFinOrig, _, _ := parseHora(evento.DesmontajeHoraFin)
			duracion := tDFinOrig.Sub(tDIniOrig)
			if duracion <= 0 {
				duracion = time.Hour
			}
			nuevoInicio := tFin
			nuevoFin := nuevoInicio.Add(duracion)
			if nuevoFin.After(limiteMax) {
				if tFin.Before(limiteMax) {
					nuevoFin = limiteMax
					desmontajeHoraInicioProp = fmt.Sprintf("%02d:%02d", nuevoInicio.Hour(), nuevoInicio.Minute())
					desmontajeHoraFinProp = fmt.Sprintf("%02d:%02d", nuevoFin.Hour(), nuevoFin.Minute())
				} else {
					hasDesmontajeProp = false
					desmontajeFechaProp = ""
					desmontajeHoraInicioProp = ""
					desmontajeHoraFinProp = ""
				}
			} else {
				desmontajeHoraInicioProp = fmt.Sprintf("%02d:%02d", nuevoInicio.Hour(), nuevoInicio.Minute())
				desmontajeHoraFinProp = fmt.Sprintf("%02d:%02d", nuevoFin.Hour(), nuevoFin.Minute())
			}
		}
		if hasEnsayoProp {
			ensayoFechaProp = fechaLimpia
		}
	}

	var tMontajeInicio, tMontajeFin time.Time
	if hasMontajeProp {
		if _, err := time.Parse("2006-01-02", montajeFechaProp); err != nil {
			return models.Solicitud{}, nuevoErrorValidacion("La fecha de montaje debe tener el formato YYYY-MM-DD.")
		}
		if montajeFechaProp != fechaLimpia {
			return models.Solicitud{}, nuevoErrorValidacion("El montaje debe realizarse en la misma fecha del evento.")
		}
		tMIni, mIniNorm, errMIni := parseHora(montajeHoraInicioProp)
		tMFin, mFinNorm, errMFin := parseHora(montajeHoraFinProp)
		if errMIni != nil || errMFin != nil {
			return models.Solicitud{}, nuevoErrorValidacion("Las horas de montaje deben tener el formato HH:MM (ej. '08:00').")
		}
		if tMIni.Before(limiteMin) || tMIni.After(limiteMax) || tMFin.Before(limiteMin) || tMFin.After(limiteMax) {
			return models.Solicitud{}, nuevoErrorValidacion("Los horarios de montaje deben estar comprendidos entre las 06:00 y las 22:00 inclusive.")
		}
		if !tMIni.Before(tMFin) {
			return models.Solicitud{}, nuevoErrorValidacion("La hora de inicio del montaje debe ser anterior a su hora de fin.")
		}
		if tMFin.After(tInicio) {
			return models.Solicitud{}, nuevoErrorValidacion("El montaje no puede finalizar después del inicio del evento.")
		}
		tMontajeInicio = tMIni
		tMontajeFin = tMFin
		montajeHoraInicioProp = mIniNorm
		montajeHoraFinProp = mFinNorm
	} else {
		montajeFechaProp = ""
		montajeHoraInicioProp = ""
		montajeHoraFinProp = ""
	}

	if hasDesmontajeProp {
		if _, err := time.Parse("2006-01-02", desmontajeFechaProp); err != nil {
			return models.Solicitud{}, nuevoErrorValidacion("La fecha de desmontaje debe tener el formato YYYY-MM-DD.")
		}
		if desmontajeFechaProp != fechaLimpia {
			return models.Solicitud{}, nuevoErrorValidacion("El desmontaje debe realizarse en la misma fecha del evento.")
		}
		tDIni, dIniNorm, errDIni := parseHora(desmontajeHoraInicioProp)
		tDFin, dFinNorm, errDFin := parseHora(desmontajeHoraFinProp)
		if errDIni != nil || errDFin != nil {
			return models.Solicitud{}, nuevoErrorValidacion("Las horas de desmontaje deben tener el formato HH:MM (ej. '13:00').")
		}
		if tDIni.Before(limiteMin) || tDIni.After(limiteMax) || tDFin.Before(limiteMin) || tDFin.After(limiteMax) {
			return models.Solicitud{}, nuevoErrorValidacion("Los horarios de desmontaje deben estar comprendidos entre las 06:00 y las 22:00 inclusive.")
		}
		if !tDIni.Before(tDFin) {
			return models.Solicitud{}, nuevoErrorValidacion("La hora de inicio del desmontaje debe ser anterior a su hora de fin.")
		}
		if tDIni.Before(tFin) {
			return models.Solicitud{}, nuevoErrorValidacion("El desmontaje no puede iniciar antes del fin del evento.")
		}
		desmontajeHoraInicioProp = dIniNorm
		desmontajeHoraFinProp = dFinNorm
	} else {
		desmontajeFechaProp = ""
		desmontajeHoraInicioProp = ""
		desmontajeHoraFinProp = ""
	}

	if hasEnsayoProp {
		if _, err := time.Parse("2006-01-02", ensayoFechaProp); err != nil {
			return models.Solicitud{}, nuevoErrorValidacion("La fecha del ensayo técnico debe tener el formato YYYY-MM-DD.")
		}
		if ensayoFechaProp != fechaLimpia {
			return models.Solicitud{}, nuevoErrorValidacion("El ensayo técnico debe realizarse en la misma fecha del evento.")
		}
		tEIni, eIniNorm, errEIni := parseHora(ensayoHoraInicioProp)
		tEFin, eFinNorm, errEFin := parseHora(ensayoHoraFinProp)
		if errEIni != nil || errEFin != nil {
			return models.Solicitud{}, nuevoErrorValidacion("Las horas del ensayo técnico deben tener el formato HH:MM (ej. '08:00').")
		}
		if tEIni.Before(limiteMin) || tEIni.After(limiteMax) || tEFin.Before(limiteMin) || tEFin.After(limiteMax) {
			return models.Solicitud{}, nuevoErrorValidacion("Los horarios del ensayo técnico deben estar comprendidos entre las 06:00 y las 22:00 inclusive.")
		}
		if !tEIni.Before(tEFin) {
			return models.Solicitud{}, nuevoErrorValidacion("La hora de inicio del ensayo técnico debe ser anterior a su hora de fin.")
		}
		if tEFin.After(tInicio) {
			return models.Solicitud{}, nuevoErrorValidacion("El ensayo técnico debe culminar antes de la hora de inicio del evento.")
		}
		if hasMontajeProp {
			// No deben solaparse. Franjas contiguas permitidas: tEFin <= tMontajeInicio || tEIni >= tMontajeFin
			if !(tEFin.Before(tMontajeInicio) || tEFin.Equal(tMontajeInicio) || tEIni.After(tMontajeFin) || tEIni.Equal(tMontajeFin)) {
				return models.Solicitud{}, nuevoErrorValidacion("El ensayo técnico no puede cruzarse con el montaje del evento.")
			}
		}
		ensayoHoraInicioProp = eIniNorm
		ensayoHoraFinProp = eFinNorm
	} else {
		ensayoFechaProp = ""
		ensayoHoraInicioProp = ""
		ensayoHoraFinProp = ""
	}

	// 8b. Procesar y validar bloque de adicionales del evento
	origAdicionales := make([]models.AdicionalItem, len(evento.Adicionales))
	copy(origAdicionales, evento.Adicionales)

	var propAdicionales []models.AdicionalItem
	if dto.AdicionalesPropuestos == nil {
		propAdicionales = make([]models.AdicionalItem, len(evento.Adicionales))
		copy(propAdicionales, evento.Adicionales)
	} else {
		propAdicionales = make([]models.AdicionalItem, 0, len(*dto.AdicionalesPropuestos))
		vistos := make(map[string]bool)
		for _, adicDTO := range *dto.AdicionalesPropuestos {
			idLimpio := strings.TrimSpace(adicDTO.ID)
			if idLimpio == "" {
				return models.Solicitud{}, nuevoErrorValidacion("El identificador del adicional es obligatorio.")
			}
			catItem := models.ObtenerAdicionalCatalogo(idLimpio)
			if catItem == nil {
				return models.Solicitud{}, nuevoErrorValidacion(fmt.Sprintf("El adicional '%s' no existe en el catálogo de servicios.", idLimpio))
			}
			if vistos[idLimpio] {
				return models.Solicitud{}, nuevoErrorValidacion(fmt.Sprintf("El adicional '%s' se encuentra duplicado en la propuesta.", idLimpio))
			}
			vistos[idLimpio] = true

			if adicDTO.Cantidad <= 0 {
				return models.Solicitud{}, nuevoErrorValidacion("La cantidad de unidades debe ser un número entero mayor a 0.")
			}
			if adicDTO.Horas <= 0 {
				return models.Solicitud{}, nuevoErrorValidacion("Las horas de uso deben ser un número entero mayor a 0.")
			}

			subtotal := float64(adicDTO.Cantidad*adicDTO.Horas) * catItem.TarifaHora
			subtotal = float64(int64(subtotal*100+0.5)) / 100

			propAdicionales = append(propAdicionales, models.AdicionalItem{
				ID:         catItem.ID,
				Nombre:     catItem.Nombre,
				Unidad:     catItem.Unidad,
				Cantidad:   adicDTO.Cantidad,
				Horas:      adicDTO.Horas,
				TarifaHora: catItem.TarifaHora,
				Subtotal:   subtotal,
			})
		}
	}

	hayCambioAdicionales := !sonAdicionalesIguales(origAdicionales, propAdicionales)

	// 9. Validar existencia de al menos un cambio efectivo entre todos los campos admitidos
	hayCambioHorario := fechaLimpia != evento.Fecha || horaInicioNorm != evento.HoraInicio || horaFinNorm != evento.HoraFin
	hayCambioInfoGeneral := nombreProp != origNombre ||
		contactoProp != origContacto ||
		telefonoProp != origTelefono ||
		correoProp != origCorreo ||
		observacionesProp != origObservaciones
	hayCambioTiemposTecnicos := (hasMontajeProp != evento.HasMontaje) ||
		(hasMontajeProp && (montajeFechaProp != evento.MontajeFecha || montajeHoraInicioProp != evento.MontajeHoraInicio || montajeHoraFinProp != evento.MontajeHoraFin)) ||
		(hasDesmontajeProp != evento.HasDesmontaje) ||
		(hasDesmontajeProp && (desmontajeFechaProp != evento.DesmontajeFecha || desmontajeHoraInicioProp != evento.DesmontajeHoraInicio || desmontajeHoraFinProp != evento.DesmontajeHoraFin)) ||
		(hasEnsayoProp != evento.HasEnsayo) ||
		(hasEnsayoProp && (ensayoFechaProp != evento.EnsayoFecha || ensayoHoraInicioProp != evento.EnsayoHoraInicio || ensayoHoraFinProp != evento.EnsayoHoraFin))

	if !hayCambioHorario && !hayCambioInfoGeneral && !hayCambioTiemposTecnicos && !hayCambioAdicionales {
		return models.Solicitud{}, nuevoErrorValidacion("La solicitud debe proponer al menos un cambio efectivo en la información general, contacto, fecha, horario, tiempos técnicos o adicionales respecto al evento original.")
	}

	var tiemposPropuestosDTO *models.TiemposTecnicosPropuestosDTO
	if tiemposEspecificados {
		tiemposPropuestosDTO = &models.TiemposTecnicosPropuestosDTO{
			HasMontaje:           hasMontajeProp,
			MontajeFecha:         montajeFechaProp,
			MontajeHoraInicio:    montajeHoraInicioProp,
			MontajeHoraFin:       montajeHoraFinProp,
			HasDesmontaje:        hasDesmontajeProp,
			DesmontajeFecha:      desmontajeFechaProp,
			DesmontajeHoraInicio: desmontajeHoraInicioProp,
			DesmontajeHoraFin:    desmontajeHoraFinProp,
			HasEnsayo:            hasEnsayoProp,
			EnsayoFecha:          ensayoFechaProp,
			EnsayoHoraInicio:     ensayoHoraInicioProp,
			EnsayoHoraFin:        ensayoHoraFinProp,
		}
	}

	// 10. Construir solicitud con snapshots independientes de todos los datos originales y propuestos
	nuevaSolicitud := models.Solicitud{
		EventoID:            evento.ID,
		Motivo:              motivoLimpio,
		FechaPropuesta:      fechaLimpia,
		HoraInicioPropuesta: horaInicioNorm,
		HoraFinPropuesta:    horaFinNorm,
		InformacionGeneralPropuesta: models.InformacionGeneralPropuestaDTO{
			Nombre:        nombreProp,
			Contacto:      contactoProp,
			Telefono:      telefonoProp,
			Correo:        correoProp,
			Observaciones: observacionesProp,
		},
		TiemposTecnicosPropuestos: tiemposPropuestosDTO,
		AdicionalesPropuestos:     dto.AdicionalesPropuestos,
		Estado:                    models.EstadoPendienteRevision,
		FechaCreacion:             s.clock().Format(time.RFC3339),
		DatosOriginales: models.DatosHorario{
			Nombre:               origNombre,
			Espacio:              evento.Espacio,
			Contacto:             origContacto,
			Telefono:             origTelefono,
			Correo:               origCorreo,
			Observaciones:        origObservaciones,
			Fecha:                evento.Fecha,
			HoraInicio:           evento.HoraInicio,
			HoraFin:              evento.HoraFin,
			HasMontaje:           evento.HasMontaje,
			MontajeFecha:         evento.MontajeFecha,
			MontajeHoraInicio:    evento.MontajeHoraInicio,
			MontajeHoraFin:       evento.MontajeHoraFin,
			HasDesmontaje:        evento.HasDesmontaje,
			DesmontajeFecha:      evento.DesmontajeFecha,
			DesmontajeHoraInicio: evento.DesmontajeHoraInicio,
			DesmontajeHoraFin:    evento.DesmontajeHoraFin,
			HasEnsayo:            evento.HasEnsayo,
			EnsayoFecha:          evento.EnsayoFecha,
			EnsayoHoraInicio:     evento.EnsayoHoraInicio,
			EnsayoHoraFin:        evento.EnsayoHoraFin,
			Adicionales:          origAdicionales,
		},
		DatosPropuestos: models.DatosHorario{
			Nombre:               nombreProp,
			Espacio:              evento.Espacio,
			Contacto:             contactoProp,
			Telefono:             telefonoProp,
			Correo:               correoProp,
			Observaciones:        observacionesProp,
			Fecha:                fechaLimpia,
			HoraInicio:           horaInicioNorm,
			HoraFin:              horaFinNorm,
			HasMontaje:           hasMontajeProp,
			MontajeFecha:         montajeFechaProp,
			MontajeHoraInicio:    montajeHoraInicioProp,
			MontajeHoraFin:       montajeHoraFinProp,
			HasDesmontaje:        hasDesmontajeProp,
			DesmontajeFecha:      desmontajeFechaProp,
			DesmontajeHoraInicio: desmontajeHoraInicioProp,
			DesmontajeHoraFin:    desmontajeHoraFinProp,
			HasEnsayo:            hasEnsayoProp,
			EnsayoFecha:          ensayoFechaProp,
			EnsayoHoraInicio:     ensayoHoraInicioProp,
			EnsayoHoraFin:        ensayoHoraFinProp,
			Adicionales:          propAdicionales,
		},
	}

	// 11. Coordinar el registro atómico mediante el repositorio
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
