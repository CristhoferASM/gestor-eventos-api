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

func TestConsultarDisponibilidadNoExigeMotivoNiGuardaNada(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStore()
	svc := servicioConBloqueos(store)
	asesor := models.Usuario{Rol: models.RolAsesor}

	// Choque con el desmontaje del evento 1: sin motivo (aún se está escribiendo) igual avisa, sin revelar datos
	choque := solicitudEvento2("2026-11-15", "13:30", "14:30", nil)
	choque.Motivo = ""
	err := svc.ConsultarDisponibilidadDe(ctx, asesor, choque)
	if !errors.Is(err, services.ErrSinDisponibilidad) {
		t.Fatalf("se esperaba ErrSinDisponibilidad, se obtuvo %v", err)
	}
	for _, prohibido := range []string{"Ceremonia", "graduación", "Horizonte", "CLI-001", "María"} {
		if strings.Contains(err.Error(), prohibido) {
			t.Errorf("el mensaje no debe revelar datos de otro evento (%q): %s", prohibido, err)
		}
	}

	// Horarios libres, tocarse en el borde, otro día y «sin cambios» respecto al evento: disponibles
	libres := []models.SolicitudCreacionDTO{
		solicitudEvento2("2026-11-15", "14:00", "15:00", nil),
		solicitudEvento2("2026-11-16", "09:00", "13:00", nil),
		solicitudEvento2("2026-11-20", "14:00", "18:00", nil), // exactamente el horario actual del evento 2
	}
	for i, dto := range libres {
		dto.Motivo = ""
		if err := svc.ConsultarDisponibilidadDe(ctx, asesor, dto); err != nil {
			t.Errorf("caso %d: debía estar disponible: %v", i, err)
		}
	}

	// Consultar no registra solicitudes ni bloquea el evento
	if sols, _ := svc.ObtenerSolicitudes(ctx); len(sols) != 0 {
		t.Errorf("la consulta no debe guardar solicitudes: %+v", sols)
	}
	if _, err := svc.CrearSolicitud(ctx, solicitudEvento2("2026-11-16", "09:00", "13:00", nil)); err != nil {
		t.Errorf("tras consultar se debe poder crear la solicitud: %v", err)
	}
}

func TestConsultarDisponibilidadValidaYRespetaPermisos(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStore()
	svc := servicioConBloqueos(store)

	// Un cliente no puede consultar a través de un evento ajeno (se trata como inexistente)
	cliente1 := models.Usuario{Rol: models.RolCliente, ClienteID: "CLI-001"}
	dto := solicitudEvento2("2026-11-16", "09:00", "13:00", nil)
	if err := svc.ConsultarDisponibilidadDe(ctx, cliente1, dto); !errors.Is(err, services.ErrEventoNoEncontrado) {
		t.Errorf("evento ajeno: se esperaba ErrEventoNoEncontrado, se obtuvo %v", err)
	}

	// Los datos mal formados siguen siendo errores de validación (no «no disponible»)
	asesor := models.Usuario{Rol: models.RolAsesor}
	malo := solicitudEvento2("2026-11-16", "25:00", "13:00", nil)
	if err := svc.ConsultarDisponibilidadDe(ctx, asesor, malo); !errors.Is(err, services.ErrDatosInvalidos) {
		t.Errorf("hora inválida: se esperaba ErrDatosInvalidos, se obtuvo %v", err)
	}
	if err := svc.ConsultarDisponibilidadDe(ctx, asesor, models.SolicitudCreacionDTO{}); !errors.Is(err, services.ErrDatosInvalidos) {
		t.Errorf("sin evento: se esperaba ErrDatosInvalidos, se obtuvo %v", err)
	}
	if err := svc.ConsultarDisponibilidadDe(ctx, asesor, models.SolicitudCreacionDTO{EventoID: 99, FechaPropuesta: "2026-11-16", HoraInicioPropuesta: "09:00", HoraFinPropuesta: "10:00"}); !errors.Is(err, services.ErrEventoNoEncontrado) {
		t.Errorf("evento inexistente: se esperaba ErrEventoNoEncontrado, se obtuvo %v", err)
	}
}

// eventoDePrueba crea un evento en memoria en una fecha y horario dados (sin tiempos técnicos).
func eventoDePrueba(id uint, estado, fecha, inicio, fin string, noOcupa bool) models.Evento {
	return models.Evento{
		ID: id, Nombre: "Evento " + estado, Espacio: "Auditorio Showtech", Fecha: fecha, HoraInicio: inicio, HoraFin: fin,
		Estado: estado, Contacto: "Contacto", NoOcupaHorario: noOcupa, Adicionales: []models.AdicionalItem{},
	}
}

func TestDisponibilidadIgnoraEventosQueNoOcupanElAuditorio(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStore()
	// Un evento solo RESERVADO (sin primer pago) el 2026-12-19 de 18:00 a 22:00, y otro CON_ADELANTO el 2026-12-20
	store.AgregarEvento(eventoDePrueba(10, "RESERVADO", "2026-12-19", "18:00", "22:00", true))
	store.AgregarEvento(eventoDePrueba(11, "CON_ADELANTO", "2026-12-20", "18:00", "22:00", false))
	svc := servicioConBloqueos(store)
	asesor := models.Usuario{Rol: models.RolAsesor}

	proponer := func(fecha string) error {
		dto := solicitudEvento2(fecha, "19:00", "21:00", nil)
		dto.Motivo = ""
		return svc.ConsultarDisponibilidadDe(ctx, asesor, dto)
	}
	if err := proponer("2026-12-19"); err != nil {
		t.Errorf("un evento RESERVADO no ocupa el auditorio, debía estar disponible: %v", err)
	}
	if err := proponer("2026-12-20"); !errors.Is(err, services.ErrSinDisponibilidad) {
		t.Errorf("un evento CON_ADELANTO sí ocupa el auditorio: %v", err)
	}
}

