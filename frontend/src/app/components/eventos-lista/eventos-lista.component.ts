import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Evento } from '../../models/gestor-eventos.models';

@Component({
  selector: 'app-eventos-lista',
  standalone: true,
  template: `
    <section class="panel-seccion" aria-labelledby="titulo-eventos">
      <div class="seccion-encabezado">
        <div>
          <h2 id="titulo-eventos" class="seccion-titulo">Eventos programados</h2>
          <p class="seccion-subtitulo">
            Selecciona un evento para cargar su fecha y horario en el formulario de solicitud.
          </p>
        </div>
        <button
          type="button"
          class="btn-secundario"
          (click)="reintentar.emit()"
          [disabled]="cargando"
        >
          <svg class="icono-svg" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 12a8 8 0 0 1 14.93-4H15v2h6V4h-2v2.35A10 10 0 1 0 22 12h-2a8 8 0 0 1-16 0z"
              fill="currentColor"
            />
          </svg>
          Actualizar
        </button>
      </div>

      @if (cargando) {
        <div class="estado-bloque" role="status" aria-live="polite">
          <span class="indicador-carga" aria-hidden="true"></span>
          <span>Cargando eventos desde el servidor...</span>
        </div>
      } @else if (errorCarga) {
        <div class="alerta alerta-error" role="alert">
          <div class="alerta-contenido">
            <strong>Error al consultar los eventos</strong>
            <p>{{ errorCarga }}</p>
          </div>
          <button type="button" class="btn-reintentar" (click)="reintentar.emit()">
            Reintentar
          </button>
        </div>
      } @else if (eventos.length === 0) {
        <div class="estado-vacio">
          <p>No hay eventos disponibles en este momento.</p>
        </div>
      } @else {
        <div class="eventos-grid">
          @for (evento of eventos; track evento.id) {
            <article
              class="tarjeta-evento"
              [class.tarjeta-evento--activo]="eventoSeleccionadoId === evento.id"
              [class.tarjeta-evento--pendiente]="tieneSolicitudPendiente(evento.id)"
              [attr.data-evento-id]="evento.id"
              (click)="seleccionarEvento.emit(evento)"
            >
              <div class="tarjeta-evento__cabecera">
                <span class="codigo-evento">Evento #{{ evento.id }}</span>
                <div class="insignias-grupo">
                  <span class="insignia insignia-estado">{{ evento.estado }}</span>
                  @if (eventoSeleccionadoId === evento.id) {
                    <span class="insignia insignia-seleccionado">Evento seleccionado</span>
                  }
                </div>
              </div>

              <h3 class="tarjeta-evento__nombre">{{ evento.nombre }}</h3>

              <dl class="tarjeta-evento__detalles">
                <div class="detalle-item">
                  <dt>
                    <svg class="icono-detalle" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"
                        fill="currentColor"
                      />
                    </svg>
                    Espacio
                  </dt>
                  <dd>{{ evento.espacio }}</dd>
                </div>
                <div class="detalle-item">
                  <dt>
                    <svg class="icono-detalle" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"
                        fill="currentColor"
                      />
                    </svg>
                    Fecha original
                  </dt>
                  <dd>{{ evento.fecha }}</dd>
                </div>
                <div class="detalle-item">
                  <dt>
                    <svg class="icono-detalle" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 11h-5V7h2v4h3z"
                        fill="currentColor"
                      />
                    </svg>
                    Horario original
                  </dt>
                  <dd>{{ evento.hora_inicio }} - {{ evento.hora_fin }}</dd>
                </div>
              </dl>

              @if (tieneSolicitudPendiente(evento.id)) {
                <div class="aviso-pendiente" role="status">
                  <svg class="icono-detalle" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-2h2zm0-4h-2V7h2z"
                      fill="currentColor"
                    />
                  </svg>
                  <span>Solicitud pendiente de revisión registrada para este evento.</span>
                </div>
              }

              <div class="tarjeta-evento__acciones">
                <button
                  type="button"
                  class="btn-primario btn-solicitar"
                  [disabled]="tieneSolicitudPendiente(evento.id)"
                  (click)="seleccionarEvento.emit(evento)"
                >
                  @if (tieneSolicitudPendiente(evento.id)) {
                    Solicitud pendiente de revisión
                  } @else if (eventoSeleccionadoId === evento.id) {
                    Solicitar modificación (Seleccionado)
                  } @else {
                    Solicitar modificación
                  }
                </button>
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .panel-seccion {
        background: var(--st-surface);
        border: 1px solid var(--st-border);
        border-radius: 10px;
        padding: 1.5rem;
        box-shadow: 0 2px 8px rgba(19, 38, 74, 0.05);
      }

      .seccion-encabezado {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        margin-bottom: 1.25rem;
        flex-wrap: wrap;
      }

      .seccion-titulo {
        margin: 0;
        font-size: 1.25rem;
        color: var(--st-navy);
      }

      .seccion-subtitulo {
        margin: 0.25rem 0 0;
        font-size: 0.92rem;
        color: var(--st-text-muted);
      }

      .eventos-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.15rem;
      }

      .tarjeta-evento {
        border: 1px solid var(--st-border);
        border-radius: 8px;
        padding: 1.25rem;
        background: #ffffff;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }

      .tarjeta-evento--activo {
        border: 2px solid var(--st-blue);
        box-shadow: 0 0 0 3px rgba(31, 78, 156, 0.12);
      }

      .tarjeta-evento--pendiente {
        background: #fafbfd;
      }

      .tarjeta-evento__cabecera {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.65rem;
        flex-wrap: wrap;
      }

      .codigo-evento {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--st-navy);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .insignias-grupo {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
      }

      .insignia {
        display: inline-block;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        font-size: 0.76rem;
        font-weight: 700;
      }

      .insignia-estado {
        background: #eef3fb;
        color: var(--st-blue);
      }

      .insignia-seleccionado {
        background: var(--st-gold);
        color: var(--st-navy);
      }

      .tarjeta-evento__nombre {
        margin: 0 0 0.9rem;
        font-size: 1.08rem;
        color: var(--st-navy);
      }

      .tarjeta-evento__detalles {
        margin: 0 0 1rem;
        display: grid;
        gap: 0.55rem;
      }

      .detalle-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
        border-bottom: 1px dashed #e7ecf5;
        padding-bottom: 0.35rem;
      }

      .detalle-item dt {
        color: var(--st-text-muted);
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }

      .detalle-item dd {
        margin: 0;
        font-weight: 700;
        color: var(--st-text);
      }

      .icono-detalle,
      .icono-svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      .aviso-pendiente {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 0.75rem;
        border-radius: 6px;
        background: var(--st-warning-bg);
        border-left: 4px solid var(--st-gold);
        color: var(--st-warning-text);
        font-size: 0.85rem;
        font-weight: 600;
        margin-bottom: 0.9rem;
      }

      .tarjeta-evento__acciones {
        margin-top: auto;
      }

      .btn-primario {
        width: 100%;
        padding: 0.65rem 1rem;
        border: none;
        border-radius: 6px;
        background: var(--st-blue);
        color: #ffffff;
        font-weight: 700;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }

      .btn-primario:hover:not(:disabled) {
        background: var(--st-navy);
      }

      .btn-primario:disabled {
        background: #c8d2e3;
        color: #54627a;
        cursor: not-allowed;
      }

      .btn-secundario,
      .btn-reintentar {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.48rem 0.85rem;
        border-radius: 6px;
        border: 1px solid var(--st-blue);
        background: #ffffff;
        color: var(--st-blue);
        font-weight: 700;
        font-size: 0.86rem;
        cursor: pointer;
      }

      .btn-secundario:hover:not(:disabled),
      .btn-reintentar:hover:not(:disabled) {
        background: #f0f5fc;
      }

      .btn-secundario:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .estado-bloque {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1.2rem;
        background: #f8faff;
        border-radius: 8px;
        color: var(--st-navy);
        font-weight: 600;
      }

      .indicador-carga {
        width: 18px;
        height: 18px;
        border: 3px solid #d0dcf0;
        border-top-color: var(--st-blue);
        border-radius: 50%;
        animation: girar 0.8s linear infinite;
      }

      @keyframes girar {
        to {
          transform: rotate(360deg);
        }
      }

      .alerta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        border-radius: 8px;
        flex-wrap: wrap;
      }

      .alerta-error {
        background: var(--st-danger-bg);
        border: 1px solid #fecdca;
        color: var(--st-danger);
      }

      .alerta-contenido p {
        margin: 0.25rem 0 0;
        font-size: 0.9rem;
      }

      .estado-vacio {
        padding: 1.5rem;
        text-align: center;
        color: var(--st-text-muted);
      }
    `,
  ],
})
export class EventosListaComponent {
  @Input() eventos: Evento[] = [];
  @Input() eventoSeleccionadoId: number | null = null;
  @Input() eventosConPendienteIds: ReadonlySet<number> = new Set<number>();
  @Input() cargando = false;
  @Input() errorCarga = '';

  @Output() seleccionarEvento = new EventEmitter<Evento>();
  @Output() reintentar = new EventEmitter<void>();

  tieneSolicitudPendiente(eventoId: number): boolean {
    return this.eventosConPendienteIds.has(eventoId);
  }
}

