package services_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"
	"gestor-eventos-api/services"
	"gestor-eventos-api/storage"
)

type repoFalloSimulado struct {
	errEventos        error
	errEventoPorID    error
	errSolicitudes    error
	errCrearSolicitud error
	base              *storage.Store
}

func (r *repoFalloSimulado) ObtenerEventos(ctx context.Context) ([]models.Evento, error) {
	if r.errEventos != nil {
		return nil, r.errEventos
	}
	return r.base.ObtenerEventos(ctx)
}

func (r *repoFalloSimulado) ObtenerEventoPorID(ctx context.Context, id uint) (models.Evento, error) {
	if r.errEventoPorID != nil {
		return models.Evento{}, r.errEventoPorID
	}
	return r.base.ObtenerEventoPorID(ctx, id)
}

func (r *repoFalloSimulado) ObtenerSolicitudes(ctx context.Context) ([]models.Solicitud, error) {
	if r.errSolicitudes != nil {
		return nil, r.errSolicitudes
	}
	return r.base.ObtenerSolicitudes(ctx)
}

func (r *repoFalloSimulado) CrearSolicitud(ctx context.Context, sol models.Solicitud) (models.Solicitud, error) {
	if r.errCrearSolicitud != nil {
		return models.Solicitud{}, r.errCrearSolicitud
	}
	return r.base.CrearSolicitud(ctx, sol)
}

func TestEventoServiceSinHTTP(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStore()
	svc := services.NewEventoService(store)

	eventos, err := svc.ObtenerEventos(ctx)
	if err != nil {
		t.Fatalf("error inesperado al listar eventos: %v", err)
	}
	if len(eventos) != 2 {
		t.Fatalf("se esperaban 2 eventos iniciales, se obtuvieron %d", len(eventos))
	}

	ev, err := svc.ObtenerEventoPorID(ctx, 1)
	if err != nil {
		t.Fatalf("error inesperado al obtener evento 1: %v", err)
	}
	if ev.ID != 1 {
		t.Errorf("se esperaba ID 1, se obtuvo %d", ev.ID)
	}

	// ID cero debe rechazarse como dato inválido
	_, err = svc.ObtenerEventoPorID(ctx, 0)
	if !errors.Is(err, services.ErrDatosInvalidos) {
		t.Errorf("se esperaba ErrDatosInvalidos para ID 0, se obtuvo: %v", err)
	}

	// ID inexistente debe retornar ErrEventoNoEncontrado
	_, err = svc.ObtenerEventoPorID(ctx, 999)
	if !errors.Is(err, services.ErrEventoNoEncontrado) {
		t.Errorf("se esperaba ErrEventoNoEncontrado para ID 999, se obtuvo: %v", err)
	}
}

func TestSolicitudServiceRelojInyectadoYSnapshots(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStore()
	instanteFijo := time.Date(2026, 10, 30, 15, 30, 45, 0, time.UTC)
	svc := services.NewSolicitudServiceWithClock(store, store, func() time.Time {
		return instanteFijo
	})

	eventoAntes, err := store.ObtenerEventoPorID(ctx, 1)
	if err != nil {
		t.Fatalf("no se pudo obtener el evento 1: %v", err)
	}

	creada, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
		EventoID:            1,
		Motivo:              "  Cambio por logística técnica  ",
		FechaPropuesta:      " 2026-11-19 ",
		HoraInicioPropuesta: " 06:00 ",
		HoraFinPropuesta:    " 22:00 ",
	})
	if err != nil {
		t.Fatalf("error inesperado al crear solicitud: %v", err)
	}

	if creada.ID != 1 {
		t.Errorf("se esperaba ID 1, se obtuvo %d", creada.ID)
	}
	if creada.Motivo != "Cambio por logística técnica" {
		t.Errorf("se esperaba motivo limpio sin espacios externos, se obtuvo %q", creada.Motivo)
	}
	if creada.Estado != "Pendiente de revisión" {
		t.Errorf("se esperaba estado 'Pendiente de revisión', se obtuvo %q", creada.Estado)
	}
	if creada.FechaCreacion != "2026-10-30 15:30:45" {
		t.Errorf("se esperaba fecha_creacion '2026-10-30 15:30:45', se obtuvo %q", creada.FechaCreacion)
	}

	// Verificar snapshots originales y propuestos
	if creada.DatosOriginales != (models.DatosHorario{
		Fecha:      eventoAntes.Fecha,
		HoraInicio: eventoAntes.HoraInicio,
		HoraFin:    eventoAntes.HoraFin,
	}) {
		t.Errorf("snapshot de datos_originales no coincide: %+v", creada.DatosOriginales)
	}
	if creada.DatosPropuestos != (models.DatosHorario{
		Fecha:      "2026-11-19",
		HoraInicio: "06:00",
		HoraFin:    "22:00",
	}) {
		t.Errorf("snapshot de datos_propuestos no coincide: %+v", creada.DatosPropuestos)
	}

	// Verificar que el evento original permanece intacto
	eventoDespues, err := store.ObtenerEventoPorID(ctx, 1)
	if err != nil {
		t.Fatalf("error consultando evento 1: %v", err)
	}
	if eventoDespues != eventoAntes {
		t.Errorf("el evento original fue modificado: antes=%+v, despues=%+v", eventoAntes, eventoDespues)
	}
}

