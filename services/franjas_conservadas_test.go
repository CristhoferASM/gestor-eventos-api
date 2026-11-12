package services_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"gestor-eventos-api/models"
	"gestor-eventos-api/services"
	"gestor-eventos-api/storage"
)

// Cuando la petición NO trae tiempos técnicos, se conservan TAL CUAL los del evento: nunca se mueve ni se desactiva un horario
// que nadie pidió mover. Si con la fecha u horario propuestos ya no encajan, la respuesta es un error claro (400).
//
// El evento 1 en memoria: 15/11/2026 de 09:00 a 13:00, montaje 08:00-09:00 y desmontaje 13:00-14:00 el mismo día.

func crearSinTiempos(t *testing.T, dto models.SolicitudCreacionDTO) (models.Solicitud, error) {
	t.Helper()
	store := storage.NewMemoryStore()
	svc := services.NewSolicitudService(store, store)
	dto.EventoID = 1
	if dto.Motivo == "" {
		dto.Motivo = "Cambio"
	}
	return svc.CrearSolicitud(context.Background(), dto)
}

func TestSinTiemposTecnicosSeConservanTalCual(t *testing.T) {
	// Solo cambia el nombre: la fecha y el horario siguen siendo los del evento
	creada, err := crearSinTiempos(t, models.SolicitudCreacionDTO{
		FechaPropuesta: "2026-11-15", HoraInicioPropuesta: "09:00", HoraFinPropuesta: "13:00",
		InformacionGeneralPropuesta: &models.InformacionGeneralPropuestaDTO{
			Nombre: "Graduación 2026 (nombre nuevo)", Contacto: "María Rodríguez", Telefono: "998 765 432", Correo: "m.rodriguez@demo-showtech.test",
		},
	})
	if err != nil {
		t.Fatalf("error inesperado: %v", err)
	}
	p := creada.DatosPropuestos
	if !p.HasMontaje || p.MontajeFecha != "2026-11-15" || p.MontajeHoraInicio != "08:00" || p.MontajeHoraFin != "09:00" {
		t.Errorf("el montaje debía conservarse tal cual, quedó: %+v", p)
	}
	if !p.HasDesmontaje || p.DesmontajeFecha != "2026-11-15" || p.DesmontajeHoraInicio != "13:00" || p.DesmontajeHoraFin != "14:00" {
		t.Errorf("el desmontaje debía conservarse tal cual, quedó: %+v", p)
	}
}

func TestSinTiemposTecnicosUnCambioDeFechaDaErrorClaro(t *testing.T) {
	_, err := crearSinTiempos(t, models.SolicitudCreacionDTO{
		FechaPropuesta: "2026-11-19", HoraInicioPropuesta: "09:00", HoraFinPropuesta: "13:00",
	})
	if !errors.Is(err, services.ErrDatosInvalidos) {
		t.Fatalf("se esperaba un error de datos inválidos (400), se obtuvo: %v", err)
	}
	for _, trozo := range []string{"montaje programado el 2026-11-15", "no está en la fecha del evento (2026-11-19)", "tiempos_tecnicos_propuestos"} {
		if !strings.Contains(err.Error(), trozo) {
			t.Errorf("el mensaje debía mencionar %q: %v", trozo, err)
		}
	}
}

func TestSinTiemposTecnicosAdelantarElEventoChocaConElMontaje(t *testing.T) {
	// El montaje termina a las 09:00: con el evento empezando a las 08:30 ya no es previo al evento
	_, err := crearSinTiempos(t, models.SolicitudCreacionDTO{
		FechaPropuesta: "2026-11-15", HoraInicioPropuesta: "08:30", HoraFinPropuesta: "13:00",
	})
	if !errors.Is(err, services.ErrDatosInvalidos) || !strings.Contains(err.Error(), "terminaría después del nuevo inicio del evento (08:30)") {
		t.Fatalf("se esperaba el error claro del montaje, se obtuvo: %v", err)
	}
}

func TestSinTiemposTecnicosAlargarElEventoChocaConElDesmontaje(t *testing.T) {
	// El desmontaje empieza a las 13:00: con el evento terminando a las 14:30 empezaría antes del fin
	_, err := crearSinTiempos(t, models.SolicitudCreacionDTO{
		FechaPropuesta: "2026-11-15", HoraInicioPropuesta: "09:00", HoraFinPropuesta: "14:30",
	})
	if !errors.Is(err, services.ErrDatosInvalidos) || !strings.Contains(err.Error(), "empezaría antes del nuevo fin del evento (14:30)") {
		t.Fatalf("se esperaba el error claro del desmontaje, se obtuvo: %v", err)
	}
}

func TestSinTiemposTecnicosAcortarElEventoNoMueveNada(t *testing.T) {
	// El evento termina antes (12:00): el desmontaje de 13:00 a 14:00 sigue siendo posterior y NO se adelanta solo
	creada, err := crearSinTiempos(t, models.SolicitudCreacionDTO{
		FechaPropuesta: "2026-11-15", HoraInicioPropuesta: "09:00", HoraFinPropuesta: "12:00",
	})
	if err != nil {
		t.Fatalf("error inesperado: %v", err)
	}
	p := creada.DatosPropuestos
	if p.DesmontajeHoraInicio != "13:00" || p.DesmontajeHoraFin != "14:00" || p.MontajeHoraInicio != "08:00" || p.MontajeHoraFin != "09:00" {
		t.Errorf("las franjas no debían moverse: %+v", p)
	}
}

func TestConTiemposTecnicosExplicitosSiSePuedeCambiarLaFecha(t *testing.T) {
	// La salida del error anterior: enviar los tiempos técnicos nuevos
	creada, err := crearSinTiempos(t, models.SolicitudCreacionDTO{
		FechaPropuesta: "2026-11-19", HoraInicioPropuesta: "09:00", HoraFinPropuesta: "13:00",
		TiemposTecnicosPropuestos: &models.TiemposTecnicosPropuestosDTO{
			HasMontaje: true, MontajeFecha: "2026-11-19", MontajeHoraInicio: "08:00", MontajeHoraFin: "09:00",
			HasDesmontaje: true, DesmontajeFecha: "2026-11-19", DesmontajeHoraInicio: "13:00", DesmontajeHoraFin: "14:00",
		},
	})
	if err != nil {
		t.Fatalf("error inesperado: %v", err)
	}
	if creada.DatosPropuestos.MontajeFecha != "2026-11-19" || creada.DatosPropuestos.DesmontajeFecha != "2026-11-19" {
		t.Errorf("las franjas debían quedar en la nueva fecha: %+v", creada.DatosPropuestos)
	}
}
