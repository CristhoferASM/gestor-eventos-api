import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  AdicionalCatalogo,
  ESTADO_RETIRADA_CLIENTE,
  AdicionalItem,
  BorradorAsesor,
  ConsultaDisponibilidadPayload,
  Evento,
  FilaComparativa,
  FilaComparativaAdicional,
  ResumenComparativoAdicionales,
  Solicitud,
  calcularComparativoAdicionales,
  construirFilasComparativa,
  crearBorradorAsesorDesdeEvento,
  formatSoles,
  formatearCodigoSolicitud,
  formatearEstadoEvento,
  formatearFechaHoraEnvio,
  formatearFechaVisual,
  formatearTextoObligatorio,
  formatearTextoOpcional,
  obtenerResumenCambiosSolicitud,
  sonAdicionalesIguales,
} from '../../models/gestor-eventos.models';
import { AuthService } from '../../services/auth.service';
import { EventosApiService } from '../../services/eventos-api.service';
import {
  ResultadoValidacionHorarios,
  validarCoherenciaHorarios,
} from '../../validators/solicitud.validators';
import { SelectorFechaHoraDirective } from '../../directives/selector-fecha-hora.directive';
import { VinculoCuentasComponent } from '../vinculo-cuentas/vinculo-cuentas.component';

@Component({
  selector: 'app-asesor-portal',
  standalone: true,
  imports: [SelectorFechaHoraDirective, VinculoCuentasComponent, CommonModule, FormsModule],
  templateUrl: './asesor-portal.component.html',
  styleUrl: './asesor-portal.component.scss',
})
export class AsesorPortalComponent implements OnInit {
  private readonly api = inject(EventosApiService);

  readonly auth = inject(AuthService);
  readonly mostrarVinculo = signal(false);
  readonly estadoRetirada = ESTADO_RETIRADA_CLIENTE;
  readonly formatearCodigoSolicitud = formatearCodigoSolicitud;

  cerrarSesion(): void {
    this.auth.cerrarSesion();
  }

  // Navegación de pasos (1: Seleccionar, 2: Modificar, 3: Validar, 4: Revisar)
  readonly pasoActual = signal<number>(1);

  // Datos principales
  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly eventos = signal<Evento[]>([]);
  readonly solicitudes = signal<Solicitud[]>([]);
  readonly catalogoAdicionales = signal<AdicionalCatalogo[]>([]);

  // Filtros paso 1
  readonly filtroBuscador = signal<string>('');
  readonly filtroSolicitudEvento = signal<string>('');
  readonly filtroSolicitudEstado = signal<string>('');

  // Evento seleccionado y borrador
  readonly eventoSeleccionadoId = signal<number | null>(null);
  readonly borrador = signal<BorradorAsesor | null>(null);

  // Captura / Edición de Adicionales en Paso 2
  readonly formatearEstadoEvento = formatearEstadoEvento;
  readonly adicionalSeleccionadoId = signal<string>('cochera');
  readonly adicionalCantidad = signal<number>(1);
  readonly adicionalHoras = signal<number>(1);
  readonly adicionalModoEdicion = signal<boolean>(false);
  readonly adicionalEditandoId = signal<string | null>(null);
  readonly errorAdicional = signal<string | null>(null);

  // Validación de disponibilidad Paso 3 (separación de validación interna y estado de presentación)
  readonly huellaComprobadaExito = signal<string | null>(null);
  readonly huellaComprobadaFallo = signal<string | null>(null);

  // Consulta al backend (POST /disponibilidad) contra otras reservas y bloqueos institucionales.
  // Cada resultado va atado a la «huella» del horario consultado: si el asesor edita, deja de aplicar.
  readonly huellaConsultando = signal<string | null>(null);
  readonly resultadoServidor = signal<{ huella: string; disponible: boolean; mensaje: string } | null>(null);
  readonly errorConsultaServidor = signal<{ huella: string; mensaje: string } | null>(null);
  private consultaDisponibilidad: Subscription | null = null;

  readonly validacionHorariosActual = computed<ResultadoValidacionHorarios>(() => {
    return validarCoherenciaHorarios(this.borrador());
  });

  readonly huellaHorarioActual = computed<string>(() => {
    const b = this.borrador();
    if (!b) return '';
    return JSON.stringify({
      evento_id: b.evento_id,
      fecha: b.fecha ?? '',
      hora_inicio: b.hora_inicio ?? '',
      hora_fin: b.hora_fin ?? '',
      has_montaje: Boolean(b.has_montaje),
      montaje_fecha: b.montaje_fecha ?? '',
      montaje_hora_inicio: b.montaje_hora_inicio ?? '',
      montaje_hora_fin: b.montaje_hora_fin ?? '',
      has_desmontaje: Boolean(b.has_desmontaje),
      desmontaje_fecha: b.desmontaje_fecha ?? '',
      desmontaje_hora_inicio: b.desmontaje_hora_inicio ?? '',
      desmontaje_hora_fin: b.desmontaje_hora_fin ?? '',
      has_ensayo: Boolean(b.has_ensayo),
      ensayo_fecha: b.ensayo_fecha ?? '',
      ensayo_hora_inicio: b.ensayo_hora_inicio ?? '',
      ensayo_hora_fin: b.ensayo_hora_fin ?? '',
    });
  });

  readonly comprobacionValidaVigente = computed<boolean>(() => {
    const huella = this.huellaHorarioActual();
    return Boolean(
      huella &&
      this.huellaComprobadaExito() === huella &&
      this.validacionHorariosActual().esValido
    );
  });