func TestSolicitudServiceFormatoEstrictoHorasYLimites(t *testing.T) {
	ctx := context.Background()

	casosValidos := []struct {
		nombre string
		inicio string
		fin    string
	}{
		{nombre: "Límite inferior 06:00 y 09:05", inicio: "06:00", fin: "09:05"},
		{nombre: "Límite superior 22:00", inicio: "09:05", fin: "22:00"},
		{nombre: "Con espacios externos", inicio: "  06:00  ", fin: "  22:00  "},
	}

	for _, tc := range casosValidos {
		t.Run("Valido_"+tc.nombre, func(t *testing.T) {
			store := storage.NewMemoryStore()
			svc := services.NewSolicitudService(store, store)

			_, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
				EventoID:            1,
				Motivo:              "Prueba de horario válido",
				FechaPropuesta:      "2026-11-22",
				HoraInicioPropuesta: tc.inicio,
				HoraFinPropuesta:    tc.fin,
			})
			if err != nil {
				t.Fatalf("se esperaba éxito para (%q, %q), pero falló con: %v", tc.inicio, tc.fin, err)
			}
		})
	}

	casosInvalidos := []struct {
		nombre string
		inicio string
		fin    string
	}{
		{nombre: "Solo hora HH (09)", inicio: "09", fin: "13:00"},
		{nombre: "Hora un solo dígito (9:00)", inicio: "9:00", fin: "13:00"},
		{nombre: "Minuto un solo dígito (09:0)", inicio: "09:0", fin: "13:00"},
		{nombre: "Con segundos (09:00:00)", inicio: "09:00:00", fin: "13:00"},
		{nombre: "Hora inexistente 24:00", inicio: "09:00", fin: "24:00"},
		{nombre: "Hora inexistente 25:00", inicio: "09:00", fin: "25:00"},
		{nombre: "Minuto inexistente 09:60", inicio: "09:60", fin: "13:00"},
		{nombre: "Antes del límite inferior (05:59)", inicio: "05:59", fin: "10:00"},
		{nombre: "Después del límite superior (22:01)", inicio: "18:00", fin: "22:01"},
		{nombre: "Inicio igual al fin (10:00 - 10:00)", inicio: "10:00", fin: "10:00"},
		{nombre: "Inicio posterior al fin (14:00 - 10:00)", inicio: "14:00", fin: "10:00"},
	}

	for _, tc := range casosInvalidos {
		t.Run("Invalido_"+tc.nombre, func(t *testing.T) {
			store := storage.NewMemoryStore()
			svc := services.NewSolicitudService(store, store)

			_, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
				EventoID:            1,
				Motivo:              "Prueba de horario inválido",
				FechaPropuesta:      "2026-11-22",
				HoraInicioPropuesta: tc.inicio,
				HoraFinPropuesta:    tc.fin,
			})
			if !errors.Is(err, services.ErrDatosInvalidos) {
				t.Fatalf("se esperaba ErrDatosInvalidos para (%q, %q), se obtuvo: %v", tc.inicio, tc.fin, err)
			}
		})
	}
}

