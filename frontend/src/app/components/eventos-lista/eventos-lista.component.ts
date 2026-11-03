import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  ESTADO_PENDIENTE_REVISION,
  Evento,
  Solicitud,
} from '../../models/gestor-eventos.models';

@Component({
  selector: 'app-eventos-lista',
  standalone: true,
  template: `
    <div class="bloque-eventos">
      <div class="tarjeta-cabecera-flex">
        <div>
          <h2 id="titulo-paso-1" tabindex="-1">1. Eventos programados</h2>
          <p class="ayuda" style="margin-bottom: 8px;">
            Seleccione el evento en el cual desea solicitar un cambio de fecha u horario. Su reserva
            actual se mantendrá sin cambios mientras la solicitud esté pendiente de revisión.
          </p>
        </div>
        <button
          type="button"
          class="btn btn-sec btn-chico"
          (click)="reintentar.emit()"
          [disabled]="cargando"
        >
          Actualizar eventos
        </button>
      </div>

      @if (cargando) {
        <div class="aviso aviso-info estado-carga" role="status" aria-live="polite">
          <span class="spinner" aria-hidden="true"></span>
          <span>Cargando eventos desde el servidor...</span>
        </div>
      } @else if (errorCarga) {
        <div class="aviso aviso-error alerta-flex" role="alert">
          <div>
            <strong>Error al consultar los eventos</strong>
            <p style="margin-top: 4px;">{{ errorCarga }}</p>
          </div>
          <button type="button" class="btn btn-sec btn-chico" (click)="reintentar.emit()">
            Reintentar
          </button>
        </div>
      } @else if (eventos.length === 0) {
        <div class="aviso aviso-info" role="status">
          No hay eventos registrados en este momento.
        </div>
      } @else {
        <div class="lista-eventos-cliente">
          @for (evento of eventos; track evento.id) {
            @let solPendiente = obtenerSolicitudPendiente(evento.id);
            <article
              class="tarjeta-evento-cliente"
              [class.tarjeta-evento-cliente--seleccionada]="eventoSeleccionadoId === evento.id"
              [attr.data-evento-id]="evento.id"
            >
              <div class="tarjeta-evento-cabecera">
                <div>
                  <span class="badge-solicitud-codigo">ID: {{ evento.id }}</span>
                  <h3 class="evento-titulo">{{ evento.nombre }}</h3>
                </div>
                <div class="insignias-evento">
                  <span class="badge-confirmado insignia-estado">{{ evento.estado }}</span>
                  @if (eventoSeleccionadoId === evento.id) {
                    <span class="etiqueta et-evento-activo insignia-seleccionado">Evento seleccionado</span>
                  }
                  @if (solPendiente) {
                    <span class="badge-solicitud-pendiente">
                      Pendiente de revisión (Solicitud #{{ solPendiente.id }})
                    </span>
                  }
                </div>
              </div>

              <div class="tarjeta-evento-detalles">
                <div class="tarjeta-evento-detalles-item">
                  <small>Espacio asignado</small>
                  <strong>{{ evento.espacio }}</strong>
                </div>
                <div class="tarjeta-evento-detalles-item">
                  <small>Fecha confirmada</small>
                  <strong>{{ evento.fecha }}</strong>
                </div>
                <div class="tarjeta-evento-detalles-item">
                  <small>Horario del evento</small>
                  <strong class="rango-horario">
                    {{ evento.hora_inicio }} - {{ evento.hora_fin }}
                  </strong>
                </div>
                @if (evento.contacto) {
                  <div class="tarjeta-evento-detalles-item">
                    <small>Persona de contacto</small>
                    <strong>{{ evento.contacto }}</strong>
                  </div>
                }
              </div>

              <div class="tarjeta-evento-pie">
                <div class="acciones-pie-evento">
                  @if (solPendiente) {
                    <button
                      type="button"
                      class="btn btn-sec"
                      (click)="verSolicitud.emit(solPendiente)"
                    >
                      Ver solicitud en trámite
                    </button>
                    <button
                      type="button"
                      class="btn btn-primario btn-solicitar"
                      disabled
                      title="No se permite registrar otra solicitud mientras exista una pendiente de revisión"
                    >
                      Solicitar modificación
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="btn btn-primario btn-solicitar"
                      (click)="seleccionarEvento.emit(evento)"
                    >
                      Solicitar modificación &rarr;
                    </button>
                  }
                </div>
              </div>
            </article>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .tarjeta-evento-cliente {
        border: 1px solid var(--borde);
        border-radius: 8px;
        background: var(--blanco);
        padding: 16px;
        margin-bottom: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        transition:
          border-color 0.15s,
          box-shadow 0.15s;
      }

      .tarjeta-evento-cliente:hover {
        border-color: var(--primario-2);
        box-shadow: 0 2px 8px rgba(19, 38, 74, 0.06);
      }

      .tarjeta-evento-cliente--seleccionada {
        border-color: var(--primario-2);
      }

      .tarjeta-evento-cabecera {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 8px;
      }

      .tarjeta-evento-cabecera h3,
      .evento-titulo {
        font-size: 16px !important;
        color: var(--primario) !important;
        margin: 4px 0 0 !important;
        padding: 0 !important;
        border: none !important;
        line-height: 1.3;
      }

      .insignias-evento {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
      }

      .tarjeta-evento-detalles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
        background: var(--fondo);
        padding: 12px;
        border-radius: 6px;
        font-size: 13px;
      }

      .tarjeta-evento-detalles-item small {
        display: block;
        color: var(--gris);
        font-size: 11px;
        line-height: 1.35;
      }

      .tarjeta-evento-detalles-item strong {
        color: var(--texto);
        font-size: 13px;
        line-height: 1.35;
      }

      .tarjeta-evento-pie {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 4px;
      }

      .acciones-pie-evento {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-left: auto;
      }

      .estado-carga {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #c5d1e8;
        border-top-color: var(--primario-2);
        border-radius: 50%;
        animation: girar 0.8s linear infinite;
      }

      @keyframes girar {
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

      @media (max-width: 600px) {
        .acciones-pie-evento {
          width: 100%;
          margin-left: 0;
          flex-direction: column;
        }

        .acciones-pie-evento .btn {
          width: 100%;
        }
      }
    `,
  ],
})
export class EventosListaComponent {
  @Input() eventos: Evento[] = [];
  @Input() solicitudes: Solicitud[] = [];
  @Input() eventoSeleccionadoId: number | null = null;
  @Input() cargando = false;
  @Input() errorCarga = '';

  @Output() seleccionarEvento = new EventEmitter<Evento>();
  @Output() verSolicitud = new EventEmitter<Solicitud>();
  @Output() reintentar = new EventEmitter<void>();

  obtenerSolicitudPendiente(eventoId: number): Solicitud | undefined {
    return this.solicitudes.find(
      (s) => s.evento_id === eventoId && s.estado === ESTADO_PENDIENTE_REVISION
    );
  }
}
