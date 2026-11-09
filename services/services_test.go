package services_test

import (
	"context"
	"errors"
	"reflect"
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

func (r *repoFalloSimulado) RetirarSolicitud(ctx context.Context, id uint, fecha string) (models.Solicitud, error) {
	return r.base.RetirarSolicitud(ctx, id, fecha)
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
	if ev.Contacto == "" || ev.Telefono == "" || ev.Correo == "" || ev.Observaciones == "" {
		t.Errorf("se esperaban datos de contacto y observaciones precargados en el evento 1: %+v", ev)
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

func TestSolicitudServiceRelojInyectadoYSnapshotsCompatibilidad(t *testing.T) {
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

	// Petición anterior sin el bloque informacion_general_propuesta
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
	if creada.FechaCreacion != instanteFijo.Format(time.RFC3339) {
		t.Errorf("se esperaba fecha_creacion RFC3339 %q, se obtuvo %q", instanteFijo.Format(time.RFC3339), creada.FechaCreacion)
	}

	// Verificar snapshots originales y propuestos completos conservando los datos generales originales
	esperadoOrig := models.DatosHorario{
		Nombre:               eventoAntes.Nombre,
		Espacio:              eventoAntes.Espacio,
		Contacto:             eventoAntes.Contacto,
		Telefono:             eventoAntes.Telefono,
		Correo:               eventoAntes.Correo,
		Observaciones:        eventoAntes.Observaciones,
		Fecha:                eventoAntes.Fecha,
		HoraInicio:           eventoAntes.HoraInicio,
		HoraFin:              eventoAntes.HoraFin,
		HasMontaje:           eventoAntes.HasMontaje,
		MontajeFecha:         eventoAntes.MontajeFecha,
		MontajeHoraInicio:    eventoAntes.MontajeHoraInicio,
		MontajeHoraFin:       eventoAntes.MontajeHoraFin,
		HasDesmontaje:        eventoAntes.HasDesmontaje,
		DesmontajeFecha:      eventoAntes.DesmontajeFecha,
		DesmontajeHoraInicio: eventoAntes.DesmontajeHoraInicio,
		DesmontajeHoraFin:    eventoAntes.DesmontajeHoraFin,
		HasEnsayo:            eventoAntes.HasEnsayo,
		EnsayoFecha:          eventoAntes.EnsayoFecha,
		EnsayoHoraInicio:     eventoAntes.EnsayoHoraInicio,
		EnsayoHoraFin:        eventoAntes.EnsayoHoraFin,
		Adicionales:          eventoAntes.Adicionales,
	}
	if !reflect.DeepEqual(creada.DatosOriginales, esperadoOrig) {
		t.Errorf("snapshot de datos_originales no coincide: %+v vs %+v", creada.DatosOriginales, esperadoOrig)
	}

	esperadoProp := esperadoOrig
	esperadoProp.Fecha = "2026-11-19"
	esperadoProp.HoraInicio = "06:00"
	esperadoProp.HoraFin = "22:00"
	esperadoProp.HasMontaje = false
	esperadoProp.MontajeFecha = ""
	esperadoProp.MontajeHoraInicio = ""
	esperadoProp.MontajeHoraFin = ""
	esperadoProp.HasDesmontaje = false
	esperadoProp.DesmontajeFecha = ""
	desmontajeHoraInicio := ""
	desmontajeHoraFin := ""
	esperadoProp.DesmontajeHoraInicio = desmontajeHoraInicio
	esperadoProp.DesmontajeHoraFin = desmontajeHoraFin
	if !reflect.DeepEqual(creada.DatosPropuestos, esperadoProp) {
		t.Errorf("snapshot de datos_propuestos no coincide: %+v vs %+v", creada.DatosPropuestos, esperadoProp)
	}

	// Verificar que el evento original permanece intacto
	eventoDespues, err := store.ObtenerEventoPorID(ctx, 1)
	if err != nil {
		t.Fatalf("error consultando evento 1: %v", err)
	}
	if !reflect.DeepEqual(eventoDespues, eventoAntes) {
		t.Errorf("el evento original fue modificado: antes=%+v, despues=%+v", eventoAntes, eventoDespues)
	}
}

func TestSolicitudServiceInformacionGeneralYContacto(t *testing.T) {
	ctx := context.Background()

	t.Run("CambioUnicamenteEnNombreSinCambiarHorario", func(t *testing.T) {
		store := storage.NewMemoryStore()
		svc := services.NewSolicitudService(store, store)
		ev, _ := store.ObtenerEventoPorID(ctx, 1)

		creada, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
			EventoID:            1,
			Motivo:              "Actualización de denominación oficial del evento",
			FechaPropuesta:      ev.Fecha,
			HoraInicioPropuesta: ev.HoraInicio,
			HoraFinPropuesta:    ev.HoraFin,
			InformacionGeneralPropuesta: &models.InformacionGeneralPropuestaDTO{
				Nombre:        "  Congreso Internacional Showtech 2026  ",
				Contacto:      ev.Contacto,
				Telefono:      ev.Telefono,
				Correo:        ev.Correo,
				Observaciones: ev.Observaciones,
			},
		})
		if err != nil {
			t.Fatalf("se esperaba éxito al cambiar solo el nombre, se obtuvo: %v", err)
		}
		if creada.DatosOriginales.Nombre != ev.Nombre {
			t.Errorf("nombre original incorrecto en snapshot: %q", creada.DatosOriginales.Nombre)
		}
		if creada.DatosPropuestos.Nombre != "Congreso Internacional Showtech 2026" {
			t.Errorf("nombre propuesto incorrecto en snapshot: %q", creada.DatosPropuestos.Nombre)
		}
	})

	t.Run("CambioUnicamenteEnContactoYVaciadoDeOpcionales", func(t *testing.T) {
		store := storage.NewMemoryStore()
		svc := services.NewSolicitudService(store, store)
		ev, _ := store.ObtenerEventoPorID(ctx, 1)

		creada, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
			EventoID:            1,
			Motivo:              "Cambio de coordinador y retiro de datos opcionales",
			FechaPropuesta:      ev.Fecha,
			HoraInicioPropuesta: ev.HoraInicio,
			HoraFinPropuesta:    ev.HoraFin,
			InformacionGeneralPropuesta: &models.InformacionGeneralPropuestaDTO{
				Nombre:        ev.Nombre,
				Contacto:      "  Lucía Fernández  ",
				Telefono:      "   ",
				Correo:        "",
				Observaciones: "  ",
			},
		})
		if err != nil {
			t.Fatalf("se esperaba éxito al cambiar contacto y vaciar opcionales, se obtuvo: %v", err)
		}
		if creada.DatosPropuestos.Contacto != "Lucía Fernández" {
			t.Errorf("contacto propuesto incorrecto: %q", creada.DatosPropuestos.Contacto)
		}
		if creada.DatosPropuestos.Telefono != "" || creada.DatosPropuestos.Correo != "" || creada.DatosPropuestos.Observaciones != "" {
			t.Errorf("los campos opcionales debieron quedar vacíos en datos_propuestos: %+v", creada.DatosPropuestos)
		}
		if creada.DatosOriginales.Telefono == "" || creada.DatosOriginales.Correo == "" || creada.DatosOriginales.Observaciones == "" {
			t.Errorf("datos_originales debe conservar los valores originales no vacíos: %+v", creada.DatosOriginales)
		}

		// Verificar que el evento original sigue intacto
		evDespues, _ := store.ObtenerEventoPorID(ctx, 1)
		if !reflect.DeepEqual(evDespues, ev) {
			t.Errorf("el evento original fue alterado: %+v", evDespues)
		}
	})

	t.Run("RechazoCuandoNoCambiaNingunCampoConBloqueIncluido", func(t *testing.T) {
		store := storage.NewMemoryStore()
		svc := services.NewSolicitudService(store, store)
		ev, _ := store.ObtenerEventoPorID(ctx, 1)

		_, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
			EventoID:            1,
			Motivo:              "Sin ningún cambio efectivo",
			FechaPropuesta:      ev.Fecha,
			HoraInicioPropuesta: ev.HoraInicio,
			HoraFinPropuesta:    ev.HoraFin,
			InformacionGeneralPropuesta: &models.InformacionGeneralPropuestaDTO{
				Nombre:        " " + ev.Nombre + " ",
				Contacto:      " " + ev.Contacto + " ",
				Telefono:      " " + ev.Telefono + " ",
				Correo:        " " + ev.Correo + " ",
				Observaciones: " " + ev.Observaciones + " ",
			},
		})
		if !errors.Is(err, services.ErrDatosInvalidos) {
			t.Fatalf("se esperaba ErrDatosInvalidos cuando no hay cambios efectivos, se obtuvo: %v", err)
		}
	})

	t.Run("ValidacionesObligatoriosLimitesUnicodeYCorreo", func(t *testing.T) {
		evBase := models.Evento{
			ID:            1,
			Nombre:        "Evento Base",
			Espacio:       "Auditorio A",
			Fecha:         "2026-11-15",
			HoraInicio:    "09:00",
			HoraFin:       "13:00",
			Contacto:      "Contacto Base",
			Telefono:      "999888777",
			Correo:        "base@ejemplo.com",
			Observaciones: "Nota inicial",
		}

		casosInvalidos := []struct {
			nombre string
			info   models.InformacionGeneralPropuestaDTO
		}{
			{
				nombre: "Nombre vacío",
				info: models.InformacionGeneralPropuestaDTO{
					Nombre:   "   ",
					Contacto: "Ana Pérez",
				},
			},
			{
				nombre: "Nombre excede 120 runas Unicode (121)",
				info: models.InformacionGeneralPropuestaDTO{
					Nombre:   strings.Repeat("á", 121),
					Contacto: "Ana Pérez",
				},
			},
			{
				nombre: "Contacto vacío",
				info: models.InformacionGeneralPropuestaDTO{
					Nombre:   "Evento Válido",
					Contacto: "   ",
				},
			},
			{
				nombre: "Contacto excede 80 runas Unicode (81)",
				info: models.InformacionGeneralPropuestaDTO{
					Nombre:   "Evento Válido",
					Contacto: strings.Repeat("é", 81),
				},
			},
			{
				nombre: "Teléfono excede 25 runas Unicode (26)",
				info: models.InformacionGeneralPropuestaDTO{
					Nombre:   "Evento Válido",
					Contacto: "Ana Pérez",
					Telefono: strings.Repeat("9", 26),
				},
			},
			{
				nombre: "Correo excede 80 runas Unicode (81)",
				info: models.InformacionGeneralPropuestaDTO{
					Nombre:   "Evento Válido",
					Contacto: "Ana Pérez",
					Correo:   strings.Repeat("a", 70) + "@dominio.pe", // 70 + 11 = 81
				},
			},
			{
				nombre: "Correo sin arroba",
				info: models.InformacionGeneralPropuestaDTO{
					Nombre:   "Evento Válido",
					Contacto: "Ana Pérez",
					Correo:   "correo.sin.arroba.com",
				},
			},
			{
				nombre: "Correo sin dominio válido",
				info: models.InformacionGeneralPropuestaDTO{
					Nombre:   "Evento Válido",
					Contacto: "Ana Pérez",
					Correo:   "usuario@dominio",
				},
			},
			{
				nombre: "Observaciones exceden 300 runas Unicode (301)",
				info: models.InformacionGeneralPropuestaDTO{
					Nombre:        "Evento Válido",
					Contacto:      "Ana Pérez",
					Observaciones: strings.Repeat("ü", 301),
				},
			},
		}

		for _, tc := range casosInvalidos {
			t.Run(tc.nombre, func(t *testing.T) {
				store := storage.NewMemoryStore()
				svc := services.NewSolicitudService(store, store)
				infoCopia := tc.info

				_, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
					EventoID:                    1,
					Motivo:                      "Prueba de validación de información general",
					FechaPropuesta:              evBase.Fecha,
					HoraInicioPropuesta:         evBase.HoraInicio,
					HoraFinPropuesta:            evBase.HoraFin,
					InformacionGeneralPropuesta: &infoCopia,
				})
				if !errors.Is(err, services.ErrDatosInvalidos) {
					t.Errorf("caso %q: se esperaba ErrDatosInvalidos, se obtuvo: %v", tc.nombre, err)
				}
			})
		}

		// Caso en los límites exactos Unicode (120, 80, 25, 80, 300) -> Válido
		t.Run("LimitesExactosUnicodeValidos", func(t *testing.T) {
			store := storage.NewMemoryStore()
			svc := services.NewSolicitudService(store, store)

			correo80 := strings.Repeat("a", 69) + "@dominio.pe" // 69 + 11 = 80
			infoValida := models.InformacionGeneralPropuestaDTO{
				Nombre:        strings.Repeat("á", 120),
				Contacto:      strings.Repeat("é", 80),
				Telefono:      strings.Repeat("9", 25),
				Correo:        correo80,
				Observaciones: strings.Repeat("ó", 300),
			}

			creada, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
				EventoID:                    1,
				Motivo:                      "Prueba límites exactos Unicode",
				FechaPropuesta:              "2026-11-15",
				HoraInicioPropuesta:         "09:00",
				HoraFinPropuesta:            "13:00",
				InformacionGeneralPropuesta: &infoValida,
			})
			if err != nil {
				t.Fatalf("se esperaba éxito con límites exactos Unicode, se obtuvo: %v", err)
			}
			if creadoLen := len([]rune(creada.DatosPropuestos.Nombre)); creadoLen != 120 {
				t.Errorf("se esperaban 120 runas en nombre, se obtuvieron %d", creadoLen)
			}
		})
	})
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

