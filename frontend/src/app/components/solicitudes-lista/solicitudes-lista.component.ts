import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Evento, Solicitud } from '../../models/gestor-eventos.models';

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
        <!-- Tabla en escritorio -->
        <div class="tabla-wrap vista-escritorio">
          <table class="tabla-solicitudes">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Evento asociado</th>
                <th scope="col">Datos originales</th>
                <th scope="col">Datos propuestos</th>
                <th scope="col">Motivo</th>
                <th scope="col">Estado</th>
                <th scope="col" class="num-der">Acción</th>
              </tr>
            </thead>
            <tbody>
              @for (sol of solicitudes; track sol.id) {
                <tr>
                  <td>
                    <span class="badge-solicitud-codigo">#{{ sol.id }}</span>
                  </td>
                  <td class="celda-evento">
                    <strong>{{ obtenerNombreEventoSolicitud(sol) }}</strong>
                    <small class="subtexto-evento">Evento ID: {{ sol.evento_id }}</small>
                  </td>
                  <td>
                    <div class="bloque-datos">
                      @if (sol.datos_originales.contacto) {
                        <span><strong>Contacto:</strong> {{ sol.datos_originales.contacto }}</span>
                      }
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
                      @if (sol.datos_propuestos.nombre && sol.datos_propuestos.nombre !== sol.datos_originales.nombre) {
                        <span><strong>Nombre:</strong> {{ sol.datos_propuestos.nombre }}</span>
                      }
                      @if (sol.datos_propuestos.contacto) {
                        <span><strong>Contacto:</strong> {{ sol.datos_propuestos.contacto }}</span>
                      }
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
                    <span class="badge-solicitud-pendiente">{{ sol.estado }}</span>
                  </td>
                  <td class="num-der">
                    <button
                      type="button"
                      class="btn btn-sec btn-chico"
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
                <span class="badge-solicitud-codigo">Solicitud #{{ sol.id }}</span>
                <span class="badge-solicitud-pendiente">{{ sol.estado }}</span>
              </div>

              <h4 class="tarjeta-solicitud-movil__evento">
                {{ obtenerNombreEventoSolicitud(sol) }}
                <small>(Evento ID: {{ sol.evento_id }})</small>
              </h4>

              <div class="tarjeta-solicitud-movil__comparativa">
                <div class="caja-horario">
                  <small class="caja-horario__titulo">Datos originales</small>
                  <span>{{ sol.datos_originales.fecha }}</span>
                  <span class="rango-horario"
                    >{{ sol.datos_originales.hora_inicio }} -
                    {{ sol.datos_originales.hora_fin }}</span
                  >
                </div>
                <div class="caja-horario caja-horario--propuesto">
                  <small class="caja-horario__titulo">Datos propuestos</small>
                  <span>{{ sol.datos_propuestos.fecha }}</span>
                  <span class="rango-horario"
                    >{{ sol.datos_propuestos.hora_inicio }} -
                    {{ sol.datos_propuestos.hora_fin }}</span
                  >
                </div>
              </div>

              <p class="tarjeta-solicitud-movil__motivo">
                <strong>Motivo:</strong> {{ sol.motivo }}
              </p>

              <div class="tarjeta-solicitud-movil__pie">
                <button
                  type="button"
                  class="btn btn-sec btn-chico"
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

      .celda-evento strong {
        display: block;
        color: var(--primario);
      }

      .subtexto-evento {
        display: block;
        font-size: 11.5px;
        color: var(--gris);
      }

      .bloque-datos {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 12.5px;
      }

      .bloque-datos--propuesto {
        color: var(--primario-2);
      }

      .rango-horario {
        white-space: nowrap;
      }

      .celda-motivo {
        max-width: 260px;
        word-break: break-word;
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
      }

      .tarjeta-solicitud-movil__evento small {
        font-weight: normal;
        color: var(--gris);
        font-size: 12px;
      }

      .tarjeta-solicitud-movil__comparativa {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .caja-horario {
        background: var(--fondo);
        padding: 8px 10px;
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 12.5px;
      }

      .caja-horario--propuesto {
        background: #fffdf5;
        border: 1px solid #f6d17b;
      }

      .caja-horario__titulo {
        font-size: 11px;
        font-weight: bold;
        color: var(--primario);
        text-transform: uppercase;
      }

      .tarjeta-solicitud-movil__motivo {
        font-size: 13px;
        word-break: break-word;
        margin: 0;
      }

      .tarjeta-solicitud-movil__pie {
        display: flex;
        justify-content: flex-end;
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

      @media (max-width: 768px) {
        .vista-escritorio {
          display: none;
        }

        .vista-movil {
          display: flex;
        }
      }

      @media (max-width: 480px) {
        .tarjeta-solicitud-movil__comparativa {
          grid-template-columns: 1fr;
        }

        .tarjeta-solicitud-movil__pie .btn {
          width: 100%;
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

  @Output() verDetalle = new EventEmitter<Solicitud>();
  @Output() reintentar = new EventEmitter<void>();

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
