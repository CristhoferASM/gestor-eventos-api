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

// Datos de prueba: el evento 1 ocupa el 2026-11-15 de 08:00 a 14:00 (montaje 08-09, evento 09-13, desmontaje 13-14).
// El evento 2 es el del 2026-11-20 de 14:00 a 18:00 y no tiene tiempos técnicos.

func solicitudEvento2(fecha, inicio, fin string, tiempos *models.TiemposTecnicosPropuestosDTO) models.SolicitudCreacionDTO {
	return models.SolicitudCreacionDTO{
		EventoID: 2, Motivo: "Cambio de agenda", FechaPropuesta: fecha,
		HoraInicioPropuesta: inicio, HoraFinPropuesta: fin, TiemposTecnicosPropuestos: tiempos,
	}
}

func servicioConBloqueos(store *storage.Store) *services.SolicitudService {
	return services.NewSolicitudService(store, store).ConBloqueos(store)
}

func TestDisponibilidadChoqueConOtraReservaNoRevelaDatos(t *testing.T) {
	store := storage.NewMemoryStore()
	svc := servicioConBloqueos(store)

	// 13:30-14:30 se cruza con el desmontaje del evento 1 (13:00-14:00)
	_, err := svc.CrearSolicitud(context.Background(), solicitudEvento2("2026-11-15", "13:30", "14:30", nil))
	if !errors.Is(err, services.ErrSinDisponibilidad) {
		t.Fatalf("se esperaba ErrSinDisponibilidad, se obtuvo %v", err)
	}
	msg := err.Error()
	for _, prohibido := range []string{"Ceremonia", "graduación", "Horizonte", "CLI-001", "María"} {
		if strings.Contains(msg, prohibido) {
			t.Errorf("el mensaje no debe revelar datos de otro evento (%q): %s", prohibido, msg)
		}
	}
	if !strings.Contains(msg, "ya cuenta con una reserva programada") {
		t.Errorf("mensaje inesperado: %s", msg)
	}
}

func TestDisponibilidadPermiteTocarseEnElBorde(t *testing.T) {
	store := storage.NewMemoryStore()
	svc := servicioConBloqueos(store)

	// El evento 1 termina (desmontaje) a las 14:00: empezar justo a las 14:00 es válido
	if _, err := svc.CrearSolicitud(context.Background(), solicitudEvento2("2026-11-15", "14:00", "15:00", nil)); err != nil {
		t.Errorf("tocarse en el borde no es conflicto: %v", err)
	}
}

func TestDisponibilidadConsideraMontajeYEnsayoEnElBloqueOcupado(t *testing.T) {
	store := storage.NewMemoryStore()
	svc := servicioConBloqueos(store)

	// Evento de 15:00 a 16:00 es válido por sí solo, pero con un montaje 13:00-15:00 ocupa desde las 13:00
	// y choca con el desmontaje del evento 1 (hasta las 14:00)
	tiempos := &models.TiemposTecnicosPropuestosDTO{
		HasMontaje: true, MontajeFecha: "2026-11-15", MontajeHoraInicio: "13:00", MontajeHoraFin: "15:00",
	}
	_, err := svc.CrearSolicitud(context.Background(), solicitudEvento2("2026-11-15", "15:00", "16:00", tiempos))
	if !errors.Is(err, services.ErrSinDisponibilidad) {
		t.Fatalf("el montaje debe contar en el bloque ocupado: %v", err)
	}
}

func TestDisponibilidadOtroDiaNoChoca(t *testing.T) {
	store := storage.NewMemoryStore()
	svc := servicioConBloqueos(store)
	if _, err := svc.CrearSolicitud(context.Background(), solicitudEvento2("2026-11-16", "09:00", "13:00", nil)); err != nil {
		t.Errorf("otro día debe estar disponible: %v", err)
	}
}

func TestDisponibilidadBloqueoInstitucional(t *testing.T) {
	store := storage.NewMemoryStore()
	store.AgregarBloqueo(models.BloqueoInstitucional{
		ID: "BLK-TEST", Titulo: "Mantenimiento", Fecha: "2026-11-25", HoraInicio: "10:00", HoraFin: "12:00",
	})
	svc := servicioConBloqueos(store)

	_, err := svc.CrearSolicitud(context.Background(), solicitudEvento2("2026-11-25", "11:00", "13:00", nil))
	if !errors.Is(err, services.ErrSinDisponibilidad) || !strings.Contains(err.Error(), "mantenimiento institucional") {
		t.Fatalf("se esperaba choque con el bloqueo: %v", err)
	}
	// Justo al terminar el bloqueo sí se puede
	if _, err := svc.CrearSolicitud(context.Background(), solicitudEvento2("2026-11-25", "12:00", "13:00", nil)); err != nil {
		t.Errorf("tocarse con el bloqueo en el borde es válido: %v", err)
	}
}

func TestDisponibilidadNoBloqueaCambiosQueNoTocanElHorario(t *testing.T) {
	store := storage.NewMemoryStore()
	svc := servicioConBloqueos(store)

	// Solo cambia el contacto del evento 1 (mismo horario): no se revisa disponibilidad
	_, err := svc.CrearSolicitud(context.Background(), models.SolicitudCreacionDTO{
		EventoID: 1, Motivo: "Nuevo contacto", FechaPropuesta: "2026-11-15",
		HoraInicioPropuesta: "09:00", HoraFinPropuesta: "13:00",
		InformacionGeneralPropuesta: &models.InformacionGeneralPropuestaDTO{
			Nombre: "Ceremonia de graduación", Contacto: "Otra Persona", Telefono: "999 111 222",
		},
	})
	if err != nil {
		t.Errorf("un cambio solo de contacto no debe revisar disponibilidad: %v", err)
	}
}

func TestDisponibilidadElPropioEventoNoCuentaComoConflicto(t *testing.T) {
	store := storage.NewMemoryStore()
	svc := servicioConBloqueos(store)
	// El evento 1 se mueve dentro de su propio espacio (10:00-13:00): no choca consigo mismo
	_, err := svc.CrearSolicitud(context.Background(), models.SolicitudCreacionDTO{
		EventoID: 1, Motivo: "Inicio más tarde", FechaPropuesta: "2026-11-15",
		HoraInicioPropuesta: "10:00", HoraFinPropuesta: "13:00",
	})
	if err != nil {
		t.Errorf("la propia reserva no debe contarse como conflicto: %v", err)
	}
}
