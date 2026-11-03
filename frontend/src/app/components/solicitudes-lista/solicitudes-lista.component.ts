import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Evento, Solicitud } from '../../models/gestor-eventos.models';

@Component({
  selector: 'app-solicitudes-lista',
  standalone: true,
  template: `
    <section class="panel-seccion" aria-labelledby="titulo-solicitudes-registradas">
      <div class="seccion-encabezado">
        <div>
          <h2 id="titulo-solicitudes-registradas" class="seccion-titulo">
            Solicitudes registradas
          </h2>
          <p class="seccion-subtitulo">
            Historial de solicitudes de modificación recibidas durante la ejecución actual del
            servidor.
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
          Actualizar listado
        </button>
      </div>

      @if (cargando) {
        <div class="estado-bloque" role="status" aria-live="polite">
          <span class="indicador-carga" aria-hidden="true"></span>
          <span>Consultando solicitudes registradas...</span>
        </div>
      } @else if (errorCarga) {
        <div class="alerta alerta-error" role="alert">
          <div class="alerta-contenido">
            <strong>Error al consultar las solicitudes</strong>
            <p>{{ errorCarga }}</p>
          </div>
          <button type="button" class="btn-reintentar" (click)="reintentar.emit()">
            Reintentar
          </button>
        </div>
      } @else if (solicitudes.length === 0) {
        <div class="estado-vacio" role="status">
          <svg class="icono-vacio" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V5h14v14zm-2-6H7v-2h10v2z"
              fill="currentColor"
            />
          </svg>
          <p class="texto-vacio">Todavía no hay solicitudes registradas</p>
        </div>
      } @else {
        <!-- Vista de tabla para escritorio -->
        <div class="tabla-contenedor vista-escritorio">
          <table class="tabla-solicitudes">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Evento asociado</th>
                <th scope="col">Datos originales</th>
                <th scope="col">Datos propuestos</th>
                <th scope="col">Motivo</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (sol of solicitudes; track sol.id) {
                <tr>
                  <td class="celda-id">#{{ sol.id }}</td>
                  <td>
                    <strong class="nombre-evento">{{ obtenerNombreEvento(sol.evento_id) }}</strong>
                    <span class="subtexto-evento">Evento ID: {{ sol.evento_id }}</span>
                  </td>
                  <td>
                    <div class="bloque-datos">
                      <span><strong>Fecha:</strong> {{ sol.datos_originales.fecha }}</span>
                      <span>
                        <strong>Horario:</strong>
                        <span class="rango-horario"
                          >{{ sol.datos_originales.hora_inicio }} -
                          {{ sol.datos_originales.hora_fin }}</span
                        >
                      </span>
                    </div>
                  </td>
                  <td>
                    <div class="bloque-datos bloque-datos--propuesto">
                      <span><strong>Fecha:</strong> {{ sol.datos_propuestos.fecha }}</span>
                      <span>
                        <strong>Horario:</strong>
                        <span class="rango-horario"
                          >{{ sol.datos_propuestos.hora_inicio }} -
                          {{ sol.datos_propuestos.hora_fin }}</span
                        >
                      </span>
                    </div>
                  </td>
                  <td class="celda-motivo">{{ sol.motivo }}</td>
                  <td>
                    <span class="insignia-pendiente">{{ sol.estado }}</span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Vista de tarjetas para móvil -->
        <div class="tarjetas-movil vista-movil">
          @for (sol of solicitudes; track sol.id) {
            <article class="tarjeta-solicitud">
              <div class="tarjeta-solicitud__cabecera">
                <span class="celda-id">Solicitud #{{ sol.id }}</span>
                <span class="insignia-pendiente">{{ sol.estado }}</span>
              </div>

              <h3 class="tarjeta-solicitud__evento">
                {{ obtenerNombreEvento(sol.evento_id) }}
                <span class="subtexto-evento">(Evento #{{ sol.evento_id }})</span>
              </h3>

              <div class="tarjeta-solicitud__comparativa">
                <div class="caja-horario">
                  <span class="caja-horario__etiqueta">Datos originales</span>
                  <span>{{ sol.datos_originales.fecha }}</span>
                  <span class="rango-horario"
                    >{{ sol.datos_originales.hora_inicio }} -
                    {{ sol.datos_originales.hora_fin }}</span
                  >
                </div>
                <div class="caja-horario caja-horario--propuesto">
                  <span class="caja-horario__etiqueta">Datos propuestos</span>
                  <span>{{ sol.datos_propuestos.fecha }}</span>
                  <span class="rango-horario"
                    >{{ sol.datos_propuestos.hora_inicio }} -
                    {{ sol.datos_propuestos.hora_fin }}</span
                  >
                </div>
              </div>

              <div class="tarjeta-solicitud__motivo">
                <strong>Motivo:</strong>
                <p>{{ sol.motivo }}</p>
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

      .icono-svg {
        width: 16px;
        height: 16px;
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
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2.2rem 1rem;
        border: 1px dashed var(--st-border);
        border-radius: 8px;
        background: #fafcff;
        color: var(--st-text-muted);
      }

      .icono-vacio {
        width: 32px;
        height: 32px;
        color: var(--st-blue);
        margin-bottom: 0.5rem;
      }

      .texto-vacio {
        margin: 0;
        font-weight: 700;
        color: var(--st-navy);
      }

      .tabla-contenedor {
        overflow-x: auto;
      }

      .tabla-solicitudes {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
      }

      .tabla-solicitudes th {
        background: var(--st-navy);
        color: #ffffff;
        text-align: left;
        padding: 0.75rem 0.9rem;
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .tabla-solicitudes td {
        padding: 0.85rem 0.9rem;
        border-bottom: 1px solid var(--st-border);
        vertical-align: top;
      }

      .celda-id {
        font-weight: 700;
        color: var(--st-navy);
        white-space: nowrap;
      }

      .nombre-evento {
        display: block;
        color: var(--st-navy);
      }

      .subtexto-evento {
        display: block;
        font-size: 0.8rem;
        color: var(--st-text-muted);
      }

      .bloque-datos {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.85rem;
      }

      .bloque-datos--propuesto {
        color: var(--st-blue);
      }

      .rango-horario {
        white-space: nowrap;
      }

      .celda-motivo {
        max-width: 320px;
        word-break: break-word;
      }

      .insignia-pendiente {
        display: inline-block;
        padding: 0.25rem 0.65rem;
        border-radius: 999px;
        background: var(--st-warning-bg);
        border: 1px solid var(--st-gold);
        color: var(--st-warning-text);
        font-size: 0.78rem;
        font-weight: 700;
        white-space: nowrap;
      }

      .vista-movil {
        display: none;
      }

      .tarjetas-movil {
        gap: 1rem;
      }

      .tarjeta-solicitud {
        border: 1px solid var(--st-border);
        border-radius: 8px;
        padding: 1rem;
        background: #ffffff;
      }

      .tarjeta-solicitud__cabecera {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
      }

      .tarjeta-solicitud__evento {
        margin: 0 0 0.75rem;
        font-size: 1rem;
        color: var(--st-navy);
      }

      .tarjeta-solicitud__comparativa {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem;
        margin-bottom: 0.75rem;
      }

      .caja-horario {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        padding: 0.6rem;
        border-radius: 6px;
        background: #f6f8fc;
        font-size: 0.84rem;
      }

      .caja-horario--propuesto {
        background: #fff9eb;
        border: 1px solid #f5d488;
      }

      .caja-horario__etiqueta {
        font-size: 0.74rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--st-navy);
      }

      .tarjeta-solicitud__motivo {
        font-size: 0.88rem;
      }

      .tarjeta-solicitud__motivo p {
        margin: 0.25rem 0 0;
        word-break: break-word;
      }

      @media (max-width: 768px) {
        .vista-escritorio {
          display: none;
        }

        .vista-movil {
          display: grid;
        }
      }
    `,
  ],
})
export class SolicitudesListaComponent {
  @Input() solicitudes: Solicitud[] = [];
  @Input() eventos: Evento[] = [];
  @Input() cargando = false;
  @Input() errorCarga = '';

  @Output() reintentar = new EventEmitter<void>();

  obtenerNombreEvento(eventoId: number): string {
    const encontrado = this.eventos.find((ev) => ev.id === eventoId);
    return encontrado ? encontrado.nombre : `Evento #${eventoId}`;
  }
}

