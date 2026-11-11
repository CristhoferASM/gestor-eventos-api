import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  ESTADO_PENDIENTE_REVISION,
  Evento,
  Solicitud,
  eventoAdmiteModificacion,
  formatearCodigoSolicitud,
  formatearEstadoEvento,
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
      } @else if (eventos.length === 0 && sinClienteVinculado) {
        <div class="tarjeta-estado-vacio" role="status">
          <div class="icono-estado-vacio" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <h3 style="margin-bottom: 8px; color: var(--primario);">No tienes eventos vinculados a esta cuenta</h3>
          <p style="color: var(--gris); font-size: 13.5px; max-width: 520px; margin: 0 auto 16px; line-height: 1.5;">
            @if (cuentaGoogle) {
              Has iniciado sesión con tu cuenta de Google (<strong>{{ correoCuenta || 'tu cuenta de Google' }}</strong>).
            } @else {
              Has iniciado sesión con <strong>{{ correoCuenta || 'tu cuenta' }}</strong>.
            }
            Esta cuenta aún no tiene contratos ni eventos registrados en el sistema de Showtech Solutions.
          </p>
          <div class="aviso-vinculo-pendiente">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>Para asociar tu cuenta con una reserva existente, contacta a tu asesor comercial.</span>
          </div>
          <div style="margin-top: 16px;">
            <button type="button" class="btn btn-sec btn-chico" (click)="verificarVinculo.emit()" [disabled]="cargando">
              Ya me vincularon: actualizar
            </button>
          </div>
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
                  <span class="badge-confirmado insignia-estado">{{ formatearEstadoEvento(evento.estado) }}</span>
                  @if (eventoSeleccionadoId === evento.id) {
                    <span class="etiqueta et-evento-activo insignia-seleccionado">Evento seleccionado</span>
                  }
                  @if (solPendiente) {
                    <span class="badge-solicitud-pendiente">
                      Pendiente de revisión (Solicitud {{ formatearCodigoSolicitud(solPendiente) }})
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
                  } @else if (!eventoAdmiteModificacion(evento)) {
                    <button
                      type="button"
                      class="btn btn-primario btn-solicitar"
                      disabled
                      title="Solo se pueden modificar los eventos contratados (reservados, con adelanto o pagados)"
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

      .tarjeta-estado-vacio {
        background: var(--blanco);
        border: 1.5px dashed var(--borde);
        border-radius: 12px;
        padding: 44px 20px;
        text-align: center;
        margin-bottom: 24px;
      }

      .icono-estado-vacio {
        width: 60px;
        height: 60px;
        margin: 0 auto 16px;
        background: #eff6ff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--primario-2);
      }

      .aviso-vinculo-pendiente {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #1e40af;
        padding: 10px 16px;
        border-radius: 6px;
        font-size: 12.5px;
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
  /** true si el usuario es un cliente sin cliente_id vinculado (ej. entró con Google). */
  @Input() sinClienteVinculado = false;
  /** Correo de la cuenta, para el aviso del estado vacío. */
  @Input() correoCuenta = '';
  /** true si la cuenta se creó con Google. */
  @Input() cuentaGoogle = false;

  @Output() seleccionarEvento = new EventEmitter<Evento>();
  @Output() verSolicitud = new EventEmitter<Solicitud>();
  @Output() reintentar = new EventEmitter<void>();
  /** El cliente sin vínculo pide revisar si el asesor ya lo asoció a un cliente. */
  @Output() verificarVinculo = new EventEmitter<void>();

  readonly formatearCodigoSolicitud = formatearCodigoSolicitud;
  readonly formatearEstadoEvento = formatearEstadoEvento;
  readonly eventoAdmiteModificacion = eventoAdmiteModificacion;

  obtenerSolicitudPendiente(eventoId: number): Solicitud | undefined {
    return this.solicitudes.find(
      (s) => s.evento_id === eventoId && s.estado === ESTADO_PENDIENTE_REVISION
    );
  }
}
