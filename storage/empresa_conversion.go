package storage

import (
	"fmt"
	"math"
	"strings"
	"time"

	"gestor-eventos-api/models"
	"gestor-eventos-api/storage/empresadb"

	"github.com/jackc/pgx/v5/pgtype"
)

// Conversiones entre las filas de la base de datos de la empresa y los modelos de la API. Son funciones puras (sin
// acceso a la base) para poder probarlas sin conexión.
//
// Las fechas y horas del esquema son `timestamp` SIN zona horaria: guardan la hora de pared de Lima. pgx las entrega como
// time.Time con la hora de pared tal cual (ubicación UTC solo de relleno), así que aquí nunca se convierte de zona.

// zonaLimaBD es la hora de Perú (UTC-5, sin horario de verano), para mostrar instantes con zona (timestamptz).
var zonaLimaBD = time.FixedZone("America/Lima", -5*60*60)

const (
	tipoBloqueEvento     = "EVENTO"
	tipoBloqueMontaje    = "MONTAJE"
	tipoBloqueDesmontaje = "DESMONTAJE"
	tipoBloqueEnsayo     = "ENSAYO"

	versionOriginal  = "ORIGINAL"
	versionPropuesta = "PROPUESTA"
)

// bloqueHorario es un tramo del cronograma de un evento o de una versión propuesta.
type bloqueHorario struct {
	Tipo   string
	Inicio time.Time
	Fin    time.Time
}

// adicionalFila es un adicional contratado o propuesto con su tarifa del catálogo.
type adicionalFila struct {
	Codigo     string
	Nombre     string
	Unidad     string
	PrecioHora float64
	Cantidad   int32
	Inicio     time.Time
	Fin        time.Time
}

func texto(t pgtype.Text) string {
	if t.Valid {
		return t.String
	}
	return ""
}

func textoOpcional(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: s != ""}
}

func fechaDe(t time.Time) string { return t.Format("2006-01-02") }
func horaDe(t time.Time) string  { return t.Format("15:04") }

// horaPared construye la hora de pared (sin zona) a partir de «YYYY-MM-DD» y «HH:MM».
func horaPared(fecha, hora string) (time.Time, error) {
	t, err := time.Parse("2006-01-02 15:04", strings.TrimSpace(fecha)+" "+strings.TrimSpace(hora))
	if err != nil {
		return time.Time{}, fmt.Errorf("fecha u hora inválida (%q %q): %w", fecha, hora, err)
	}
	return t, nil
}

// horasDe devuelve las horas de uso de un adicional (redondeadas al entero más cercano, mínimo 1): la API trabaja con
// horas enteras, mientras la base guarda el inicio y el fin exactos.
func horasDe(inicio, fin time.Time) int {
	h := int(math.Round(fin.Sub(inicio).Hours()))
	if h < 1 {
		h = 1
	}
	return h
}

func redondear2(v float64) float64 { return math.Round(v*100) / 100 }

// adicionalesAItems convierte los adicionales de la base en los de la API (cantidad, horas, tarifa y subtotal).
func adicionalesAItems(filas []adicionalFila) []models.AdicionalItem {
	items := make([]models.AdicionalItem, 0, len(filas))
	for _, f := range filas {
		horas := horasDe(f.Inicio, f.Fin)
		items = append(items, models.AdicionalItem{
			ID:         f.Codigo,
			Nombre:     f.Nombre,
			Unidad:     f.Unidad,
			Cantidad:   int(f.Cantidad),
			Horas:      horas,
			TarifaHora: f.PrecioHora,
			Subtotal:   redondear2(float64(int(f.Cantidad)*horas) * f.PrecioHora),
		})
	}
	return items
}

// aplicarBloques vuelca el cronograma (bloques) en los campos de fecha, horario y tiempos técnicos de DatosHorario.
func aplicarBloques(d *models.DatosHorario, bloques []bloqueHorario) {
	for _, b := range bloques {
		switch b.Tipo {
		case tipoBloqueEvento:
			d.Fecha, d.HoraInicio, d.HoraFin = fechaDe(b.Inicio), horaDe(b.Inicio), horaDe(b.Fin)
		case tipoBloqueMontaje:
			d.HasMontaje, d.MontajeFecha, d.MontajeHoraInicio, d.MontajeHoraFin = true, fechaDe(b.Inicio), horaDe(b.Inicio), horaDe(b.Fin)
		case tipoBloqueDesmontaje:
			d.HasDesmontaje, d.DesmontajeFecha, d.DesmontajeHoraInicio, d.DesmontajeHoraFin = true, fechaDe(b.Inicio), horaDe(b.Inicio), horaDe(b.Fin)
		case tipoBloqueEnsayo:
			d.HasEnsayo, d.EnsayoFecha, d.EnsayoHoraInicio, d.EnsayoHoraFin = true, fechaDe(b.Inicio), horaDe(b.Inicio), horaDe(b.Fin)
		}
	}
}