  /**
   * pendiente: aún no se comprobó este horario · consultando: esperando al servidor · valido: el servidor confirmó que
   * está libre · invalido: inconsistencias locales (rango, orden, franjas) · ocupado: choca con otra reserva o bloqueo ·
   * sin-verificar: no se pudo consultar al servidor (no se da por válido).
   */
  readonly estadoPresentacionComprobacion = computed<
    'pendiente' | 'consultando' | 'valido' | 'invalido' | 'ocupado' | 'sin-verificar'
  >(() => {
    const huella = this.huellaHorarioActual();
    if (!huella) return 'pendiente';
    if (this.huellaComprobadaExito() === huella && this.validacionHorariosActual().esValido) {
      return 'valido';
    }
    if (this.huellaComprobadaFallo() === huella && !this.validacionHorariosActual().esValido) {
      return 'invalido';
    }
    if (this.huellaConsultando() === huella) return 'consultando';
    const resultado = this.resultadoServidor();
    if (resultado && resultado.huella === huella && !resultado.disponible) return 'ocupado';
    if (this.errorConsultaServidor()?.huella === huella) return 'sin-verificar';
    return 'pendiente';
  });

  // Para retrocompatibilidad y reactividad directa
  readonly disponibilidadChequeada = computed<boolean>(() => {
    return this.comprobacionValidaVigente();
  });

  // Paso 4: Ficha y auditoría
  readonly fichaAbierta = signal<boolean>(false);
  readonly motivoAuditoria = signal<string>('');

  // Modales
  readonly solicitudSeleccionadaModal = signal<Solicitud | null>(null);
  readonly modalDescartarAbierto = signal<boolean>(false);

  // Evento actual seleccionado
  readonly eventoSeleccionado = computed<Evento | null>(() => {
    const id = this.eventoSeleccionadoId();
    if (!id) return null;
    return this.eventos().find((e) => e.id === id) ?? null;
  });

  // Eventos filtrados para la tabla del Paso 1 (búsqueda por ID, nombre y espacio)
  readonly eventosFiltrados = computed<Evento[]>(() => {
    const q = this.filtroBuscador().trim().toLowerCase();
    const lista = this.eventos();
    if (!q) return lista;
    const qSinId = q.replace(/^id:\s*|^id\s*/i, '').trim();
    return lista.filter((e) => {
      const idStr = String(e.id);
      const idLabel = `id: ${e.id}`.toLowerCase();
      const nom = (e.nombre ?? '').toLowerCase();
      const esp = (e.espacio ?? '').toLowerCase();
      const codComercial = this.codigoEvento(e.id).toLowerCase();
      return (
        idStr === q ||
        idStr === qSinId ||
        idLabel.includes(q) ||
        codComercial.includes(q) ||
        nom.includes(q) ||
        esp.includes(q)
      );
    });
  });

  // Texto del contador alineado con el prototipo
  readonly textoContadorEventos = computed<string>(() => {
    const count = this.eventosFiltrados().length;
    if (this.filtroBuscador().trim()) {
      return `${count} evento(s) encontrado(s)`;
    }
    return `${count} ${count === 1 ? 'evento registrado' : 'eventos registrados'}`;
  });

  // Solicitudes filtradas para la bandeja del asesor en Paso 1
  readonly solicitudesFiltradas = computed<Solicitud[]>(() => {
    const evFiltro = this.filtroSolicitudEvento().trim().toLowerCase();
    const estFiltro = this.filtroSolicitudEstado().trim().toLowerCase();
    return this.solicitudes().filter((s) => {
      const nomEvento = (s.datos_originales?.nombre ?? '').toLowerCase();
      const matchEvento =
        !evFiltro ||
        nomEvento.includes(evFiltro) ||
        String(s.evento_id).includes(evFiltro);
      const matchEstado =
        !estFiltro || (s.estado ?? '').toLowerCase() === estFiltro;
      return matchEvento && matchEstado;
    });
  });

  // Catálogo: adicional actualmente seleccionado en el selector
  readonly adicionalCatalogoActual = computed<AdicionalCatalogo | null>(() => {
    const selId = this.adicionalSeleccionadoId();
    return this.catalogoAdicionales().find((a) => a.id === selId) ?? null;
  });

  // Subtotal en tiempo real del formulario de adición de adicional
  readonly adicionalSubtotalCalculado = computed<number>(() => {
    const item = this.adicionalCatalogoActual();
    if (!item) return 0;
    const cant = Math.max(1, Number(this.adicionalCantidad()) || 1);
    const hrs = Math.max(1, Number(this.adicionalHoras()) || 1);
    return cant * hrs * (Number(item.tarifa_hora) || 0);
  });

  // Total de adicionales en el borrador
  readonly totalAdicionalesBorrador = computed<number>(() => {
    const adics = this.borrador()?.adicionales ?? [];
    return adics.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
  });