func TestSolicitudServiceMotivoUnicode400Y401(t *testing.T) {
	ctx := context.Background()

	// 400 caracteres Unicode (multibyte: "á" ocupa 2 bytes en UTF-8 pero cuenta como 1 carácter Unicode)
	motivo400Unicode := strings.Repeat("á", 400)
	store1 := storage.NewMemoryStore()
	svc1 := services.NewSolicitudService(store1, store1)

	_, err := svc1.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
		EventoID:            1,
		Motivo:              motivo400Unicode,
		FechaPropuesta:      "2026-11-22",
		HoraInicioPropuesta: "10:00",
		HoraFinPropuesta:    "12:00",
	})
	if err != nil {
		t.Fatalf("se esperaba aceptar 400 caracteres Unicode, pero se obtuvo error: %v", err)
	}

	// 401 caracteres Unicode debe ser rechazado
	motivo401Unicode := strings.Repeat("ñ", 401)
	store2 := storage.NewMemoryStore()
	svc2 := services.NewSolicitudService(store2, store2)

	_, err = svc2.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
		EventoID:            1,
		Motivo:              motivo401Unicode,
		FechaPropuesta:      "2026-11-22",
		HoraInicioPropuesta: "10:00",
		HoraFinPropuesta:    "12:00",
	})
	if !errors.Is(err, services.ErrDatosInvalidos) {
		t.Fatalf("se esperaba ErrDatosInvalidos para 401 caracteres Unicode, se obtuvo: %v", err)
	}
}

func TestSolicitudServiceFallosRepositorio(t *testing.T) {
	ctx := context.Background()
	errDB := errors.New("fallo de conexión simulado")

	repoFallo := &repoFalloSimulado{
		base:              storage.NewMemoryStore(),
		errCrearSolicitud: errDB,
	}
	svc := services.NewSolicitudService(repoFallo, repoFallo)

	_, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
		EventoID:            1,
		Motivo:              "Motivo válido",
		FechaPropuesta:      "2026-11-22",
		HoraInicioPropuesta: "10:00",
		HoraFinPropuesta:    "12:00",
	})
	if !errors.Is(err, errDB) {
		t.Fatalf("se esperaba propagación del error del repositorio, se obtuvo: %v", err)
	}
}

func TestSolicitudServiceCreacionConcurrente(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStore()
	svc := services.NewSolicitudService(store, store)

	const totalGoroutines = 20
	var wg sync.WaitGroup
	wg.Add(totalGoroutines)

	inicio := make(chan struct{})
	exitos := make(chan models.Solicitud, totalGoroutines)
	conflictos := make(chan error, totalGoroutines)
	otrosErrores := make(chan error, totalGoroutines)

	for i := 0; i < totalGoroutines; i++ {
		go func(idx int) {
			defer wg.Done()
			<-inicio

			creada, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
				EventoID:            1,
				Motivo:              "Solicitud concurrente",
				FechaPropuesta:      "2026-11-25",
				HoraInicioPropuesta: "10:00",
				HoraFinPropuesta:    "12:00",
			})
			if err == nil {
				exitos <- creada
				return
			}
			if errors.Is(err, repositories.ErrSolicitudPendienteDuplicada) {
				conflictos <- err
				return
			}
			otrosErrores <- err
		}(i)
	}

	close(inicio)
	wg.Wait()
	close(exitos)
	close(conflictos)
	close(otrosErrores)

	if len(otrosErrores) > 0 {
		t.Fatalf("se produjeron errores inesperados en concurrencia: %v", <-otrosErrores)
	}
	if len(exitos) != 1 {
		t.Fatalf("se esperaba exactamente 1 creación exitosa, se obtuvieron %d", len(exitos))
	}
	if len(conflictos) != totalGoroutines-1 {
		t.Fatalf("se esperaban %d conflictos, se obtuvieron %d", totalGoroutines-1, len(conflictos))
	}

	almacenadas, err := svc.ObtenerSolicitudes(ctx)
	if err != nil {
		t.Fatalf("error al consultar solicitudes: %v", err)
	}
	if len(almacenadas) != 1 {
		t.Fatalf("se esperaba exactamente 1 solicitud almacenada, se encontraron %d", len(almacenadas))
	}
}