// bloquesDeDatos convierte los campos de fecha y horario de DatosHorario en el cronograma que se guarda en la base: un
// bloque EVENTO y, si están activados, MONTAJE, DESMONTAJE y ENSAYO.
func bloquesDeDatos(d models.DatosHorario) ([]bloqueHorario, error) {
	var bloques []bloqueHorario
	agregar := func(tipo, fecha, ini, fin string) error {
		i, err := horaPared(fecha, ini)
		if err != nil {
			return err
		}
		f, err := horaPared(fecha, fin)
		if err != nil {
			return err
		}
		bloques = append(bloques, bloqueHorario{Tipo: tipo, Inicio: i, Fin: f})
		return nil
	}
	if err := agregar(tipoBloqueEvento, d.Fecha, d.HoraInicio, d.HoraFin); err != nil {
		return nil, err
	}
	if d.HasMontaje {
		if err := agregar(tipoBloqueMontaje, d.MontajeFecha, d.MontajeHoraInicio, d.MontajeHoraFin); err != nil {
			return nil, err
		}
	}
	if d.HasDesmontaje {
		if err := agregar(tipoBloqueDesmontaje, d.DesmontajeFecha, d.DesmontajeHoraInicio, d.DesmontajeHoraFin); err != nil {
			return nil, err
		}
	}
	if d.HasEnsayo {
		if err := agregar(tipoBloqueEnsayo, d.EnsayoFecha, d.EnsayoHoraInicio, d.EnsayoHoraFin); err != nil {
			return nil, err
		}
	}
	return bloques, nil
}

// eventoDeFilas arma el Evento de la API a partir de su fila, su cronograma y sus adicionales.
func eventoDeFilas(f empresadb.ListarEventosRow, bloques []bloqueHorario, ocupa bool, adicionales []adicionalFila) models.Evento {
	e := models.Evento{
		ID:             uint(f.IDEvento),
		Codigo:         f.Codigo,
		ClienteID:      f.ClienteCodigo,
		ClienteNombre:  f.ClienteNombre,
		Nombre:         f.Nombre,
		Espacio:        f.Espacio,
		Estado:         f.Estado,
		Contacto:       f.Contacto,
		Telefono:       texto(f.Telefono),
		Correo:         texto(f.Correo),
		Observaciones:  texto(f.Observaciones),
		NoOcupaHorario: !ocupa,
		Adicionales:    adicionalesAItems(adicionales),

		TarifaHoraAlquiler: f.TarifaHora,
	}
	var d models.DatosHorario
	aplicarBloques(&d, bloques)
	e.Fecha, e.HoraInicio, e.HoraFin = d.Fecha, d.HoraInicio, d.HoraFin
	e.HasMontaje, e.MontajeFecha, e.MontajeHoraInicio, e.MontajeHoraFin = d.HasMontaje, d.MontajeFecha, d.MontajeHoraInicio, d.MontajeHoraFin
	e.HasDesmontaje, e.DesmontajeFecha, e.DesmontajeHoraInicio, e.DesmontajeHoraFin = d.HasDesmontaje, d.DesmontajeFecha, d.DesmontajeHoraInicio, d.DesmontajeHoraFin
	e.HasEnsayo, e.EnsayoFecha, e.EnsayoHoraInicio, e.EnsayoHoraFin = d.HasEnsayo, d.EnsayoFecha, d.EnsayoHoraInicio, d.EnsayoHoraFin
	return e
}

// estadoSolicitudDeBD traduce el estado de la base al texto de la API.
func estadoSolicitudDeBD(estado string) string {
	switch estado {
	case "PENDIENTE":
		return models.EstadoPendienteRevision
	case "RETIRADA":
		return models.EstadoRetiradaCliente
	case "APROBADA":
		return models.EstadoAprobada
	case "RECHAZADA":
		return models.EstadoRechazada
	default:
		return estado
	}
}

// bloqueosPorDia convierte un bloqueo institucional (que puede abarcar varios días) en tramos de un solo día, que es
// como los usa la regla de disponibilidad. El fin de un día completo se expresa como 23:59 (el horario regular termina
// a las 22:00, así que no hay diferencia práctica).
func bloqueosPorDia(id int32, espacio, tipo, titulo, notas string, inicio, fin time.Time) []models.BloqueoInstitucional {
	const maxDias = 366
	var tramos []models.BloqueoInstitucional
	dia := time.Date(inicio.Year(), inicio.Month(), inicio.Day(), 0, 0, 0, 0, time.UTC)
	for n := 0; n < maxDias && dia.Before(fin); n++ {
		desde, hasta := dia, dia.AddDate(0, 0, 1)
		if inicio.After(desde) {
			desde = inicio
		}
		if fin.Before(hasta) {
			hasta = fin
		}
		if hasta.After(desde) {
			horaFin := horaDe(hasta)
			if !hasta.Before(dia.AddDate(0, 0, 1)) {
				horaFin = "23:59"
			}
			idTramo := fmt.Sprintf("BLQ-%d", id)
			if n > 0 {
				idTramo = fmt.Sprintf("BLQ-%d-d%d", id, n+1)
			}
			tramos = append(tramos, models.BloqueoInstitucional{
				ID: idTramo, Titulo: titulo, Espacio: espacio, Fecha: fechaDe(dia),
				HoraInicio: horaDe(desde), HoraFin: horaFin, Tipo: tipo, Notas: notas,
			})
		}
		dia = dia.AddDate(0, 0, 1)
	}
	return tramos
}
