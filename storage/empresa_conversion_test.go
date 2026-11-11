package storage

import (
	"testing"
	"time"

	"gestor-eventos-api/models"
	"gestor-eventos-api/storage/empresadb"

	"github.com/jackc/pgx/v5/pgtype"
)

func ts(s string) time.Time {
	t, err := time.Parse("2006-01-02 15:04", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestAplicarBloquesYBloquesDeDatosSonInversos(t *testing.T) {
	bloques := []bloqueHorario{
		{tipoBloqueMontaje, ts("2026-12-06 13:00"), ts("2026-12-06 17:00")},
		{tipoBloqueEnsayo, ts("2026-12-06 17:00"), ts("2026-12-06 18:00")},
		{tipoBloqueEvento, ts("2026-12-06 18:00"), ts("2026-12-06 22:00")},
	}
	var d models.DatosHorario
	aplicarBloques(&d, bloques)
	if d.Fecha != "2026-12-06" || d.HoraInicio != "18:00" || d.HoraFin != "22:00" {
		t.Errorf("evento: %+v", d)
	}
	if !d.HasMontaje || d.MontajeHoraInicio != "13:00" || d.MontajeHoraFin != "17:00" || d.MontajeFecha != "2026-12-06" {
		t.Errorf("montaje: %+v", d)
	}
	if !d.HasEnsayo || d.EnsayoHoraInicio != "17:00" || d.HasDesmontaje {
		t.Errorf("ensayo/desmontaje: %+v", d)
	}

	vuelta, err := bloquesDeDatos(d)
	if err != nil {
		t.Fatal(err)
	}
	// El EVENTO va primero; luego los técnicos activados (montaje, ensayo): sin desmontaje porque no estaba activado
	if len(vuelta) != 3 || vuelta[0].Tipo != tipoBloqueEvento || !vuelta[0].Inicio.Equal(ts("2026-12-06 18:00")) {
		t.Fatalf("bloques de vuelta: %+v", vuelta)
	}
	tipos := map[string]bloqueHorario{}
	for _, b := range vuelta {
		tipos[b.Tipo] = b
	}
	if !tipos[tipoBloqueMontaje].Inicio.Equal(ts("2026-12-06 13:00")) || !tipos[tipoBloqueEnsayo].Fin.Equal(ts("2026-12-06 18:00")) {
		t.Errorf("montaje/ensayo de vuelta: %+v", tipos)
	}
}

func TestBloquesDeDatosRechazaFechasInvalidas(t *testing.T) {
	if _, err := bloquesDeDatos(models.DatosHorario{Fecha: "15/11/2026", HoraInicio: "09:00", HoraFin: "13:00"}); err == nil {
		t.Error("una fecha con formato incorrecto debía dar error")
	}
	if _, err := bloquesDeDatos(models.DatosHorario{Fecha: "2026-11-15", HoraInicio: "9h", HoraFin: "13:00"}); err == nil {
		t.Error("una hora con formato incorrecto debía dar error")
	}
}

func TestAdicionalesAItemsCalculaHorasYSubtotal(t *testing.T) {
	items := adicionalesAItems([]adicionalFila{
		{Codigo: "MICROFONO", Nombre: "Micrófono", Unidad: "unidad", PrecioHora: 5, Cantidad: 6, Inicio: ts("2026-12-06 18:00"), Fin: ts("2026-12-06 22:00")},
		{Codigo: "COCHERA", Nombre: "Cochera", Unidad: "auto", PrecioHora: 10, Cantidad: 1, Inicio: ts("2026-12-06 18:00"), Fin: ts("2026-12-06 18:10")}, // menos de 1 h: cuenta 1
	})
	if len(items) != 2 || items[0].Horas != 4 || items[0].Subtotal != 120 || items[0].TarifaHora != 5 || items[0].ID != "MICROFONO" {
		t.Errorf("micrófono: %+v", items[0])
	}
	if items[1].Horas != 1 || items[1].Subtotal != 10 {
		t.Errorf("cochera: %+v", items[1])
	}
}

func TestEventoDeFilasUsaElBloqueEventoYLaOcupacion(t *testing.T) {
	fila := empresadb.ListarEventosRow{
		IDEvento: 3, Codigo: "EV-0003", ClienteCodigo: "CLI-0004", ClienteNombre: "Lucía Prueba Ramos", Espacio: "Auditorio Showtech",
		Nombre: "Concierto Juvenil", Contacto: "Pedro Ejemplo", Telefono: pgtype.Text{String: "900000002", Valid: true},
		Correo: pgtype.Text{}, Estado: "CON_ADELANTO", Version: 3,
	}
	bloques := []bloqueHorario{
		{tipoBloqueMontaje, ts("2026-12-06 13:00"), ts("2026-12-06 17:00")},
		{tipoBloqueEvento, ts("2026-12-06 18:00"), ts("2026-12-06 22:00")},
	}
	e := eventoDeFilas(fila, bloques, true, nil)
	if e.ID != 3 || e.Codigo != "EV-0003" || e.ClienteID != "CLI-0004" || e.Fecha != "2026-12-06" || e.HoraInicio != "18:00" || e.HoraFin != "22:00" {
		t.Errorf("evento: %+v", e)
	}
	if !e.HasMontaje || e.MontajeHoraInicio != "13:00" || e.Telefono != "900000002" || e.Correo != "" || e.NoOcupaHorario {
		t.Errorf("detalles: %+v", e)
	}
	if e.Adicionales == nil || len(e.Adicionales) != 0 {
		t.Errorf("sin adicionales debía ser un slice vacío (no nulo): %#v", e.Adicionales)
	}
	if reservado := eventoDeFilas(fila, bloques, false, nil); !reservado.NoOcupaHorario {
		t.Error("un evento cuyo bloque no bloquea no ocupa el auditorio")
	}
}

func TestBloqueosPorDia(t *testing.T) {
	// Un día completo del horario regular
	uno := bloqueosPorDia(1, "Auditorio Showtech", "MINEDU", "Evaluación", "", ts("2026-11-20 06:00"), ts("2026-11-20 22:00"))
	if len(uno) != 1 || uno[0].ID != "BLQ-1" || uno[0].Fecha != "2026-11-20" || uno[0].HoraInicio != "06:00" || uno[0].HoraFin != "22:00" || uno[0].Tipo != "MINEDU" {
		t.Errorf("un día: %+v", uno)
	}
	// Varios días: primer día desde su hora de inicio hasta fin de día; intermedios completos; último hasta su fin
	varios := bloqueosPorDia(7, "Auditorio Showtech", "MANTENIMIENTO", "Obra", "", ts("2026-11-20 14:00"), ts("2026-11-22 10:00"))
	if len(varios) != 3 {
		t.Fatalf("varios días: %+v", varios)
	}
	if varios[0].Fecha != "2026-11-20" || varios[0].HoraInicio != "14:00" || varios[0].HoraFin != "23:59" {
		t.Errorf("primer día: %+v", varios[0])
	}
	if varios[1].Fecha != "2026-11-21" || varios[1].HoraInicio != "00:00" || varios[1].HoraFin != "23:59" || varios[1].ID != "BLQ-7-d2" {
		t.Errorf("día intermedio: %+v", varios[1])
	}
	if varios[2].Fecha != "2026-11-22" || varios[2].HoraInicio != "00:00" || varios[2].HoraFin != "10:00" {
		t.Errorf("último día: %+v", varios[2])
	}
	// Termina justo a medianoche: no genera un tramo vacío el día siguiente
	if t1 := bloqueosPorDia(2, "X", "OTRO", "Y", "", ts("2026-11-20 08:00"), ts("2026-11-21 00:00")); len(t1) != 1 {
		t.Errorf("fin a medianoche: %+v", t1)
	}
}

func TestEstadoSolicitudDeBD(t *testing.T) {
	casos := map[string]string{
		"PENDIENTE": models.EstadoPendienteRevision, "RETIRADA": models.EstadoRetiradaCliente,
		"APROBADA": models.EstadoAprobada, "RECHAZADA": models.EstadoRechazada, "OTRO": "OTRO",
	}
	for bd, esperado := range casos {
		if got := estadoSolicitudDeBD(bd); got != esperado {
			t.Errorf("%s -> %q, esperaba %q", bd, got, esperado)
		}
	}
}