func TestSolicitudServiceTiemposTecnicos(t *testing.T) {
	ctx := context.Background()

	t.Run("CambioUnicamenteEnMontajeValido", func(t *testing.T) {
		store := storage.NewMemoryStore()
		svc := services.NewSolicitudService(store, store)
		ev, _ := store.ObtenerEventoPorID(ctx, 1)

		// Solo cambia el horario de montaje (de 08:00-09:00 a 07:00-09:00), todo lo demás idéntico
		creada, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
			EventoID:            ev.ID,
			Motivo:              "Ajuste únicamente en el horario de montaje técnico para calibrar sonido con anticipación",
			FechaPropuesta:      ev.Fecha,
			HoraInicioPropuesta: ev.HoraInicio,
			HoraFinPropuesta:    ev.HoraFin,
			TiemposTecnicosPropuestos: &models.TiemposTecnicosPropuestosDTO{
				HasMontaje:           true,
				MontajeFecha:         ev.Fecha,
				MontajeHoraInicio:    "07:00",
				MontajeHoraFin:       "09:00",
				HasDesmontaje:        ev.HasDesmontaje,
				DesmontajeFecha:      ev.DesmontajeFecha,
				DesmontajeHoraInicio: ev.DesmontajeHoraInicio,
				DesmontajeHoraFin:    ev.DesmontajeHoraFin,
				HasEnsayo:            false,
			},
		})
		if err != nil {
			t.Fatalf("se esperaba éxito al proponer cambio únicamente en montaje, error: %v", err)
		}
		if creada.DatosPropuestos.MontajeHoraInicio != "07:00" {
			t.Errorf("montaje_hora_inicio esperado '07:00', obtenido '%s'", creada.DatosPropuestos.MontajeHoraInicio)
		}
		if creada.DatosOriginales.MontajeHoraInicio != "08:00" {
			t.Errorf("montaje_hora_inicio original esperado '08:00', obtenido '%s'", creada.DatosOriginales.MontajeHoraInicio)
		}
	})

	t.Run("FranjasContiguasPermitidas", func(t *testing.T) {
		store := storage.NewMemoryStore()
		svc := services.NewSolicitudService(store, store)
		ev, _ := store.ObtenerEventoPorID(ctx, 1)

		// Ensayo: 06:30 - 07:30
		// Montaje: 07:30 - 09:00 (contiguo con ensayo)
		// Evento: 09:00 - 13:00 (contiguo con montaje)
		// Desmontaje: 13:00 - 14:00 (contiguo con evento)
		creada, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
			EventoID:            ev.ID,
			Motivo:              "Ensayo previo y montaje contiguos sin espacios muertos",
			FechaPropuesta:      ev.Fecha,
			HoraInicioPropuesta: "09:00",
			HoraFinPropuesta:    "13:00",
			TiemposTecnicosPropuestos: &models.TiemposTecnicosPropuestosDTO{
				HasEnsayo:            true,
				EnsayoFecha:          ev.Fecha,
				EnsayoHoraInicio:     "06:30",
				EnsayoHoraFin:        "07:30",
				HasMontaje:           true,
				MontajeFecha:         ev.Fecha,
				MontajeHoraInicio:    "07:30",
				MontajeHoraFin:       "09:00",
				HasDesmontaje:        true,
				DesmontajeFecha:      ev.Fecha,
				DesmontajeHoraInicio: "13:00",
				DesmontajeHoraFin:    "14:00",
			},
		})
		if err != nil {
			t.Fatalf("se esperaba éxito con franjas contiguas, error: %v", err)
		}
		if !creada.DatosPropuestos.HasEnsayo || creada.DatosPropuestos.EnsayoHoraInicio != "06:30" {
			t.Errorf("datos de ensayo propuesto incorrectos: %+v", creada.DatosPropuestos)
		}
	})

	t.Run("ValidacionesTiemposTecnicos", func(t *testing.T) {
		store := storage.NewMemoryStore()
		svc := services.NewSolicitudService(store, store)
		ev, _ := store.ObtenerEventoPorID(ctx, 1)

		casos := []struct {
			nombre  string
			tiempos models.TiemposTecnicosPropuestosDTO
			espera  string
		}{
			{
				nombre: "Montaje fecha distinta al evento",
				tiempos: models.TiemposTecnicosPropuestosDTO{
					HasMontaje:        true,
					MontajeFecha:      "2026-11-16",
					MontajeHoraInicio: "08:00",
					MontajeHoraFin:    "09:00",
				},
				espera: "El montaje debe realizarse en la misma fecha del evento.",
			},
			{
				nombre: "Montaje finaliza después del inicio del evento",
				tiempos: models.TiemposTecnicosPropuestosDTO{
					HasMontaje:        true,
					MontajeFecha:      ev.Fecha,
					MontajeHoraInicio: "08:00",
					MontajeHoraFin:    "09:30", // Evento empieza a 09:00
				},
				espera: "El montaje no puede finalizar después del inicio del evento.",
			},
			{
				nombre: "Desmontaje inicia antes del fin del evento",
				tiempos: models.TiemposTecnicosPropuestosDTO{
					HasDesmontaje:        true,
					DesmontajeFecha:      ev.Fecha,
					DesmontajeHoraInicio: "12:30", // Evento termina a 13:00
					DesmontajeHoraFin:    "14:00",
				},
				espera: "El desmontaje no puede iniciar antes del fin del evento.",
			},
			{
				nombre: "Ensayo culmina después del inicio del evento",
				tiempos: models.TiemposTecnicosPropuestosDTO{
					HasEnsayo:        true,
					EnsayoFecha:      ev.Fecha,
					EnsayoHoraInicio: "08:30",
					EnsayoHoraFin:    "09:30",
				},
				espera: "El ensayo técnico debe culminar antes de la hora de inicio del evento.",
			},
			{
				nombre: "Ensayo se cruza con montaje",
				tiempos: models.TiemposTecnicosPropuestosDTO{
					HasMontaje:        true,
					MontajeFecha:      ev.Fecha,
					MontajeHoraInicio: "08:00",
					MontajeHoraFin:    "09:00",
					HasEnsayo:         true,
					EnsayoFecha:       ev.Fecha,
					EnsayoHoraInicio:  "07:30",
					EnsayoHoraFin:     "08:30", // Se cruza con 08:00-09:00
				},
				espera: "El ensayo técnico no puede cruzarse con el montaje del evento.",
			},
			{
				nombre: "Horario técnico fuera del límite 06:00",
				tiempos: models.TiemposTecnicosPropuestosDTO{
					HasMontaje:        true,
					MontajeFecha:      ev.Fecha,
					MontajeHoraInicio: "05:30",
					MontajeHoraFin:    "07:00",
				},
				espera: "Los horarios de montaje deben estar comprendidos entre las 06:00 y las 22:00 inclusive.",
			},
		}

		for _, tc := range casos {
			t.Run(tc.nombre, func(t *testing.T) {
				_, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
					EventoID:                  ev.ID,
					Motivo:                    "Prueba de validación técnica",
					FechaPropuesta:            ev.Fecha,
					HoraInicioPropuesta:       ev.HoraInicio,
					HoraFinPropuesta:          ev.HoraFin,
					TiemposTecnicosPropuestos: &tc.tiempos,
				})
				if err == nil {
					t.Fatalf("se esperaba error '%s', pero no hubo error", tc.espera)
				}
				if !strings.Contains(err.Error(), tc.espera) {
					t.Errorf("error esperado contenía '%s', pero se obtuvo '%s'", tc.espera, err.Error())
				}
			})
		}
	})
}

