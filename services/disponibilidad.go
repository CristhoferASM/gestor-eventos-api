package services

import (
	"context"
	"errors"

	"gestor-eventos-api/models"
)

// ErrSinDisponibilidad indica que el horario propuesto choca con otra reserva o con un bloqueo institucional (HTTP 409).
var ErrSinDisponibilidad = errors.New("el auditorio no tiene disponibilidad en el horario propuesto")

// ErrorDisponibilidad lleva un mensaje seguro para el cliente: nunca incluye nombres ni datos de otros eventos.
type ErrorDisponibilidad struct {
	Mensaje string
}

func (e *ErrorDisponibilidad) Error() string { return e.Mensaje }

func (e *ErrorDisponibilidad) Unwrap() error { return ErrSinDisponibilidad }

const (
	mensajeConflictoReserva = "El auditorio ya cuenta con una reserva programada en este horario. Por favor, seleccione otro horario antes de enviar la solicitud."
	mensajeConflictoBloqueo = "El auditorio se encuentra reservado para mantenimiento institucional en ese horario. Por favor, seleccione otro horario."
)

// tramo es un intervalo del día en minutos desde las 00:00 (inicio inclusivo, fin exclusivo).
type tramo struct{ inicio, fin int }

// solapa indica si dos tramos se cruzan. Tocarse en el borde (uno termina cuando empieza el otro) NO es conflicto.
func (a tramo) solapa(b tramo) bool { return a.inicio < b.fin && a.fin > b.inicio }

func minutosDeHora(hhmm string) (int, bool) {
	if len(hhmm) != 5 || hhmm[2] != ':' {
		return 0, false
	}
	h := int(hhmm[0]-'0')*10 + int(hhmm[1]-'0')
	m := int(hhmm[3]-'0')*10 + int(hhmm[4]-'0')
	if h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, false
	}
	return h*60 + m, true
}

// bloqueOcupado calcula, para la fecha principal, el tramo total que un evento ocupa en el auditorio:
// desde el montaje o el ensayo (lo más temprano) hasta el desmontaje (lo más tarde), como en el prototipo.
// Un tiempo técnico solo cuenta si ocurre el mismo día; si no trae fecha se asume la del evento.
func bloqueOcupado(d models.DatosHorario) (tramo, bool) {
	ini, ok1 := minutosDeHora(d.HoraInicio)
	fin, ok2 := minutosDeHora(d.HoraFin)
	if !ok1 || !ok2 {
		return tramo{}, false
	}
	mismoDia := func(fecha string) bool { return fecha == "" || fecha == d.Fecha }

	if d.HasMontaje && mismoDia(d.MontajeFecha) {
		if m, ok := minutosDeHora(d.MontajeHoraInicio); ok && m < ini {
			ini = m
		}
	}
	if d.HasEnsayo && mismoDia(d.EnsayoFecha) {
		if m, ok := minutosDeHora(d.EnsayoHoraInicio); ok && m < ini {
			ini = m
		}
	}
	if d.HasDesmontaje && mismoDia(d.DesmontajeFecha) {
		if m, ok := minutosDeHora(d.DesmontajeHoraFin); ok && m > fin {
			fin = m
		}
	}
	return tramo{ini, fin}, true
}

func datosDeEvento(e models.Evento) models.DatosHorario {
	return models.DatosHorario{
		Fecha: e.Fecha, HoraInicio: e.HoraInicio, HoraFin: e.HoraFin,
		HasMontaje: e.HasMontaje, MontajeFecha: e.MontajeFecha, MontajeHoraInicio: e.MontajeHoraInicio, MontajeHoraFin: e.MontajeHoraFin,
		HasDesmontaje: e.HasDesmontaje, DesmontajeFecha: e.DesmontajeFecha, DesmontajeHoraInicio: e.DesmontajeHoraInicio, DesmontajeHoraFin: e.DesmontajeHoraFin,
		HasEnsayo: e.HasEnsayo, EnsayoFecha: e.EnsayoFecha, EnsayoHoraInicio: e.EnsayoHoraInicio, EnsayoHoraFin: e.EnsayoHoraFin,
	}
}

// comprobarDisponibilidad revisa la propuesta contra las demás reservas confirmadas (excluyendo la del propio
// evento) y contra los bloqueos institucionales del mismo día. Devuelve *ErrorDisponibilidad si hay choque.
func (s *SolicitudService) comprobarDisponibilidad(ctx context.Context, eventoID uint, propuesta models.DatosHorario) error {
	propio, ok := bloqueOcupado(propuesta)
	if !ok {
		return nil // los formatos de hora ya se validaron antes; aquí no hay nada que comparar
	}

	eventos, err := s.eventoRepo.ObtenerEventos(ctx)
	if err != nil {
		return err
	}
	for _, otro := range eventos {
		// Un evento que aún no ocupa el auditorio (sin primer pago) no bloquea el horario
		if otro.ID == eventoID || otro.NoOcupaHorario || otro.Fecha != propuesta.Fecha {
			continue
		}
		if t, ok := bloqueOcupado(datosDeEvento(otro)); ok && propio.solapa(t) {
			return &ErrorDisponibilidad{Mensaje: mensajeConflictoReserva}
		}
	}

	if s.bloqueoRepo == nil {
		return nil
	}
	bloqueos, err := s.bloqueoRepo.ObtenerBloqueos(ctx)
	if err != nil {
		return err
	}
	for _, b := range bloqueos {
		if b.Fecha != propuesta.Fecha {
			continue
		}
		ini, ok1 := minutosDeHora(b.HoraInicio)
		fin, ok2 := minutosDeHora(b.HoraFin)
		if ok1 && ok2 && propio.solapa(tramo{ini, fin}) {
			return &ErrorDisponibilidad{Mensaje: mensajeConflictoBloqueo}
		}
	}
	return nil
}
