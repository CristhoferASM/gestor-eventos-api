import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  AdicionalCatalogo,
  ESTADO_RETIRADA_CLIENTE,
  Evento,
  Solicitud,
  formatearCodigoEvento,
  formatearCodigoSolicitud,
  formatearFechaHoraEnvio,
  obtenerResumenCambiosSolicitud,
} from '../../models/gestor-eventos.models';

@Component({
  selector: 'app-solicitudes-lista',
  standalone: true,
  template: `
    <div class="seccion-solicitudes" id="seccionSolicitudes">
      <div class="solicitudes-cabecera">
        <h3>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Solicitudes de modificación
        </h3>
        <button
          type="button"
          class="btn btn-sec btn-chico"
          (click)="reintentar.emit()"
          [disabled]="cargando"
        >
          Actualizar solicitudes
        </button>
      </div>

      @if (cargando) {
        <div class="aviso aviso-info estado-carga" role="status" aria-live="polite">
          <span class="spinner" aria-hidden="true"></span>
          <span>Consultando solicitudes registradas...</span>
        </div>
      } @else if (errorCarga) {
        <div class="aviso aviso-error alerta-flex" role="alert">
          <div>
            <strong>Error al consultar las solicitudes</strong>
            <p style="margin-top: 4px;">{{ errorCarga }}</p>
          </div>
          <button type="button" class="btn btn-sec btn-chico" (click)="reintentar.emit()">
            Reintentar
          </button>
        </div>
      } @else if (solicitudes.length === 0) {
        <p class="ayuda texto-vacio" role="status">Todavía no hay solicitudes registradas</p>
      } @else {
        <!-- Tabla en escritorio: seis columnas compactas del prototipo -->
        <div class="tabla-wrap vista-escritorio">
          <table class="tabla-solicitudes">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Evento</th>
                <th scope="col">Fecha de envío</th>
                <th scope="col">Cambios solicitados</th>
                <th scope="col">Estado</th>
                <th scope="col" class="num-der">Acción</th>
              </tr>
            </thead>
            <tbody>
              @for (sol of solicitudes; track sol.id) {
                <tr>
                  <td class="celda-codigo">
                    <span class="badge-solicitud-codigo">{{ formatearCodigoSolicitud(sol) }}</span>
                  </td>
                  <td class="celda-evento">
                    <span class="evento-nombre">{{ obtenerNombreEventoSolicitud(sol) }}</span>
                    <small class="subtexto-evento">Evento {{ codigoEvento(sol.evento_id) }}</small>
                  </td>
                  <td class="celda-fecha-envio">
                    <span class="fecha-envio-texto">{{ formatearFechaHoraEnvio(sol.fecha_creacion) }}</span>
                  </td>
                  <td class="celda-cambios">
                    <span class="texto-cambios-solicitados">{{ obtenerResumenCambios(sol) }}</span>
                  </td>
                  <td class="celda-estado">
                    <span [class.badge-solicitud-pendiente]="sol.estado !== estadoRetirada" [class.badge-solicitud-retirada]="sol.estado === estadoRetirada">{{ sol.estado }}</span>
                  </td>
                  <td class="num-der celda-accion">
                    <button
                      type="button"
                      class="btn btn-sec btn-chico btn-accion-detalle"
                      (click)="verDetalle.emit(sol)"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Tarjetas en móvil -->
        <div class="tarjetas-solicitudes-movil vista-movil">
          @for (sol of solicitudes; track sol.id) {
            <article class="tarjeta-solicitud-movil">
              <div class="tarjeta-solicitud-movil__cabecera">
                <span class="badge-solicitud-codigo">{{ formatearCodigoSolicitud(sol) }}</span>
                <span [class.badge-solicitud-pendiente]="sol.estado !== estadoRetirada" [class.badge-solicitud-retirada]="sol.estado === estadoRetirada">{{ sol.estado }}</span>
              </div>

              <h4 class="tarjeta-solicitud-movil__evento">
                {{ obtenerNombreEventoSolicitud(sol) }}
                <small>(Evento {{ codigoEvento(sol.evento_id) }})</small>
              </h4>

              <div class="tarjeta-solicitud-movil__meta">
                <div class="tarjeta-solicitud-movil__item">
                  <small>Fecha de envío: </small>
                  <span class="fecha-envio-texto">{{ formatearFechaHoraEnvio(sol.fecha_creacion) }}</span>
                </div>
                <div class="tarjeta-solicitud-movil__item">
                  <small>Cambios solicitados: </small>
                  <span class="texto-cambios-solicitados">{{ obtenerResumenCambios(sol) }}</span>
                </div>
              </div>

              <div class="tarjeta-solicitud-movil__pie">
                <button
                  type="button"
                  class="btn btn-sec btn-chico btn-accion-detalle"
                  (click)="verDetalle.emit(sol)"
                >
                  Ver detalle
                </button>
              </div>
            </article>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .seccion-solicitudes {
        margin-top: 24px;
        border-top: 1px solid var(--borde);
        padding-top: 20px;
      }

      .solicitudes-cabecera {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }

      .solicitudes-cabecera h3 {
        font-size: 16px !important;
        color: var(--primario) !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .texto-vacio {
        margin-top: 8px;
        font-size: 13.5px;
      }

      .tabla-wrap {
        overflow-x: auto;
        border: 1px solid var(--borde);
        border-radius: 8px;
      }

      .tabla-solicitudes {
        width: 100%;
        border-collapse: collapse;
        font-size: 13.5px;
      }

      .tabla-solicitudes th {
        background: var(--primario);
        color: var(--blanco);
        text-align: left;
        padding: 10px 12px;
        font-weight: normal;
        white-space: nowrap;
        font-size: 13px;
      }

      .tabla-solicitudes td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--borde);
        vertical-align: middle;
      }

      .tabla-solicitudes tr:hover td {
        background: var(--suave);
      }

      .num-der {
        text-align: right;
      }

      .celda-codigo {
        white-space: nowrap;
        width: 1%;
      }

      .celda-evento {
        min-width: 180px;
      }

      .evento-nombre {
        display: block;
        font-weight: 700;
        color: var(--primario);
        line-height: 1.35;
        overflow-wrap: break-word;
        word-break: normal;
        hyphens: manual;
      }

      .subtexto-evento {
        display: block;
        font-size: 11.5px;
        color: var(--texto-sec);
        margin-top: 2px;
      }

      .celda-fecha-envio {
        white-space: nowrap;
      }

      .fecha-envio-texto {
        font-size: 13px;
        color: var(--texto-sec);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .celda-cambios {
        white-space: nowrap;
      }

      .texto-cambios-solicitados {
        font-size: 13px;
        color: var(--texto);
      }

      .celda-estado {
        white-space: nowrap;
      }

      .celda-accion {
        white-space: nowrap;
        width: 1%;
      }

      .btn-accion-detalle {
        white-space: nowrap;
        padding: 6px 12px;
      }

      .vista-movil {
        display: none;
      }

      .tarjetas-solicitudes-movil {
        flex-direction: column;
        gap: 12px;
      }

      .tarjeta-solicitud-movil {
        border: 1px solid var(--borde);
        border-radius: 8px;
        padding: 14px;
        background: var(--blanco);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .tarjeta-solicitud-movil__cabecera {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .tarjeta-solicitud-movil__evento {
        font-size: 14.5px;
        color: var(--primario);
        margin: 0;
        line-height: 1.35;
        overflow-wrap: break-word;
        word-break: normal;
      }

      .tarjeta-solicitud-movil__evento small {
        font-weight: normal;
        color: var(--texto-sec);
        font-size: 12px;
      }

      .tarjeta-solicitud-movil__meta {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 13px;
      }

      .tarjeta-solicitud-movil__item {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-items: baseline;
      }

      .tarjeta-solicitud-movil__item small {
        font-weight: 600;
        color: var(--primario);
      }

      .tarjeta-solicitud-movil__pie {
        display: flex;
        justify-content: flex-end;
        margin-top: 4px;
      }

      .spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid var(--borde);
        border-top-color: var(--primario-2);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .alerta-flex {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      @media (max-width: 768px) {
        .vista-escritorio {
          display: none;
        }

        .vista-movil {
          display: flex;
        }
      }

      @media (max-width: 480px) {
        .tarjeta-solicitud-movil__pie .btn {
          width: 100%;
        }
      }
    `,
  ],
})
export class SolicitudesListaComponent {
  readonly estadoRetirada = ESTADO_RETIRADA_CLIENTE;
  readonly formatearCodigoSolicitud = formatearCodigoSolicitud;
  readonly formatearFechaHoraEnvio = formatearFechaHoraEnvio;

  @Input() solicitudes: Solicitud[] = [];
  @Input() eventos: Evento[] = [];
  @Input() catalogoAdicionales: AdicionalCatalogo[] = [];
  @Input() cargando = false;
  @Input() errorCarga = '';

  @Output() verDetalle = new EventEmitter<Solicitud>();
  @Output() reintentar = new EventEmitter<void>();

  obtenerResumenCambios(sol: Solicitud): string {
    return obtenerResumenCambiosSolicitud(sol, this.catalogoAdicionales);
  }

  /** «EV-0003» con la base de la empresa; «ID: 1» con datos en memoria. */
  codigoEvento(eventoId: number): string {
    return formatearCodigoEvento(eventoId, this.eventos);
  }

  obtenerNombreEventoSolicitud(sol: Solicitud): string {
    if (sol.datos_originales?.nombre) {
      return sol.datos_originales.nombre;
    }
    return this.obtenerNombreEvento(sol.evento_id);
  }

  obtenerNombreEvento(eventoId: number): string {
    const encontrado = this.eventos.find((ev) => ev.id === eventoId);
    return encontrado ? encontrado.nombre : `Evento #${eventoId}`;
  }
}