func TestSolicitudServiceAdicionales(t *testing.T) {
	ctx := context.Background()

	t.Run("PermitirSolicitudCuandoElUnicoCambioSonAdicionales", func(t *testing.T) {
		store := storage.NewMemoryStore()
		svc := services.NewSolicitudService(store, store)
		ev, _ := store.ObtenerEventoPorID(ctx, 1)

		// Evento 1 tiene 1 cochera (4h, S/ 10/h = S/ 40).
		// Proponemos agregar una pantalla LED 5x4 (1 un, 3h = S/ 600) conservando la cochera
		prop := []models.AdicionalPropuestoDTO{
			{ID: "cochera", Cantidad: 1, Horas: 4},
			{ID: "pantalla_led_5x4", Cantidad: 1, Horas: 3},
		}

		creada, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
			EventoID:              ev.ID,
			Motivo:                "Se requiere pantalla LED adicional para la transmisión",
			FechaPropuesta:        ev.Fecha,
			HoraInicioPropuesta:   ev.HoraInicio,
			HoraFinPropuesta:      ev.HoraFin,
			AdicionalesPropuestos: &prop,
		})
		if err != nil {
			t.Fatalf("error inesperado al proponer adicionales: %v", err)
		}

		if len(creada.DatosOriginales.Adicionales) != 1 {
			t.Errorf("se esperaba 1 adicional original, se obtuvieron %d", len(creada.DatosOriginales.Adicionales))
		}
		if len(creada.DatosPropuestos.Adicionales) != 2 {
			t.Errorf("se esperaban 2 adicionales propuestos, se obtuvieron %d", len(creada.DatosPropuestos.Adicionales))
		}

		// Validar que el backend recalculó los subtotales con el catálogo
		var subtotalPantalla float64
		for _, adic := range creada.DatosPropuestos.Adicionales {
			if adic.ID == "pantalla_led_5x4" {
				subtotalPantalla = adic.Subtotal
				if adic.TarifaHora != 200.0 {
					t.Errorf("tarifa de pantalla LED incorrecta: %v", adic.TarifaHora)
				}
			}
		}
		if subtotalPantalla != 600.0 {
			t.Errorf("subtotal pantalla esperado 600.0, obtenido %v", subtotalPantalla)
		}
	})

	t.Run("PermitirRetiroTotalDeAdicionalesConSliceVacio", func(t *testing.T) {
		store := storage.NewMemoryStore()
		svc := services.NewSolicitudService(store, store)
		ev, _ := store.ObtenerEventoPorID(ctx, 1)

		propVacia := []models.AdicionalPropuestoDTO{}
		creada, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
			EventoID:              ev.ID,
			Motivo:                "Ya no se requiere servicio de cochera",
			FechaPropuesta:        ev.Fecha,
			HoraInicioPropuesta:   ev.HoraInicio,
			HoraFinPropuesta:      ev.HoraFin,
			AdicionalesPropuestos: &propVacia,
		})
		if err != nil {
			t.Fatalf("error inesperado al retirar adicionales: %v", err)
		}
		if len(creada.DatosOriginales.Adicionales) != 1 {
			t.Errorf("se esperaba 1 adicional original, se obtuvieron %d", len(creada.DatosOriginales.Adicionales))
		}
		if len(creada.DatosPropuestos.Adicionales) != 0 {
			t.Errorf("se esperaban 0 adicionales propuestos tras retiro, se obtuvieron %d", len(creada.DatosPropuestos.Adicionales))
		}
	})

	t.Run("RechazoDeAdicionalesConErroresDeValidacion", func(t *testing.T) {
		store := storage.NewMemoryStore()
		svc := services.NewSolicitudService(store, store)
		ev, _ := store.ObtenerEventoPorID(ctx, 1)

		casos := []struct {
			nombre string
			prop   []models.AdicionalPropuestoDTO
			espera string
		}{
			{
				nombre: "Adicional no existe en catálogo",
				prop:   []models.AdicionalPropuestoDTO{{ID: "dron_aereo", Cantidad: 1, Horas: 1}},
				espera: "no existe en el catálogo",
			},
			{
				nombre: "Cantidad cero",
				prop:   []models.AdicionalPropuestoDTO{{ID: "cochera", Cantidad: 0, Horas: 2}},
				espera: "La cantidad de unidades debe ser un número entero mayor a 0",
			},
			{
				nombre: "Horas cero",
				prop:   []models.AdicionalPropuestoDTO{{ID: "cochera", Cantidad: 1, Horas: 0}},
				espera: "Las horas de uso deben ser un número entero mayor a 0",
			},
			{
				nombre: "Adicional duplicado en propuesta",
				prop: []models.AdicionalPropuestoDTO{
					{ID: "cochera", Cantidad: 1, Horas: 2},
					{ID: "cochera", Cantidad: 2, Horas: 3},
				},
				espera: "se encuentra duplicado en la propuesta",
			},
		}

		for _, tc := range casos {
			t.Run(tc.nombre, func(t *testing.T) {
				_, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
					EventoID:              ev.ID,
					Motivo:                "Prueba de validación de adicionales",
					FechaPropuesta:        ev.Fecha,
					HoraInicioPropuesta:   ev.HoraInicio,
					HoraFinPropuesta:      ev.HoraFin,
					AdicionalesPropuestos: &tc.prop,
				})
				if err == nil {
					t.Fatalf("se esperaba error '%s', pero no hubo error", tc.espera)
				}
				if !strings.Contains(err.Error(), tc.espera) {
					t.Errorf("error esperado contenía '%s', obtenido '%s'", tc.espera, err.Error())
				}
			})
		}
	})

	t.Run("CasoConcreto_Evento1_CocheraOriginal_Pantalla_Microfono_5Cocheras", func(t *testing.T) {
		store := storage.NewMemoryStore()
		svc := services.NewSolicitudService(store, store)
		eventoService := services.NewEventoService(store)

		ev, err := eventoService.ObtenerEventoPorID(ctx, 1)
		if err != nil {
			t.Fatalf("error obteniendo evento 1: %v", err)
		}

		// Validar que Evento 1 conserva su semilla de cochera original de S/ 40
		if len(ev.Adicionales) != 1 {
			t.Fatalf("se esperaba 1 adicional original en evento 1, obtenidos %d", len(ev.Adicionales))
		}
		if ev.Adicionales[0].ID != "cochera" || ev.Adicionales[0].Subtotal != 40.0 {
			t.Fatalf("cochera original inválida: %+v", ev.Adicionales[0])
		}

		prop := []models.AdicionalPropuestoDTO{
			{ID: "pantalla_led_5x4", Cantidad: 1, Horas: 1}, // S/ 200
			{ID: "microfono", Cantidad: 2, Horas: 1},        // S/ 10
			{ID: "cochera", Cantidad: 5, Horas: 1},          // S/ 50
		}

		sol, err := svc.CrearSolicitud(ctx, models.SolicitudCreacionDTO{
			EventoID:              ev.ID,
			Motivo:                "Ampliación de equipamiento audiovisual y estacionamientos",
			FechaPropuesta:        ev.Fecha,
			HoraInicioPropuesta:   ev.HoraInicio,
			HoraFinPropuesta:      ev.HoraFin,
			AdicionalesPropuestos: &prop,
		})
		if err != nil {
			t.Fatalf("error creando solicitud con caso concreto: %v", err)
		}

		// Snapshots originales: deben tener la cochera original de S/ 40
		if len(sol.DatosOriginales.Adicionales) != 1 {
			t.Fatalf("se esperaba 1 adicional en snapshot original, obtenidos %d", len(sol.DatosOriginales.Adicionales))
		}
		origCochera := sol.DatosOriginales.Adicionales[0]
		if origCochera.ID != "cochera" || origCochera.Nombre != "Cochera" || origCochera.Unidad != "unidad" ||
			origCochera.Cantidad != 1 || origCochera.Horas != 4 || origCochera.TarifaHora != 10.0 || origCochera.Subtotal != 40.0 {
			t.Fatalf("snapshot original de cochera incorrecto: %+v", origCochera)
		}

		// Snapshots propuestos: deben tener 3 adicionales y sumar S/ 260
		if len(sol.DatosPropuestos.Adicionales) != 3 {
			t.Fatalf("se esperaban 3 adicionales en snapshot propuesto, obtenidos %d", len(sol.DatosPropuestos.Adicionales))
		}

		var totalPropuesto float64
		for _, a := range sol.DatosPropuestos.Adicionales {
			totalPropuesto += a.Subtotal
			if a.Unidad != "unidad" {
				t.Errorf("adicional propuesto '%s' no tiene unidad 'unidad': %s", a.ID, a.Unidad)
			}
			switch a.ID {
			case "pantalla_led_5x4":
				if a.Nombre != "Pantalla LED 5×4" || a.TarifaHora != 200.0 || a.Subtotal != 200.0 {
					t.Errorf("pantalla led incorrecta: %+v", a)
				}
			case "microfono":
				if !strings.Contains(a.Nombre, "Micrófono") || a.TarifaHora != 5.0 || a.Subtotal != 10.0 {
					t.Errorf("microfono incorrecto: %+v", a)
				}
			case "cochera":
				if a.Nombre != "Cochera" || a.TarifaHora != 10.0 || a.Subtotal != 50.0 {
					t.Errorf("cochera propuesta incorrecta: %+v", a)
				}
			default:
				t.Errorf("adicional inesperado: %s", a.ID)
			}
		}

		if totalPropuesto != 260.0 {
			t.Errorf("se esperaba total propuesto 260.0, obtenido %f", totalPropuesto)
		}

		// Diferencia: 260 - 40 = +220
		diff := totalPropuesto - origCochera.Subtotal
		if diff != 220.0 {
			t.Errorf("se esperaba diferencia de +220.0, obtenida %f", diff)
		}

		// Verificar que el evento original en el store no fue mutado
		evDespues, _ := eventoService.ObtenerEventoPorID(ctx, 1)
		if len(evDespues.Adicionales) != 1 || evDespues.Adicionales[0].Subtotal != 40.0 {
			t.Fatalf("el evento original en el repositorio fue mutado: %+v", evDespues.Adicionales)
		}
	})
}

