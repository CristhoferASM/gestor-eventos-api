import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AdicionalCatalogo,
  AdicionalItem,
  ESTADO_PENDIENTE_REVISION,
  Evento,
  FilaComparativa,
  ResumenComparativoAdicionales,
  Solicitud,
  SolicitudCreacionPayload,
  TEXTO_NO_DISPONIBLE,
  TEXTO_SIN_ESPECIFICAR,
  calcularComparativoAdicionales,
  construirFilasComparativa,
  formatearFechaHoraEnvio,
  formatearFechaVisual,
  formatearTextoObligatorio,
  formatearTextoOpcional,
} from './models/gestor-eventos.models';
import { Router, NavigationEnd } from '@angular/router';
import { EventosApiService } from './services/eventos-api.service';
import { EventosListaComponent } from './components/eventos-lista/eventos-lista.component';
import { SolicitudFormularioComponent } from './components/solicitud-formulario/solicitud-formulario.component';
import { SolicitudesListaComponent } from './components/solicitudes-lista/solicitudes-lista.component';
import { AsesorPortalComponent } from './components/asesor-portal/asesor-portal.component';

export type PasoPortal = 1 | 2 | 3 | 4;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    EventosListaComponent,
    SolicitudFormularioComponent,
    SolicitudesListaComponent,
    AsesorPortalComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly api = inject(EventosApiService);
  private readonly router = inject(Router, { optional: true });

  readonly vistaActiva = signal<'cliente' | 'asesor'>('cliente');

  readonly textoSinEspecificar = TEXTO_SIN_ESPECIFICAR;
  readonly textoNoDisponible = TEXTO_NO_DISPONIBLE;

  readonly filasComparativaPaso3 = computed<FilaComparativa[]>(() => {
    const ev = this.eventoSeleccionado();
    const b = this.borradorPropuesta();
    if (!ev || !b) {
      return [];
    }

    const propGeneral = b.informacion_general_propuesta;
    const propTiempos = b.tiempos_tecnicos_propuestos;
    const propData = {
      nombre: propGeneral ? propGeneral.nombre : ev.nombre,
      contacto: propGeneral ? propGeneral.contacto : ev.contacto,
      telefono: propGeneral !== undefined ? propGeneral.telefono : ev.telefono,
      correo: propGeneral !== undefined ? propGeneral.correo : ev.correo,
      observaciones: propGeneral !== undefined ? propGeneral.observaciones : ev.observaciones,
      fecha: b.fecha_propuesta,
      hora_inicio: b.hora_inicio_propuesta,
      hora_fin: b.hora_fin_propuesta,
      has_montaje: propTiempos !== undefined ? propTiempos.has_montaje : ev.has_montaje,
      montaje_fecha: propTiempos !== undefined ? propTiempos.montaje_fecha : ev.montaje_fecha,
      montaje_hora_inicio: propTiempos !== undefined ? propTiempos.montaje_hora_inicio : ev.montaje_hora_inicio,
      montaje_hora_fin: propTiempos !== undefined ? propTiempos.montaje_hora_fin : ev.montaje_hora_fin,
      has_desmontaje: propTiempos !== undefined ? propTiempos.has_desmontaje : ev.has_desmontaje,
      desmontaje_fecha: propTiempos !== undefined ? propTiempos.desmontaje_fecha : ev.desmontaje_fecha,
      desmontaje_hora_inicio: propTiempos !== undefined ? propTiempos.desmontaje_hora_inicio : ev.desmontaje_hora_inicio,
      desmontaje_hora_fin: propTiempos !== undefined ? propTiempos.desmontaje_hora_fin : ev.desmontaje_hora_fin,
      has_ensayo: propTiempos !== undefined ? propTiempos.has_ensayo : ev.has_ensayo,
      ensayo_fecha: propTiempos !== undefined ? propTiempos.ensayo_fecha : ev.ensayo_fecha,
      ensayo_hora_inicio: propTiempos !== undefined ? propTiempos.ensayo_hora_inicio : ev.ensayo_hora_inicio,
      ensayo_hora_fin: propTiempos !== undefined ? propTiempos.ensayo_hora_fin : ev.ensayo_hora_fin,
    };

    return construirFilasComparativa(ev, propData);
  });

  readonly resumenComparativoAdicionalesPaso3 = computed<ResumenComparativoAdicionales>(() => {
    const ev = this.eventoSeleccionado();
    const b = this.borradorPropuesta();
    const cat = this.catalogoAdicionales();
    if (!ev || !b) {
      return calcularComparativoAdicionales(undefined, undefined, cat);
    }
    let propItems: AdicionalItem[] = [];
    if (b.adicionales_propuestos) {
      propItems = b.adicionales_propuestos.map((p) => {
        const c = cat.find((item) => item.id === p.id);
        const orig = ev.adicionales?.find((a) => a.id === p.id);
        const nombre = c?.nombre || orig?.nombre || `[Adicional no identificado: ${p.id}]`;
        const tarifa = c?.tarifa_hora ?? orig?.tarifa_hora;
        return {
          id: p.id,
          nombre,
          unidad: c?.unidad || orig?.unidad || 'unidad',
          cantidad: p.cantidad,
          horas: p.horas,
          tarifa_hora: tarifa !== undefined ? tarifa : (undefined as any),
          subtotal: tarifa !== undefined ? Math.round(p.cantidad * p.horas * tarifa * 100) / 100 : 0,
        };
      });
    } else {
      propItems = ev.adicionales ?? [];
    }
    const res = calcularComparativoAdicionales(ev.adicionales, propItems, cat);
    if (this.errorCatalogoAdicionales()) {
      res.errorCatalogoIncompleto = true;
      res.mensajeErrorCatalogo = this.errorCatalogoAdicionales();
    }
    return res;
  });

  @ViewChild('formularioPaso2')
  formularioPaso2?: SolicitudFormularioComponent;

  @ViewChild('modalDetalleRef')
  modalDetalleRef?: ElementRef<HTMLElement>;

  @ViewChild('modalDescartarRef')
  modalDescartarRef?: ElementRef<HTMLElement>;

  readonly pasoActual = signal<PasoPortal>(1);

  readonly eventos = signal<Evento[]>([]);
  readonly catalogoAdicionales = signal<AdicionalCatalogo[]>([]);
  readonly cargandoCatalogoAdicionales = signal<boolean>(false);
  readonly errorCatalogoAdicionales = signal<string>('');
  readonly solicitudes = signal<Solicitud[]>([]);
  readonly eventoSeleccionado = signal<Evento | null>(null);

  readonly borradorPropuesta = signal<SolicitudCreacionPayload | null>(null);
  readonly solicitudConfirmada = signal<Solicitud | null>(null);

  readonly solicitudDetalleModal = signal<Solicitud | null>(null);
  readonly modalDescartarAbierto = signal<boolean>(false);
  readonly accionTrasDescartar = signal<'volver' | 'limpiar'>('limpiar');

  private ultimoElementoFoco: HTMLElement | null = null;

  readonly cargandoEventos = signal<boolean>(false);
  readonly errorEventos = signal<string>('');

  readonly cargandoSolicitudes = signal<boolean>(false);
  readonly errorSolicitudes = signal<string>('');

  readonly enviandoSolicitud = signal<boolean>(false);
  readonly mensajeExito = signal<string>('');
  readonly avisoRefrescoPosterior = signal<string>('');
  readonly errorEnvio = signal<string>('');

  readonly eventosConPendienteIds = computed<ReadonlySet<number>>(() => {
    const ids = new Set<number>();
    for (const sol of this.solicitudes()) {
      if (sol.estado === ESTADO_PENDIENTE_REVISION) {
        ids.add(sol.evento_id);
      }
    }
    return ids;
  });

  readonly eventoSeleccionadoTienePendiente = computed<boolean>(() => {
    const ev = this.eventoSeleccionado();
    if (!ev) {
      return false;
    }
    return this.eventosConPendienteIds().has(ev.id);
  });

  readonly puedeIrAPaso2 = computed<boolean>(() => {
    const ev = this.eventoSeleccionado();
    return ev !== null && !this.eventosConPendienteIds().has(ev.id);
  });

  readonly puedeIrAPaso3 = computed<boolean>(() => {
    const ev = this.eventoSeleccionado();
    const borrador = this.borradorPropuesta();
    if (!ev || !borrador || borrador.evento_id !== ev.id) {
      return false;
    }
    return !this.eventosConPendienteIds().has(ev.id);
  });

  readonly puedeIrAPaso4 = computed<boolean>(() => {
    return this.solicitudConfirmada() !== null;
  });

  readonly nombrePropuestoEnBorrador = computed<string>(() => {
    const ev = this.eventoSeleccionado();
    const b = this.borradorPropuesta();
    if (b?.informacion_general_propuesta) {
      return b.informacion_general_propuesta.nombre.trim();
    }
    return (ev?.nombre ?? '').trim();
  });

  readonly contactoPropuestoEnBorrador = computed<string>(() => {
    const ev = this.eventoSeleccionado();
    const b = this.borradorPropuesta();
    if (b?.informacion_general_propuesta) {
      return b.informacion_general_propuesta.contacto.trim();
    }
    return (ev?.contacto ?? '').trim();
  });

  readonly telefonoPropuestoEnBorrador = computed<string>(() => {
    const ev = this.eventoSeleccionado();
    const b = this.borradorPropuesta();
    if (b?.informacion_general_propuesta) {
      return b.informacion_general_propuesta.telefono.trim();
    }
    return (ev?.telefono ?? '').trim();
  });

  readonly correoPropuestoEnBorrador = computed<string>(() => {
    const ev = this.eventoSeleccionado();
    const b = this.borradorPropuesta();
    if (b?.informacion_general_propuesta) {
      return b.informacion_general_propuesta.correo.trim();
    }
    return (ev?.correo ?? '').trim();
  });

  readonly observacionesPropuestasEnBorrador = computed<string>(() => {
    const ev = this.eventoSeleccionado();
    const b = this.borradorPropuesta();
    if (b?.informacion_general_propuesta) {
      return b.informacion_general_propuesta.observaciones.trim();
    }
    return (ev?.observaciones ?? '').trim();
  });

  readonly nombreModificadoEnBorrador = computed<boolean>(() => {
    const ev = this.eventoSeleccionado();
    return Boolean(ev && this.nombrePropuestoEnBorrador() !== (ev.nombre ?? '').trim());
  });

  readonly contactoModificadoEnBorrador = computed<boolean>(() => {
    const ev = this.eventoSeleccionado();
    return Boolean(ev && this.contactoPropuestoEnBorrador() !== (ev.contacto ?? '').trim());
  });

  readonly telefonoModificadoEnBorrador = computed<boolean>(() => {
    const ev = this.eventoSeleccionado();
    return Boolean(ev && this.telefonoPropuestoEnBorrador() !== (ev.telefono ?? '').trim());
  });

  readonly correoModificadoEnBorrador = computed<boolean>(() => {
    const ev = this.eventoSeleccionado();
    return Boolean(ev && this.correoPropuestoEnBorrador() !== (ev.correo ?? '').trim());
  });

  readonly observacionesModificadasEnBorrador = computed<boolean>(() => {
    const ev = this.eventoSeleccionado();
    return Boolean(
      ev && this.observacionesPropuestasEnBorrador() !== (ev.observaciones ?? '').trim()
    );
  });

  readonly fechaModificadaEnBorrador = computed<boolean>(() => {
    const ev = this.eventoSeleccionado();
    const b = this.borradorPropuesta();
    return Boolean(ev && b && b.fecha_propuesta !== ev.fecha);
  });

  readonly horaInicioModificadaEnBorrador = computed<boolean>(() => {
    const ev = this.eventoSeleccionado();
    const b = this.borradorPropuesta();
    return Boolean(ev && b && b.hora_inicio_propuesta !== ev.hora_inicio);
  });

  readonly horaFinModificadaEnBorrador = computed<boolean>(() => {
    const ev = this.eventoSeleccionado();
    const b = this.borradorPropuesta();
    return Boolean(ev && b && b.hora_fin_propuesta !== ev.hora_fin);
  });

  readonly horarioModificadoEnBorrador = computed<boolean>(() => {
    return this.horaInicioModificadaEnBorrador() || this.horaFinModificadaEnBorrador();
  });

  ngOnInit(): void {
    if (typeof window !== 'undefined' && window.location?.pathname?.includes('asesor')) {
      this.vistaActiva.set('asesor');
    }
    this.router?.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.vistaActiva.set(event.urlAfterRedirects.includes('asesor') ? 'asesor' : 'cliente');
      }
    });

    this.cargarDatosIniciales();
  }

  cambiarVista(vista: 'cliente' | 'asesor'): void {
    this.vistaActiva.set(vista);
    if (this.router && this.router.config && this.router.config.length > 0) {
      this.router.navigate([`/${vista}`]).catch(() => {});
    }
  }

  cargarDatosIniciales(): void {
    this.cargarEventos();
    this.cargarSolicitudes();
    this.cargarCatalogoAdicionales();
  }

  cargarCatalogoAdicionales(): void {
    this.cargandoCatalogoAdicionales.set(true);
    this.errorCatalogoAdicionales.set('');
    this.api.obtenerCatalogoAdicionales().subscribe({
      next: (cat) => {
        this.cargandoCatalogoAdicionales.set(false);
        if (Array.isArray(cat) && cat.length > 0) {
          this.catalogoAdicionales.set(cat);
          this.errorCatalogoAdicionales.set('');
        } else {
          this.errorCatalogoAdicionales.set(
            'El catálogo de adicionales no devolvió servicios disponibles.'
          );
        }
      },
      error: () => {
        this.cargandoCatalogoAdicionales.set(false);
        this.errorCatalogoAdicionales.set(
          'No se pudo cargar el catálogo de adicionales. Verifique la conexión con el servidor.'
        );
      },
    });
  }

  cargarEventos(): void {
    this.cargandoEventos.set(true);
    this.errorEventos.set('');

    this.api.obtenerEventos().subscribe({
      next: (lista) => {
        const eventosSeguros = Array.isArray(lista) ? lista : [];
        this.eventos.set(eventosSeguros);
        this.cargandoEventos.set(false);

        const actual = this.eventoSeleccionado();
        if (actual) {
          const actualizado = eventosSeguros.find((e) => e.id === actual.id) ?? null;
          this.eventoSeleccionado.set(actualizado);
        } else if (eventosSeguros.length > 0) {
          this.eventoSeleccionado.set(eventosSeguros[0]);
        }
      },
      error: (err: unknown) => {
        this.cargandoEventos.set(false);
        this.errorEventos.set(this.api.obtenerMensajeError(err, 'carga'));
      },
    });
  }

  cargarSolicitudes(): void {
    this.cargandoSolicitudes.set(true);
    this.errorSolicitudes.set('');
    this.avisoRefrescoPosterior.set('');

    this.api.obtenerSolicitudes().subscribe({
      next: (lista) => {
        this.solicitudes.set(Array.isArray(lista) ? lista : []);
        this.cargandoSolicitudes.set(false);
      },
      error: (err: unknown) => {
        this.cargandoSolicitudes.set(false);
        this.errorSolicitudes.set(this.api.obtenerMensajeError(err, 'carga'));
      },
    });
  }

  alSeleccionarEvento(evento: Evento): void {
    const anterior = this.eventoSeleccionado();
    if (!anterior || anterior.id !== evento.id) {
      this.borradorPropuesta.set(null);
    }
    this.mensajeExito.set('');
    this.avisoRefrescoPosterior.set('');
    this.errorEnvio.set('');
    this.eventoSeleccionado.set(evento);

    if (!this.eventosConPendienteIds().has(evento.id)) {
      this.cambiarPaso(2);
    }
  }

  alContinuarARevision(payload: SolicitudCreacionPayload): void {
    this.borradorPropuesta.set(payload);
    this.errorEnvio.set('');
    this.cambiarPaso(3);
  }

  alModificarPropuestaDesdeRevision(): void {
    this.errorEnvio.set('');
    this.cambiarPaso(2);
  }

  alIntentarVolverAEventosDesdePaso2(): void {
    if (this.tieneCambiosSinGuardarEnPaso2()) {
      this.abrirModalDescartar('volver');
      return;
    }
    this.borradorPropuesta.set(null);
    this.cambiarPaso(1);
  }

  alIntentarDescartarEnPaso2(): void {
    this.abrirModalDescartar('limpiar');
  }

  confirmarDescarteCambios(): void {
    const accion = this.accionTrasDescartar();
    this.borradorPropuesta.set(null);
    this.errorEnvio.set('');
    this.formularioPaso2?.restaurarValoresOriginales();
    this.cerrarModalDescartar();

    if (accion === 'volver') {
      this.cambiarPaso(1);
    }
  }

  irAPasoDesdeBarra(paso: PasoPortal): void {
    if (paso === this.pasoActual()) {
      return;
    }

    if (paso === 1) {
      if (this.pasoActual() === 2 && this.tieneCambiosSinGuardarEnPaso2()) {
        this.abrirModalDescartar('volver');
        return;
      }
      this.cambiarPaso(1);
      return;
    }

    if (paso === 2 && this.puedeIrAPaso2()) {
      this.cambiarPaso(2);
      return;
    }

    if (paso === 3) {
      if (this.pasoActual() === 2 && this.formularioPaso2) {
        this.formularioPaso2.onSubmit();
        return;
      }
      if (this.puedeIrAPaso3()) {
        this.cambiarPaso(3);
      }
      return;
    }

    if (paso === 4 && this.puedeIrAPaso4()) {
      this.cambiarPaso(4);
    }
  }

  volverAMisEventos(): void {
    this.errorEnvio.set('');
    this.cambiarPaso(1);
  }

  alEnviarSolicitud(payload: SolicitudCreacionPayload): void {
    if (this.enviandoSolicitud()) {
      return;
    }

    this.borradorPropuesta.set(payload);
    this.enviandoSolicitud.set(true);
    this.mensajeExito.set('');
    this.avisoRefrescoPosterior.set('');
    this.errorEnvio.set('');

    this.api.crearSolicitud(payload).subscribe({
      next: (respuesta) => {
        this.enviandoSolicitud.set(false);
        this.mensajeExito.set(
          respuesta.mensaje || 'Solicitud registrada exitosamente.'
        );

        // La constancia debe leer los datos guardados por la API directamente, sin rellenar datos ausentes
        const creada: Solicitud = respuesta.solicitud;

        this.solicitudConfirmada.set(creada);
        this.borradorPropuesta.set(null);

        this.solicitudes.update((actuales) => {
          const yaExiste = actuales.some((s) => s.id === creada.id);
          return yaExiste ? actuales : [...actuales, creada];
        });

        this.cambiarPaso(4);
        this.refrescarSolicitudesTrasRegistro(creada);
      },
      error: (err: unknown) => {
        this.enviandoSolicitud.set(false);
        this.errorEnvio.set(this.api.obtenerMensajeError(err, 'envio'));

        if (err instanceof HttpErrorResponse && err.status === 409) {
          this.cargarSolicitudes();
        }
      },
    });
  }

  abrirDetalleSolicitudPorEvento(eventoId: number): void {
    const pendiente =
      this.solicitudes().find(
        (s) => s.evento_id === eventoId && s.estado === ESTADO_PENDIENTE_REVISION
      ) ??
      this.solicitudes().find((s) => s.evento_id === eventoId) ??
      null;

    if (pendiente) {
      this.abrirModalDetalle(pendiente);
    }
  }

  abrirModalDetalle(solicitud: Solicitud): void {
    this.guardarFocoActual();
    this.solicitudDetalleModal.set(solicitud);
    this.enfocarElementoTrasRender('#btn-cerrar-modal-detalle');
  }

  cerrarModalDetalle(): void {
    this.solicitudDetalleModal.set(null);
    this.restaurarFocoAnterior();
  }

  abrirModalDescartar(accion: 'volver' | 'limpiar'): void {
    this.guardarFocoActual();
    this.accionTrasDescartar.set(accion);
    this.modalDescartarAbierto.set(true);
    this.enfocarElementoTrasRender('#btn-cancelar-descarte');
  }

  cerrarModalDescartar(): void {
    this.modalDescartarAbierto.set(false);
    this.restaurarFocoAnterior();
  }

  filasComparativaModal(sol: Solicitud | null): FilaComparativa[] {
    if (!sol) {
      return [];
    }
    return construirFilasComparativa(sol.datos_originales, sol.datos_propuestos);
  }

  resumenComparativoModal(sol: Solicitud | null): ResumenComparativoAdicionales {
    if (!sol) {
      return calcularComparativoAdicionales(undefined, undefined, this.catalogoAdicionales());
    }
    return calcularComparativoAdicionales(
      sol.datos_originales?.adicionales,
      sol.datos_propuestos?.adicionales,
      this.catalogoAdicionales()
    );
  }

  formatearOpcional(valor: string | null | undefined): string {
    return formatearTextoOpcional(valor);
  }

  formatearObligatorio(valor: string | null | undefined): string {
    return formatearTextoObligatorio(valor);
  }

  formatearFechaVisual(fecha: string | null | undefined): string {
    return formatearFechaVisual(fecha);
  }

  formatearFechaHoraEnvio(fechaCreacion: string | null | undefined): string {
    return formatearFechaHoraEnvio(fechaCreacion);
  }

  esCampoModificadoSnapshot(orig: string | null | undefined, prop: string | null | undefined): boolean {
    return (orig ?? '').trim() !== (prop ?? '').trim();
  }

  esHorarioModificadoSnapshot(sol: Solicitud): boolean {
    return (
      this.esCampoModificadoSnapshot(sol.datos_originales?.hora_inicio, sol.datos_propuestos?.hora_inicio) ||
      this.esCampoModificadoSnapshot(sol.datos_originales?.hora_fin, sol.datos_propuestos?.hora_fin)
    );
  }

  obtenerNombreSnapshotOriginal(sol: Solicitud): string {
    const snap = sol.datos_originales?.nombre;
    if (snap === undefined || snap === null) {
      return `Evento #${sol.evento_id} (${TEXTO_NO_DISPONIBLE})`;
    }
    const limpio = snap.trim();
    return limpio.length > 0 ? limpio : `Evento #${sol.evento_id}`;
  }

  obtenerEspacioSnapshot(sol: Solicitud): string {
    const snap = (sol.datos_originales?.espacio ?? '').trim();
    return snap.length > 0 ? snap : 'Espacio asignado en reserva';
  }

  @HostListener('document:keydown', ['$event'])
  alPresionarTecla(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.solicitudDetalleModal()) {
        event.preventDefault();
        this.cerrarModalDetalle();
        return;
      }
      if (this.modalDescartarAbierto()) {
        event.preventDefault();
        this.cerrarModalDescartar();
        return;
      }
    }

    if (event.key === 'Tab') {
      if (this.solicitudDetalleModal() && this.modalDetalleRef?.nativeElement) {
        this.atraparFocoEnContenedor(event, this.modalDetalleRef.nativeElement);
      } else if (this.modalDescartarAbierto() && this.modalDescartarRef?.nativeElement) {
        this.atraparFocoEnContenedor(event, this.modalDescartarRef.nativeElement);
      }
    }
  }

  private tieneCambiosSinGuardarEnPaso2(): boolean {
    if (this.formularioPaso2?.tieneCambiosEnBorrador()) {
      return true;
    }
    return this.borradorPropuesta() !== null;
  }

  private cambiarPaso(nuevoPaso: PasoPortal): void {
    this.pasoActual.set(nuevoPaso);
    this.enfocarElementoTrasRender(`#titulo-paso-${nuevoPaso}`);
  }

  private guardarFocoActual(): void {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      this.ultimoElementoFoco = document.activeElement;
    }
  }

  private restaurarFocoAnterior(): void {
    const elemento = this.ultimoElementoFoco;
    this.ultimoElementoFoco = null;
    if (elemento && typeof elemento.focus === 'function') {
      setTimeout(() => elemento.focus(), 0);
    }
  }

  private enfocarElementoTrasRender(selector: string): void {
    setTimeout(() => {
      if (typeof document === 'undefined') {
        return;
      }
      const el = document.querySelector<HTMLElement>(selector);
      el?.focus();
    }, 0);
  }

  private atraparFocoEnContenedor(event: KeyboardEvent, contenedor: HTMLElement): void {
    const selectorFocables =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const elementos = Array.from(
      contenedor.querySelectorAll<HTMLElement>(selectorFocables)
    );
    if (elementos.length === 0) {
      return;
    }

    const primero = elementos[0];
    const ultimo = elementos[elementos.length - 1];
    const activo = document.activeElement as HTMLElement | null;

    if (event.shiftKey && activo === primero) {
      event.preventDefault();
      ultimo.focus();
    } else if (!event.shiftKey && activo === ultimo) {
      event.preventDefault();
      primero.focus();
    }
  }

  private refrescarSolicitudesTrasRegistro(solicitudRecienCreada?: Solicitud): void {
    this.api.obtenerSolicitudes().subscribe({
      next: (lista) => {
        this.solicitudes.set(Array.isArray(lista) ? lista : []);
        this.errorSolicitudes.set('');
        this.avisoRefrescoPosterior.set('');
      },
      error: () => {
        if (solicitudRecienCreada) {
          this.solicitudes.update((actuales) => {
            const yaExiste = actuales.some((s) => s.id === solicitudRecienCreada.id);
            return yaExiste ? actuales : [...actuales, solicitudRecienCreada];
          });
        }
        this.avisoRefrescoPosterior.set(
          'Tu solicitud quedó registrada en el servidor, pero falló la actualización automática del listado. Puedes pulsar "Reintentar actualización" sin volver a enviar la solicitud.'
        );
      },
    });
  }
}