  // Franjas calculadas para el cronograma propuesto en Paso 2
  readonly franjasCronogramaPropuesto = computed(() => {
    const b = this.borrador();
    if (!b) return [];
    const franjas: {
      tipo: 'ensayo' | 'montaje' | 'evento' | 'desmontaje';
      label: string;
      date: string;
      startM: number;
    }[] = [];

    const toMinutes = (time?: string): number | null => {
      if (!time || !time.includes(':')) return null;
      const [h, m] = time.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return null;
      return h * 60 + m;
    };

    const fechaPe = (dStr?: string): string => {
      if (!dStr) return '';
      const partes = dStr.split('-');
      if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
      }
      return dStr;
    };

    // Ensayo técnico previo
    if (b.has_ensayo && b.ensayo_fecha && b.ensayo_hora_inicio && b.ensayo_hora_fin) {
      const sM = toMinutes(b.ensayo_hora_inicio);
      const eM = toMinutes(b.ensayo_hora_fin);
      if (sM !== null && eM !== null && eM > sM) {
        franjas.push({
          tipo: 'ensayo',
          label: `Ensayo: ${fechaPe(b.ensayo_fecha)} (${b.ensayo_hora_inicio} - ${b.ensayo_hora_fin})`,
          date: b.ensayo_fecha,
          startM: sM,
        });
      }
    }

    // Montaje técnico
    if (b.has_montaje && b.montaje_fecha && b.montaje_hora_inicio && b.montaje_hora_fin) {
      const sM = toMinutes(b.montaje_hora_inicio);
      const eM = toMinutes(b.montaje_hora_fin);
      if (sM !== null && eM !== null && eM > sM) {
        franjas.push({
          tipo: 'montaje',
          label: `Montaje: ${fechaPe(b.montaje_fecha)} (${b.montaje_hora_inicio} - ${b.montaje_hora_fin})`,
          date: b.montaje_fecha,
          startM: sM,
        });
      }
    }

    // Evento principal
    if (b.fecha && b.hora_inicio && b.hora_fin) {
      const sM = toMinutes(b.hora_inicio);
      const eM = toMinutes(b.hora_fin);
      if (sM !== null && eM !== null && eM > sM) {
        franjas.push({
          tipo: 'evento',
          label: `Evento: ${fechaPe(b.fecha)} (${b.hora_inicio} - ${b.hora_fin})`,
          date: b.fecha,
          startM: sM,
        });
      }
    }

    // Desmontaje técnico
    if (b.has_desmontaje && b.desmontaje_fecha && b.desmontaje_hora_inicio && b.desmontaje_hora_fin) {
      const sM = toMinutes(b.desmontaje_hora_inicio);
      const eM = toMinutes(b.desmontaje_hora_fin);
      if (sM !== null && eM !== null && eM > sM) {
        franjas.push({
          tipo: 'desmontaje',
          label: `Desmontaje: ${fechaPe(b.desmontaje_fecha)} (${b.desmontaje_hora_inicio} - ${b.desmontaje_hora_fin})`,
          date: b.desmontaje_fecha,
          startM: sM,
        });
      }
    }

    // Ordenar cronológicamente por fecha y hora de inicio
    franjas.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startM - b.startM;
    });

    return franjas;
  });

  // Detección de cambios campo por campo para las pastillas "Modificado"
  readonly cambioNombre = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    return Boolean(e && b && (e.nombre ?? '').trim() !== (b.nombre ?? '').trim());
  });

  readonly cambioContacto = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    return Boolean(e && b && (e.contacto ?? '').trim() !== (b.contacto ?? '').trim());
  });

  readonly cambioTelefono = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    return Boolean(e && b && (e.telefono ?? '').trim() !== (b.telefono ?? '').trim());
  });

  readonly cambioCorreo = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    return Boolean(e && b && (e.correo ?? '').trim() !== (b.correo ?? '').trim());
  });

  readonly cambioObservaciones = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    return Boolean(
      e && b && (e.observaciones ?? '').trim() !== (b.observaciones ?? '').trim()
    );
  });

  // El canal del borrador es un metadato local explícito del asesor; al no existir en la reserva original (GET /eventos),
  // no se compara con un valor inexistente ni se marca como modificación de la reserva.
  readonly cambioSolicitadoPor = computed<boolean>(() => false);

  readonly cambioFecha = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    return Boolean(e && b && (e.fecha ?? '').trim() !== (b.fecha ?? '').trim());
  });

  readonly cambioHoraInicio = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    return Boolean(
      e && b && (e.hora_inicio ?? '').trim() !== (b.hora_inicio ?? '').trim()
    );
  });

  readonly cambioHoraFin = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    return Boolean(e && b && (e.hora_fin ?? '').trim() !== (b.hora_fin ?? '').trim());
  });

  readonly cambioMontaje = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b) return false;
    if (Boolean(e.has_montaje) !== Boolean(b.has_montaje)) return true;
    if (b.has_montaje) {
      return (
        (e.montaje_fecha ?? '') !== (b.montaje_fecha ?? '') ||
        (e.montaje_hora_inicio ?? '') !== (b.montaje_hora_inicio ?? '') ||
        (e.montaje_hora_fin ?? '') !== (b.montaje_hora_fin ?? '')
      );
    }
    return false;
  });

  readonly cambioMontajeFecha = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b || !b.has_montaje) return false;
    const baseFecha = (e.has_montaje ? (e.montaje_fecha || e.fecha) : e.fecha || '').trim();
    const actFecha = (b.montaje_fecha || '').trim();
    return Boolean(baseFecha && actFecha && baseFecha !== actFecha);
  });

  readonly cambioMontajeInicio = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b || !b.has_montaje) return false;
    const baseInicio = (e.has_montaje && e.montaje_hora_inicio ? e.montaje_hora_inicio : '09:00').trim();
    const actInicio = (b.montaje_hora_inicio || '').trim();
    return Boolean(baseInicio && actInicio && baseInicio !== actInicio);
  });

  readonly cambioMontajeFin = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b || !b.has_montaje) return false;
    const baseFin = (e.has_montaje && e.montaje_hora_fin ? e.montaje_hora_fin : (e.hora_inicio || '10:00')).trim();
    const actFin = (b.montaje_hora_fin || '').trim();
    return Boolean(baseFin && actFin && baseFin !== actFin);
  });

  readonly cambioDesmontaje = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b) return false;
    if (Boolean(e.has_desmontaje) !== Boolean(b.has_desmontaje)) return true;
    if (b.has_desmontaje) {
      return (
        (e.desmontaje_fecha ?? '') !== (b.desmontaje_fecha ?? '') ||
        (e.desmontaje_hora_inicio ?? '') !== (b.desmontaje_hora_inicio ?? '') ||
        (e.desmontaje_hora_fin ?? '') !== (b.desmontaje_hora_fin ?? '')
      );
    }
    return false;
  });

  readonly cambioDesmontajeFecha = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b || !b.has_desmontaje) return false;
    const baseFecha = (e.has_desmontaje ? (e.desmontaje_fecha || e.fecha) : e.fecha || '').trim();
    const actFecha = (b.desmontaje_fecha || '').trim();
    return Boolean(baseFecha && actFecha && baseFecha !== actFecha);
  });

  readonly cambioDesmontajeInicio = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b || !b.has_desmontaje) return false;
    const baseInicio = (e.has_desmontaje && e.desmontaje_hora_inicio ? e.desmontaje_hora_inicio : (e.hora_fin || '13:00')).trim();
    const actInicio = (b.desmontaje_hora_inicio || '').trim();
    return Boolean(baseInicio && actInicio && baseInicio !== actInicio);
  });

  readonly cambioDesmontajeFin = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b || !b.has_desmontaje) return false;
    const baseFin = (e.has_desmontaje && e.desmontaje_hora_fin ? e.desmontaje_hora_fin : '14:00').trim();
    const actFin = (b.desmontaje_hora_fin || '').trim();
    return Boolean(baseFin && actFin && baseFin !== actFin);
  });

  readonly ensayoRecienAnadido = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    return Boolean(e && b && b.has_ensayo && !e.has_ensayo);
  });

  readonly cambioEnsayo = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b) return false;
    if (Boolean(e.has_ensayo) !== Boolean(b.has_ensayo)) return true;
    if (b.has_ensayo) {
      return (
        (e.ensayo_fecha ?? '') !== (b.ensayo_fecha ?? '') ||
        (e.ensayo_hora_inicio ?? '') !== (b.ensayo_hora_inicio ?? '') ||
        (e.ensayo_hora_fin ?? '') !== (b.ensayo_hora_fin ?? '')
      );
    }
    return false;
  });

  readonly cambioEnsayoFecha = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b || !b.has_ensayo) return false;
    const baseFecha = (e.has_ensayo ? (e.ensayo_fecha || e.fecha) : e.fecha || '').trim();
    const actFecha = (b.ensayo_fecha || '').trim();
    return Boolean(baseFecha && actFecha && baseFecha !== actFecha);
  });

  readonly cambioEnsayoInicio = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b || !b.has_ensayo) return false;
    const baseInicio = (e.has_ensayo && e.ensayo_hora_inicio ? e.ensayo_hora_inicio : '08:00').trim();
    const actInicio = (b.ensayo_hora_inicio || '').trim();
    return Boolean(baseInicio && actInicio && baseInicio !== actInicio);
  });

  readonly cambioEnsayoFin = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b || !b.has_ensayo) return false;
    const baseFin = (e.has_ensayo && e.ensayo_hora_fin ? e.ensayo_hora_fin : '09:00').trim();
    const actFin = (b.ensayo_hora_fin || '').trim();
    return Boolean(baseFin && actFin && baseFin !== actFin);
  });

  readonly cambioAdicionales = computed<boolean>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b) return false;
    return !sonAdicionalesIguales(e.adicionales ?? [], b.adicionales ?? []);
  });

  // Indica si el cronograma o tiempos técnicos presentan modificaciones
  readonly hayCambiosDeHorario = computed<boolean>(() => {
    return (
      this.cambioFecha() ||
      this.cambioHoraInicio() ||
      this.cambioHoraFin() ||
      this.cambioMontaje() ||
      this.cambioDesmontaje() ||
      this.cambioEnsayo()
    );
  });

  // Paso 3: Helpers para el resumen de horarios propuestos en validación
  readonly textoMontajeValidacion = computed<string>(() => {
    const b = this.borrador();
    if (!b || !b.has_montaje) return 'No requiere';
    const fecha = this.formatoFecha(b.montaje_fecha || b.fecha);
    const ini = (b.montaje_hora_inicio || '').trim() || '00:00';
    const fin = (b.montaje_hora_fin || '').trim() || (b.hora_inicio || '').trim() || '00:00';
    return `${fecha} (${ini} - ${fin})`;
  });

  readonly textoDesmontajeValidacion = computed<string>(() => {
    const b = this.borrador();
    if (!b || !b.has_desmontaje) return 'No requiere';
    const fecha = this.formatoFecha(b.desmontaje_fecha || b.fecha);
    const ini = (b.desmontaje_hora_inicio || '').trim() || (b.hora_fin || '').trim() || '00:00';
    const fin = (b.desmontaje_hora_fin || '').trim() || '00:00';
    return `${fecha} (${ini} - ${fin})`;
  });

  readonly textoEnsayoValidacion = computed<string>(() => {
    const b = this.borrador();
    if (!b || !b.has_ensayo) return 'No requiere';
    const fecha = this.formatoFecha(b.ensayo_fecha || b.fecha);
    const ini = (b.ensayo_hora_inicio || '').trim() || '00:00';
    const fin = (b.ensayo_hora_fin || '').trim() || '00:00';
    return `${fecha} (${ini} - ${fin})`;
  });

  // Indica si el borrador tiene modificaciones pendientes respecto al evento original
  readonly tieneCambiosSinGuardar = computed<boolean>(() => {
    return (
      this.cambioNombre() ||
      this.cambioContacto() ||
      this.cambioTelefono() ||
      this.cambioCorreo() ||
      this.cambioObservaciones() ||
      this.cambioFecha() ||
      this.cambioHoraInicio() ||
      this.cambioHoraFin() ||
      this.cambioMontaje() ||
      this.cambioDesmontaje() ||
      this.cambioEnsayo() ||
      this.cambioAdicionales()
    );
  });

  // Filas comparativas generales para Paso 4
  readonly filasComparativaPaso4 = computed<FilaComparativa[]>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b) return [];
    return construirFilasComparativa(e, b);
  });

  // Resumen comparativo de adicionales para Paso 4
  readonly comparativoAdicionalesPaso4 = computed<ResumenComparativoAdicionales>(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    const cat = this.catalogoAdicionales();
    return calcularComparativoAdicionales(e?.adicionales ?? [], b?.adicionales ?? [], cat);
  });

  // Cálculo de duración en minutos y diferencias
  readonly resumenDuracion = computed(() => {
    const e = this.eventoSeleccionado();
    const b = this.borrador();
    if (!e || !b) {
      return {
        durOrigMin: 0,
        durActMin: 0,
        diffMin: 0,
        durOrigTexto: '0h',
        durActTexto: '0h',
        diffTexto: 'Sin cambio',
        diffClase: 'diff-cero',
        diffExplicacion: 'Misma duración',
        horasAdicionalesValor: '0 h',
        horasAdicionalesSub: 'Sin variación de horario',
      };
    }

    const aMinutos = (h?: string): number => {
      if (!h || !h.includes(':')) return 0;
      const [hh, mm] = h.split(':').map((n) => Number(n) || 0);
      return hh * 60 + mm;
    };

    const formatDur = (minutos: number): string => {
      const h = Math.floor(minutos / 60);
      const m = minutos % 60;
      if (m === 0) return `${h} h`;
      return `${h} h ${m} min`;
    };

    const iniOrig = aMinutos(e.hora_inicio);
    const finOrig = aMinutos(e.hora_fin);
    const durOrigMin = Math.max(0, finOrig - iniOrig);

    const iniAct = aMinutos(b.hora_inicio);
    const finAct = aMinutos(b.hora_fin);
    const durActMin = Math.max(0, finAct - iniAct);

    const diffMin = durActMin - durOrigMin;
    let diffTexto = 'Sin cambio';
    let diffClase = 'diff-cero';
    let diffExplicacion = 'Misma duración';
    let horasAdicionalesValor = '0 h';
    let horasAdicionalesSub = 'Sin variación de horario';

    if (diffMin > 0) {
      diffTexto = `+${formatDur(diffMin)}`;
      diffClase = 'diff-mas';
      diffExplicacion = 'Incremento de tiempo';
      horasAdicionalesValor = `+${formatDur(diffMin)}`;
      horasAdicionalesSub = 'Tiempo adicional propuesto';
    } else if (diffMin < 0) {
      diffTexto = `-${formatDur(Math.abs(diffMin))}`;
      diffClase = 'diff-menos';
      diffExplicacion = 'Reducción de tiempo';
      horasAdicionalesValor = `-${formatDur(Math.abs(diffMin))}`;
      horasAdicionalesSub = 'Reducción de tiempo propuesta';
    }

    return {
      durOrigMin,
      durActMin,
      diffMin,
      durOrigTexto: formatDur(durOrigMin),
      durActTexto: formatDur(durActMin),
      diffTexto,
      diffClase,
      diffExplicacion,
      horasAdicionalesValor,
      horasAdicionalesSub,
    };
  });

  ngOnInit(): void {
    this.cargarDatosIniciales();
  }

  cargarDatosIniciales(): void {
    this.cargando.set(true);
    this.error.set(null);

    this.api.obtenerEventos().subscribe({
      next: (evts) => {
        this.eventos.set(evts);
        if (evts.length > 0 && !this.eventoSeleccionadoId()) {
          this.cargarEvento(evts[0]);
        }
        this.cargando.set(false);
      },
      error: (err) => {
        this.error.set(this.api.obtenerMensajeError(err, 'carga'));
        this.cargando.set(false);
      },
    });

    this.api.obtenerSolicitudes().subscribe({
      next: (sols) => this.solicitudes.set(sols),
      error: () => {},
    });

    this.api.obtenerCatalogoAdicionales().subscribe({
      next: (cat) => {
        this.catalogoAdicionales.set(cat);
        // Con el catálogo de la base de datos de la empresa los ids son otros (COCHERA, LED_5X4...): si el seleccionado
        // por defecto no existe, se toma el primero
        if (cat.length > 0 && !cat.some((c) => c.id === this.adicionalSeleccionadoId())) {
          this.adicionalSeleccionadoId.set(cat[0].id);
        }
      },
      error: () => {},
    });
  }

  cargarEvento(evento: Evento): void {
    this.eventoSeleccionadoId.set(evento.id);
    this.borrador.set(crearBorradorAsesorDesdeEvento(evento));
    this.huellaComprobadaExito.set(null);
    this.huellaComprobadaFallo.set(null);
  }

  seleccionarEvento(evento: Evento): void {
    if (this.eventoSeleccionadoId() !== evento.id || !this.borrador()) {
      this.cargarEvento(evento);
    }
    this.irPaso(2);
  }

  invalidarComprobacionHorarios(): void {
    this.cancelarConsultaDisponibilidad();
    this.huellaComprobadaExito.set(null);
    this.huellaComprobadaFallo.set(null);
    this.resultadoServidor.set(null);
    this.errorConsultaServidor.set(null);
    if (this.pasoActual() === 4) {
      this.pasoActual.set(3);
    }
  }

  irPaso(paso: number): void {
    if (paso === 2 && !this.borrador()) {
      const e = this.eventoSeleccionado();
      if (e) {
        this.cargarEvento(e);
      } else {
        return;
      }
    }
    if (paso === 4) {
      if (!this.comprobacionValidaVigente()) {
        // Bloquea el avance al Paso 4 si no existe comprobación válida vigente
        // Un intento de saltar al Paso 4 no debe ejecutar automáticamente la comprobación ni revelar su resultado
        this.pasoActual.set(3);
        return;
      }
    }
    this.pasoActual.set(paso);
  }

  actualizarCampoBorrador<K extends keyof BorradorAsesor>(campo: K, valor: BorradorAsesor[K]): void {
    const b = this.borrador();
    if (!b) return;
    this.borrador.set({ ...b, [campo]: valor });
    if (
      campo === 'fecha' ||
      campo === 'hora_inicio' ||
      campo === 'hora_fin' ||
      campo === 'montaje_fecha' ||
      campo === 'montaje_hora_inicio' ||
      campo === 'montaje_hora_fin' ||
      campo === 'desmontaje_fecha' ||
      campo === 'desmontaje_hora_inicio' ||
      campo === 'desmontaje_hora_fin' ||
      campo === 'ensayo_fecha' ||
      campo === 'ensayo_hora_inicio' ||
      campo === 'ensayo_hora_fin'
    ) {
      this.invalidarComprobacionHorarios();
    }
  }

  actualizarFechaEvento(nuevaFecha: string): void {
    const b = this.borrador();
    if (!b) return;
    const fechaAnterior = b.fecha;
    const updated = { ...b, fecha: nuevaFecha };

    if (updated.has_montaje && (!updated.montaje_fecha || updated.montaje_fecha === fechaAnterior)) {
      updated.montaje_fecha = nuevaFecha;
    }
    if (updated.has_desmontaje && (!updated.desmontaje_fecha || updated.desmontaje_fecha === fechaAnterior)) {
      updated.desmontaje_fecha = nuevaFecha;
    }
    if (updated.has_ensayo && (!updated.ensayo_fecha || updated.ensayo_fecha === fechaAnterior)) {
      updated.ensayo_fecha = nuevaFecha;
    }
    this.borrador.set(updated);
    this.invalidarComprobacionHorarios();
  }

  alternarMontaje(activo: boolean): void {
    const b = this.borrador();
    if (!b) return;
    const updated = { ...b, has_montaje: activo };
    if (activo) {
      if (!updated.montaje_fecha) updated.montaje_fecha = updated.fecha;
      if (!updated.montaje_hora_fin && updated.hora_inicio) updated.montaje_hora_fin = updated.hora_inicio;
      if (!updated.montaje_hora_inicio && updated.hora_inicio) {
        const [h, m] = updated.hora_inicio.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) {
          const totalMin = Math.max(6 * 60, h * 60 + m - 60);
          const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
          const mm = String(totalMin % 60).padStart(2, '0');
          updated.montaje_hora_inicio = `${hh}:${mm}`;
        } else {
          updated.montaje_hora_inicio = '09:00';
        }
      }
    }
    this.borrador.set(updated);
    this.invalidarComprobacionHorarios();
  }

  alternarDesmontaje(activo: boolean): void {
    const b = this.borrador();
    if (!b) return;
    const updated = { ...b, has_desmontaje: activo };
    if (activo) {
      if (!updated.desmontaje_fecha) updated.desmontaje_fecha = updated.fecha;
      if (!updated.desmontaje_hora_inicio && updated.hora_fin) updated.desmontaje_hora_inicio = updated.hora_fin;
      if (!updated.desmontaje_hora_fin && updated.hora_fin) {
        const [h, m] = updated.hora_fin.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) {
          const totalMin = Math.min(22 * 60, h * 60 + m + 60);
          const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
          const mm = String(totalMin % 60).padStart(2, '0');
          updated.desmontaje_hora_fin = `${hh}:${mm}`;
        } else {
          updated.desmontaje_hora_fin = '14:00';
        }
      }
    }
    this.borrador.set(updated);
    this.invalidarComprobacionHorarios();
  }

  alternarEnsayo(activo: boolean): void {
    const b = this.borrador();
    if (!b) return;
    const updated = { ...b, has_ensayo: activo };
    if (activo) {
      if (!updated.ensayo_fecha) updated.ensayo_fecha = updated.fecha;
      if (!updated.ensayo_hora_inicio) updated.ensayo_hora_inicio = '08:00';
      if (!updated.ensayo_hora_fin) updated.ensayo_hora_fin = '09:00';
    }
    this.borrador.set(updated);
    this.invalidarComprobacionHorarios();
  }

  // Métodos del Paso 2: Adicionales
  onCambioAdicionalSelect(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.adicionalSeleccionadoId.set(val);
  }

  agregarOActualizarAdicional(): void {
    this.errorAdicional.set(null);
    const b = this.borrador();
    const itemCat = this.adicionalCatalogoActual();
    if (!b || !itemCat) return;

    const cant = Math.max(1, Number(this.adicionalCantidad()) || 1);
    const hrs = Math.max(1, Number(this.adicionalHoras()) || 1);
    const subtotal = cant * hrs * (Number(itemCat.tarifa_hora) || 0);

    const lista = [...(b.adicionales ?? [])];
    const indexExistente = lista.findIndex((item) => item.id === itemCat.id);

    if (this.adicionalModoEdicion() && this.adicionalEditandoId()) {
      const editIdx = lista.findIndex((item) => item.id === this.adicionalEditandoId());
      if (editIdx >= 0) {
        lista[editIdx] = {
          id: itemCat.id,
          nombre: itemCat.nombre,
          cantidad: cant,
          horas: hrs,
          tarifa_hora: Number(itemCat.tarifa_hora) || 0,
          subtotal,
        };
      }
      this.cancelarEdicionAdicional();
    } else {
      if (indexExistente >= 0) {
        // Si ya existe, actualiza cantidad y horas
        lista[indexExistente] = {
          id: itemCat.id,
          nombre: itemCat.nombre,
          cantidad: cant,
          horas: hrs,
          tarifa_hora: Number(itemCat.tarifa_hora) || 0,
          subtotal,
        };
      } else {
        lista.push({
          id: itemCat.id,
          nombre: itemCat.nombre,
          cantidad: cant,
          horas: hrs,
          tarifa_hora: Number(itemCat.tarifa_hora) || 0,
          subtotal,
        });
      }
    }

    this.borrador.set({
      ...b,
      adicionales: lista,
    });
  }

  editarAdicional(item: AdicionalItem): void {
    this.adicionalSeleccionadoId.set(item.id);
    this.adicionalCantidad.set(item.cantidad);
    this.adicionalHoras.set(item.horas);
    this.adicionalModoEdicion.set(true);
    this.adicionalEditandoId.set(item.id);
  }

  cancelarEdicionAdicional(): void {
    this.adicionalModoEdicion.set(false);
    this.adicionalEditandoId.set(null);
    this.adicionalCantidad.set(1);
    this.adicionalHoras.set(1);
  }

  quitarAdicional(item: AdicionalItem): void {
    const b = this.borrador();
    if (!b) return;
    const lista = (b.adicionales ?? []).filter((i) => i.id !== item.id);
    this.borrador.set({
      ...b,
      adicionales: lista,
    });
    if (this.adicionalEditandoId() === item.id) {
      this.cancelarEdicionAdicional();
    }
  }

  // Paso 2: Descartar cambios
  solicitarDescarte(): void {
    if (this.tieneCambiosSinGuardar()) {
      this.modalDescartarAbierto.set(true);
    } else {
      this.ejecutarDescarte();
    }
  }

  ejecutarDescarte(): void {
    const e = this.eventoSeleccionado();
    if (e) {
      this.borrador.set(crearBorradorAsesorDesdeEvento(e));
    }
    this.cancelarConsultaDisponibilidad();
    this.huellaComprobadaExito.set(null);
    this.huellaComprobadaFallo.set(null);
    this.resultadoServidor.set(null);
    this.errorConsultaServidor.set(null);
    this.modalDescartarAbierto.set(false);
    this.cancelarEdicionAdicional();
    this.irPaso(1);
  }

  cerrarModalDescartar(): void {
    this.modalDescartarAbierto.set(false);
  }

  // Paso 3: Validación de disponibilidad
  // Primero la coherencia local (rango 06:00–22:00, orden, franjas); si pasa, se consulta al servidor si el auditorio
  // está libre. Solo la respuesta «disponible» del servidor habilita el Paso 4.
  comprobarDisponibilidad(): void {
    this.cancelarConsultaDisponibilidad();
    const huella = this.huellaHorarioActual();
    const val = this.validacionHorariosActual();
    this.huellaComprobadaExito.set(null);
    this.resultadoServidor.set(null);
    this.errorConsultaServidor.set(null);
    if (!val.esValido) {
      this.huellaComprobadaFallo.set(huella);
      return;
    }
    this.huellaComprobadaFallo.set(null);

    const b = this.borrador();
    if (!b) return;
    this.huellaConsultando.set(huella);
    this.consultaDisponibilidad = this.api.consultarDisponibilidad(this.payloadDisponibilidad(b)).subscribe({
      next: (respuesta) => {
        // Si el asesor editó el horario mientras tanto, la respuesta ya no corresponde a lo que ve
        if (this.huellaHorarioActual() !== huella) return;
        this.huellaConsultando.set(null);
        if (respuesta.disponible) {
          this.huellaComprobadaExito.set(huella);
        } else {
          this.resultadoServidor.set({ huella, disponible: false, mensaje: respuesta.mensaje ?? '' });
        }
      },
      error: (err: unknown) => {
        if (this.huellaHorarioActual() !== huella) return;
        this.huellaConsultando.set(null);
        this.errorConsultaServidor.set({ huella, mensaje: this.api.obtenerMensajeError(err, 'carga') });
      },
    });
  }

  /** Cuerpo de POST /disponibilidad a partir del borrador (las franjas técnicas desactivadas van vacías). */
  private payloadDisponibilidad(b: BorradorAsesor): ConsultaDisponibilidadPayload {
    return {
      evento_id: b.evento_id,
      fecha_propuesta: b.fecha,
      hora_inicio_propuesta: b.hora_inicio,
      hora_fin_propuesta: b.hora_fin,
      tiempos_tecnicos_propuestos: {
        has_montaje: b.has_montaje,
        montaje_fecha: b.has_montaje ? b.montaje_fecha : '',
        montaje_hora_inicio: b.has_montaje ? b.montaje_hora_inicio : '',
        montaje_hora_fin: b.has_montaje ? b.montaje_hora_fin : '',
        has_desmontaje: b.has_desmontaje,
        desmontaje_fecha: b.has_desmontaje ? b.desmontaje_fecha : '',
        desmontaje_hora_inicio: b.has_desmontaje ? b.desmontaje_hora_inicio : '',
        desmontaje_hora_fin: b.has_desmontaje ? b.desmontaje_hora_fin : '',
        has_ensayo: b.has_ensayo,
        ensayo_fecha: b.has_ensayo ? b.ensayo_fecha : '',
        ensayo_hora_inicio: b.has_ensayo ? b.ensayo_hora_inicio : '',
        ensayo_hora_fin: b.has_ensayo ? b.ensayo_hora_fin : '',
      },
    };
  }

  private cancelarConsultaDisponibilidad(): void {
    this.consultaDisponibilidad?.unsubscribe();
    this.consultaDisponibilidad = null;
    this.huellaConsultando.set(null);
  }

  enfocarCampoPaso2(campoId?: string | null): void {
    const idAEnfocar = campoId || this.validacionHorariosActual().primerCampoInvalido || 'eventStartTime';
    this.irPaso(2);
    setTimeout(() => {
      if (typeof document !== 'undefined') {
        const el = document.getElementById(idAEnfocar);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
        }
      }
    }, 50);
  }

  errorCampoHorario(campoId: string): string | null {
    if (this.estadoPresentacionComprobacion() !== 'invalido') {
      return null;
    }
    return this.validacionHorariosActual().erroresPorCampo[campoId] ?? null;
  }

  // Paso 4: Ficha completa
  toggleFicha(): void {
    this.fichaAbierta.set(!this.fichaAbierta());
  }

  // Modal de revisión de solicitudes recibidas (Paso 1)
  abrirModalSolicitud(sol: Solicitud): void {
    this.solicitudSeleccionadaModal.set(sol);
  }

  cerrarModalSolicitud(): void {
    this.solicitudSeleccionadaModal.set(null);
  }

  // Comparativo de campos para la solicitud en modal
  filasComparativaSolicitud(sol: Solicitud): FilaComparativa[] {
    return construirFilasComparativa(sol.datos_originales, sol.datos_propuestos);
  }

  // Comparativo de adicionales para la solicitud en modal (tarifas históricas)
  comparativoAdicionalesSolicitud(sol: Solicitud): ResumenComparativoAdicionales {
    return calcularComparativoAdicionales(
      sol.datos_originales?.adicionales,
      sol.datos_propuestos?.adicionales,
      this.catalogoAdicionales()
    );
  }

  nombreEventoSolicitud(sol?: Solicitud | null): string {
    if (!sol) return '';
    return sol.datos_originales?.nombre || `Evento ID: ${sol.evento_id}`;
  }

  contactoSolicitud(sol?: Solicitud | null): string {
    if (!sol) return 'Sin especificar';
    return (
      sol.datos_propuestos?.contacto ||
      sol.datos_originales?.contacto ||
      'Sin especificar'
    );
  }

  // Helpers de formato para la vista
  formatoFecha(fecha?: string): string {
    return formatearFechaVisual(fecha);
  }

  formatoEnvio(fechaIso?: string): string {
    return formatearFechaHoraEnvio(fechaIso);
  }

  formatoMoneda(val?: number | string | null): string {
    return formatSoles(val);
  }

  resumenCambios(sol: Solicitud): string {
    return obtenerResumenCambiosSolicitud(sol, this.catalogoAdicionales());
  }

  /**
   * Obtiene el identificador visible del evento según el contrato real de la API.
   * Si existe un campo de código comercial en el objeto del evento, muestra ese valor.
   * Si únicamente existe el identificador numérico (id), muestra «ID: 1», «ID: 2», etc.
   * Elimina la generación artificial de prefijos «EVT-» y el relleno con ceros.
   */
  codigoEvento(id?: number | null): string {
    if (id === undefined || id === null) return 'ID: -';
    const ev = this.eventos().find((e) => e.id === id);
    if (ev) {
      const codComercial =
        (ev as unknown as { codigo?: string; codigo_comercial?: string; code?: string }).codigo ||
        (ev as unknown as { codigo?: string; codigo_comercial?: string; code?: string }).codigo_comercial ||
        (ev as unknown as { codigo?: string; codigo_comercial?: string; code?: string }).code;
      if (codComercial && codComercial.trim()) {
        return codComercial.trim();
      }
    }
    return `ID: ${id}`;
  }

  /**
   * Obtiene el nombre del cliente o razón social del evento.
   * El backend completa `cliente_nombre` (razón social) desde la tabla de clientes. Si el cliente aún no está
   * registrado allí se devuelve 'No disponible'; nunca se sustituye por el contacto del evento (es otra persona).
   */
  obtenerClienteEvento(evt?: Evento | null): string {
    const valor = evt?.cliente_nombre;
    return valor && valor.trim() ? valor.trim() : 'No disponible';
  }

  /**
   * Formatea los tiempos técnicos con su nombre en negrita y rango horario completo,
   * reproduciendo fielmente el prototipo original sin abreviaturas técnicas.
   */
  obtenerItemsTiemposTecnicos(evt?: Evento | null): Array<{ etiqueta: string; detalle: string }> {
    if (!evt) return [];
    const items: Array<{ etiqueta: string; detalle: string }> = [];
    if (evt.has_montaje) {
      const fMont = formatearFechaVisual(evt.montaje_fecha || evt.fecha);
      const ini = (evt.montaje_hora_inicio || '').trim() || '00:00';
      const fin = (evt.montaje_hora_fin || '').trim() || (evt.hora_inicio || '').trim() || '00:00';
      items.push({ etiqueta: 'Montaje:', detalle: `${fMont} (${ini} - ${fin})` });
    }
    if (evt.has_desmontaje) {
      const fDesm = formatearFechaVisual(evt.desmontaje_fecha || evt.fecha);
      const ini = (evt.desmontaje_hora_inicio || '').trim() || (evt.hora_fin || '').trim() || '00:00';
      const fin = (evt.desmontaje_hora_fin || '').trim() || '00:00';
      items.push({ etiqueta: 'Desmontaje:', detalle: `${fDesm} (${ini} - ${fin})` });
    }
    if (evt.has_ensayo) {
      const fEns = formatearFechaVisual(evt.ensayo_fecha || evt.fecha);
      const ini = (evt.ensayo_hora_inicio || '').trim() || '00:00';
      const fin = (evt.ensayo_hora_fin || '').trim() || '00:00';
      items.push({ etiqueta: 'Ensayo:', detalle: `${fEns} (${ini} - ${fin})` });
    }
    return items;
  }
}