// Retirar la misma solicitud desde muchas goroutinas debe tener exactamente un éxito (operación atómica).
func TestRetirarSolicitudConcurrenteUnSoloExito(t *testing.T) {
	store := storage.NewMemoryStore()
	svc := services.NewSolicitudService(store, store)
	cliente := models.Usuario{Correo: "c@prueba.test", Rol: models.RolCliente, ClienteID: "CLI-001"}

	creada, err := svc.CrearSolicitud(context.Background(), models.SolicitudCreacionDTO{
		EventoID: 1, Motivo: "prueba", FechaPropuesta: "2026-12-01", HoraInicioPropuesta: "10:00", HoraFinPropuesta: "12:00",
	})
	if err != nil {
		t.Fatal(err)
	}

	const intentos = 20
	resultados := make(chan error, intentos)
	for i := 0; i < intentos; i++ {
		go func() {
			_, err := svc.RetirarSolicitud(context.Background(), cliente, creada.ID)
			resultados <- err
		}()
	}
	exitos, noPendientes := 0, 0
	for i := 0; i < intentos; i++ {
		err := <-resultados
		switch {
		case err == nil:
			exitos++
		case errors.Is(err, services.ErrSolicitudNoPendiente):
			noPendientes++
		default:
			t.Errorf("error inesperado: %v", err)
		}
	}
	if exitos != 1 || noPendientes != intentos-1 {
		t.Errorf("se esperaba 1 éxito y %d rechazos, hubo %d y %d", intentos-1, exitos, noPendientes)
	}
}