func TestSolicitudRechazaEventosNoContratados(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStore()
	for i, estado := range []string{"CON_SOLICITUD_COTIZACION", "COTIZADO", "CANCELADO", "EN_PROCESO_CANCELACION", "REALIZADO"} {
		store.AgregarEvento(eventoDePrueba(uint(20+i), estado, "2026-12-01", "10:00", "12:00", false))
	}
	svc := servicioConBloqueos(store)
	for i, estado := range []string{"CON_SOLICITUD_COTIZACION", "COTIZADO", "CANCELADO", "EN_PROCESO_CANCELACION", "REALIZADO"} {
		dto := models.SolicitudCreacionDTO{
			EventoID: uint(20 + i), Motivo: "Cambio", FechaPropuesta: "2026-12-02", HoraInicioPropuesta: "10:00", HoraFinPropuesta: "12:00",
		}
		if _, err := svc.CrearSolicitud(ctx, dto); !errors.Is(err, services.ErrDatosInvalidos) {
			t.Errorf("%s: se esperaba ErrDatosInvalidos, se obtuvo %v", estado, err)
		}
	}
	// Un evento en otro estado (p. ej. CON_ADELANTO) sí admite la solicitud
	store.AgregarEvento(eventoDePrueba(30, "CON_ADELANTO", "2026-12-01", "10:00", "12:00", false))
	ok := models.SolicitudCreacionDTO{EventoID: 30, Motivo: "Cambio", FechaPropuesta: "2026-12-02", HoraInicioPropuesta: "10:00", HoraFinPropuesta: "12:00"}
	if _, err := svc.CrearSolicitud(ctx, ok); err != nil {
		t.Errorf("un evento CON_ADELANTO debía admitir la solicitud: %v", err)
	}
}

type catalogoFalso struct{ lista []models.AdicionalCatalogo }

func (c catalogoFalso) ObtenerAdicionales(context.Context) ([]models.AdicionalCatalogo, error) {
	return c.lista, nil
}

func TestSolicitudValidaAdicionalesContraElCatalogoDelRepositorio(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStore()
	catalogo := catalogoFalso{lista: []models.AdicionalCatalogo{{ID: "LED_5X4", Nombre: "Pantalla LED 5x4", TarifaHora: 200, Unidad: "equipo"}}}
	svc := services.NewSolicitudService(store, store).ConBloqueos(store).ConCatalogo(catalogo)

	pedir := func(id string) (models.Solicitud, error) {
		adics := []models.AdicionalPropuestoDTO{{ID: id, Cantidad: 2, Horas: 3}}
		dto := solicitudEvento2("2026-11-21", "14:00", "18:00", nil)
		dto.AdicionalesPropuestos = &adics
		return svc.CrearSolicitud(ctx, dto)
	}
	sol, err := pedir("LED_5X4")
	if err != nil {
		t.Fatalf("el adicional del catálogo del repositorio debía aceptarse: %v", err)
	}
	a := sol.DatosPropuestos.Adicionales
	if len(a) != 1 || a[0].ID != "LED_5X4" || a[0].Subtotal != 1200 || a[0].TarifaHora != 200 {
		t.Errorf("adicional propuesto: %+v", a)
	}
	// El catálogo simulado ya no se usa: «cochera» no existe en el catálogo del repositorio
	if _, err := pedir("cochera"); !errors.Is(err, services.ErrDatosInvalidos) {
		t.Errorf("un adicional que no está en el catálogo del repositorio debía rechazarse: %v", err)
	}
}

func TestSoloClientesEnvianSolicitudes(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStore()
	asesor := models.Usuario{ID: 2, Rol: models.RolAsesor}
	cliente := models.Usuario{ID: 3, Rol: models.RolCliente, ClienteID: "CLI-001"} // dueño del evento 1
	dto := models.SolicitudCreacionDTO{EventoID: 1, Motivo: "Cambio", FechaPropuesta: "2026-11-16", HoraInicioPropuesta: "09:00", HoraFinPropuesta: "13:00"}
	dto.TiemposTecnicosPropuestos = &models.TiemposTecnicosPropuestosDTO{}

	// Por defecto (datos en memoria) el asesor también puede crearlas: comportamiento del prototipo
	libre := servicioConBloqueos(store)
	if sol, err := libre.CrearSolicitudDe(ctx, asesor, dto); err != nil || sol.SolicitanteID != asesor.ID {
		t.Fatalf("sin la opción el asesor debía poder crearla: %+v, %v", sol, err)
	}

	// Con la opción (modelo de la base de la empresa) solo el cliente envía; el asesor sigue pudiendo consultar
	store2 := storage.NewMemoryStore()
	estricto := services.NewSolicitudService(store2, store2).ConBloqueos(store2).SoloClientesEnvian()
	if _, err := estricto.CrearSolicitudDe(ctx, asesor, dto); !errors.Is(err, services.ErrAccesoDenegado) {
		t.Errorf("el asesor no debía poder enviar: %v", err)
	}
	if err := estricto.ConsultarDisponibilidadDe(ctx, asesor, dto); err != nil {
		t.Errorf("el asesor sí puede consultar la disponibilidad: %v", err)
	}
	sol, err := estricto.CrearSolicitudDe(ctx, cliente, dto)
	if err != nil || sol.SolicitanteID != cliente.ID {
		t.Errorf("el cliente dueño debía poder enviarla a su nombre: %+v, %v", sol, err)
	}
	if lista, _ := estricto.ObtenerSolicitudes(ctx); len(lista) != 1 {
		t.Errorf("solo debía guardarse la del cliente: %+v", lista)
	}
}
