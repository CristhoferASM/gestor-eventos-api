import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Evento, SolicitudCreacionPayload } from '../../models/gestor-eventos.models';
import {
  contarRunasMotivo,
  fechaFormatoValidoValidator,
  horaFormatoYRangoValidator,
  motivoUnicodeValidator,
  solicitudGrupoValidator,
} from '../../validators/solicitud.validators';

@Component({
  selector: 'app-solicitud-formulario',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="panel-seccion" aria-labelledby="titulo-formulario">
      <div class="seccion-encabezado">
        <div>
          <h2 id="titulo-formulario" class="seccion-titulo">Registrar solicitud de modificación</h2>
          <p class="seccion-subtitulo">
            Propón un nuevo horario entre las 06:00 y las 22:00 e indica el motivo del cambio.
          </p>
        </div>
      </div>

      @if (mensajeExito) {
        <div class="alerta alerta-exito" role="status" aria-live="polite">
          <svg class="icono-alerta" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-1.2 14.2L6.6 12l1.4-1.4 2.8 2.8 5.6-5.6 1.4 1.4z"
              fill="currentColor"
            />
          </svg>
          <div>
            <strong>Solicitud registrada</strong>
            <p>{{ mensajeExito }}</p>
          </div>
        </div>
      }

      @if (avisoRefrescoPosterior) {
        <div class="alerta alerta-aviso" role="alert">
          <div class="alerta-contenido">
            <strong>La solicitud se registró correctamente, pero no se pudo actualizar el listado</strong>
            <p>{{ avisoRefrescoPosterior }}</p>
          </div>
          <button type="button" class="btn-reintentar" (click)="recargarSolicitudes.emit()">
            Recargar listado
          </button>
        </div>
      }

      @if (errorEnvio) {
        <div class="alerta alerta-error" role="alert">
          <svg class="icono-alerta" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-2h2zm0-4h-2V7h2z"
              fill="currentColor"
            />
          </svg>
          <div>
            <strong>No se pudo registrar la solicitud</strong>
            <p>{{ errorEnvio }}</p>
          </div>
        </div>
      }

      @if (!eventoActual) {
        <div class="estado-seleccion">
          <svg class="icono-seleccion" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10z"
              fill="currentColor"
            />
          </svg>
          <p>
            Selecciona el botón <strong>“Solicitar modificación”</strong> en alguno de los eventos
            para cargar sus datos actuales en este formulario.
          </p>
        </div>
      } @else {
        <div class="resumen-evento-activo">
          <div class="resumen-evento-activo__encabezado">
            <span class="etiqueta-activo">Evento seleccionado #{{ eventoActual.id }}</span>
            <span class="espacio-activo">{{ eventoActual.espacio }}</span>
          </div>
          <h3 class="nombre-activo">{{ eventoActual.nombre }}</h3>

          <div class="comparativa-horarios">
            <div class="bloque-horario bloque-horario--original">
              <span class="bloque-horario__titulo">Horario original (actual)</span>
              <p class="bloque-horario__valor">
                <strong>Fecha:</strong> {{ eventoActual.fecha }}
              </p>
              <p class="bloque-horario__valor">
                <strong>Horario:</strong> {{ eventoActual.hora_inicio }} - {{ eventoActual.hora_fin }}
              </p>
            </div>

            <div class="bloque-horario bloque-horario--propuesto">
              <span class="bloque-horario__titulo">Horario propuesto</span>
              <p class="bloque-horario__valor">
                <strong>Fecha:</strong>
                {{ formulario.get('fecha_propuesta')?.value || 'Sin definir' }}
              </p>
              <p class="bloque-horario__valor">
                <strong>Horario:</strong>
                {{ formulario.get('hora_inicio_propuesta')?.value || '--:--' }} -
                {{ formulario.get('hora_fin_propuesta')?.value || '--:--' }}
              </p>
            </div>
          </div>

          <div class="mensaje-reserva" role="note">
            <svg class="icono-nota" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-6h2zm0-8h-2V7h2z"
                fill="currentColor"
              />
            </svg>
            <span>
              @if (tienePendiente) {
                La solicitud está pendiente de revisión. Tu reserva actual se mantiene sin cambios
              } @else {
                La solicitud quedará pendiente de revisión. Tu reserva actual se mantendrá sin cambios
              }
            </span>
          </div>
        </div>

        @if (tienePendiente) {
          <div class="alerta alerta-aviso" role="status">
            <div class="alerta-contenido">
              <strong>Este evento ya tiene una solicitud pendiente de revisión</strong>
              <p>
                No es posible enviar una nueva solicitud para este evento mientras exista una
                pendiente.
              </p>
            </div>
          </div>
        }

        <form [formGroup]="formulario" (ngSubmit)="onSubmit()" novalidate class="formulario-grid">
          <div class="campo-grupo">
            <label for="fecha_propuesta">Fecha propuesta *</label>
            <input
              id="fecha_propuesta"
              type="date"
              formControlName="fecha_propuesta"
              [attr.disabled]="tienePendiente || enviando ? true : null"
            />
            @if (mostrarErrorControl('fecha_propuesta')) {
              <div class="mensaje-error">
                @if (formulario.get('fecha_propuesta')?.hasError('required')) {
                  <span>La fecha propuesta es obligatoria.</span>
                } @else if (formulario.get('fecha_propuesta')?.hasError('formatoFecha')) {
                  <span>La fecha debe tener el formato válido YYYY-MM-DD.</span>
                }
              </div>
            }
          </div>

          <div class="campos-fila">
            <div class="campo-grupo">
              <label for="hora_inicio_propuesta">Hora de inicio propuesta (HH:mm) *</label>
              <input
                id="hora_inicio_propuesta"
                type="time"
                min="06:00"
                max="22:00"
                step="60"
                placeholder="09:00"
                formControlName="hora_inicio_propuesta"
                [attr.disabled]="tienePendiente || enviando ? true : null"
              />
              @if (mostrarErrorControl('hora_inicio_propuesta')) {
                <div class="mensaje-error">
                  @if (formulario.get('hora_inicio_propuesta')?.hasError('required')) {
                    <span>La hora de inicio es obligatoria.</span>
                  } @else if (formulario.get('hora_inicio_propuesta')?.hasError('formatoHora')) {
                    <span>Usa el formato estricto HH:mm (ejemplo: 09:00).</span>
                  } @else if (formulario.get('hora_inicio_propuesta')?.hasError('rangoHorario')) {
                    <span>La hora de inicio debe estar entre las 06:00 y las 22:00.</span>
                  }
                </div>
              }
            </div>

            <div class="campo-grupo">
              <label for="hora_fin_propuesta">Hora de fin propuesta (HH:mm) *</label>
              <input
                id="hora_fin_propuesta"
                type="time"
                min="06:00"
                max="22:00"
                step="60"
                placeholder="13:00"
                formControlName="hora_fin_propuesta"
                [attr.disabled]="tienePendiente || enviando ? true : null"
              />
              @if (mostrarErrorControl('hora_fin_propuesta')) {
                <div class="mensaje-error">
                  @if (formulario.get('hora_fin_propuesta')?.hasError('required')) {
                    <span>La hora de fin es obligatoria.</span>
                  } @else if (formulario.get('hora_fin_propuesta')?.hasError('formatoHora')) {
                    <span>Usa el formato estricto HH:mm (ejemplo: 14:00).</span>
                  } @else if (formulario.get('hora_fin_propuesta')?.hasError('rangoHorario')) {
                    <span>La hora de fin debe estar entre las 06:00 y las 22:00.</span>
                  }
                </div>
              }
            </div>
          </div>

          @if (mostrarErroresGrupo() && formulario.hasError('inicioPosteriorOIgualAFin')) {
            <div class="mensaje-error mensaje-error--bloque" role="alert">
              La hora de inicio propuesta debe ser anterior a la hora de fin.
            </div>
          }

          @if (mostrarErroresGrupo() && formulario.hasError('sinCambiosRespectoAlOriginal')) {
            <div class="mensaje-error mensaje-error--bloque" role="alert">
              Debes proponer al menos un cambio en la fecha o en el horario respecto al evento
              original.
            </div>
          }

          <div class="campo-grupo">
            <div class="etiqueta-con-contador">
              <label for="motivo">Motivo de la solicitud *</label>
              <span
                class="contador-caracteres"
                [class.contador-caracteres--excedido]="longitudMotivoUnicode > 400"
              >
                {{ longitudMotivoUnicode }} / 400 caracteres
              </span>
            </div>
            <textarea
              id="motivo"
              rows="4"
              placeholder="Describe el motivo técnico u operativo del cambio solicitado..."
              formControlName="motivo"
              [attr.disabled]="tienePendiente || enviando ? true : null"
            ></textarea>
            @if (mostrarErrorControl('motivo')) {
              <div class="mensaje-error">
                @if (
                  formulario.get('motivo')?.hasError('required') ||
                  formulario.get('motivo')?.hasError('motivoVacio')
                ) {
                  <span>El motivo es obligatorio y no puede contener solo espacios.</span>
                } @else if (formulario.get('motivo')?.hasError('maximoUnicode')) {
                  <span>El motivo no puede superar los 400 caracteres.</span>
                }
              </div>
            }
          </div>

          <div class="acciones-formulario">
            <button
              type="submit"
              class="btn-enviar"
              [disabled]="enviando || tienePendiente"
            >
              @if (enviando) {
                Enviando solicitud...
              } @else {
                Enviar solicitud
              }
            </button>
          </div>
        </form>
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
        margin-bottom: 1.15rem;
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

      .estado-seleccion {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        padding: 1.35rem;
        border: 1px dashed var(--st-border);
        border-radius: 8px;
        background: #f9fbff;
        color: var(--st-text-muted);
      }

      .icono-seleccion {
        width: 28px;
        height: 28px;
        color: var(--st-blue);
        flex-shrink: 0;
      }

      .resumen-evento-activo {
        background: #f6f9ff;
        border: 1px solid #d4e1f7;
        border-left: 5px solid var(--st-blue);
        border-radius: 8px;
        padding: 1.1rem;
        margin-bottom: 1.25rem;
      }

      .resumen-evento-activo__encabezado {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin-bottom: 0.35rem;
      }

      .etiqueta-activo {
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--st-blue);
        letter-spacing: 0.04em;
      }

      .espacio-activo {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--st-text-muted);
      }

      .nombre-activo {
        margin: 0 0 0.85rem;
        font-size: 1.1rem;
        color: var(--st-navy);
      }

      .comparativa-horarios {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 0.85rem;
        margin-bottom: 0.9rem;
      }

      .bloque-horario {
        padding: 0.75rem 0.9rem;
        border-radius: 6px;
        background: #ffffff;
        border: 1px solid var(--st-border);
      }

      .bloque-horario--propuesto {
        border-color: var(--st-gold);
        background: #fffdf7;
      }

      .bloque-horario__titulo {
        display: block;
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--st-navy);
        margin-bottom: 0.35rem;
      }

      .bloque-horario__valor {
        margin: 0.2rem 0;
        font-size: 0.9rem;
      }

      .mensaje-reserva {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.65rem 0.8rem;
        border-radius: 6px;
        background: #eef3fb;
        color: var(--st-navy);
        font-size: 0.88rem;
        font-weight: 600;
      }

      .icono-nota,
      .icono-alerta {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }

      .formulario-grid {
        display: grid;
        gap: 1rem;
      }

      .campos-fila {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 1rem;
      }

      .campo-grupo {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }

      label {
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--st-navy);
      }

      input,
      textarea {
        padding: 0.6rem 0.75rem;
        border: 1px solid #c5d1e6;
        border-radius: 6px;
        background: #ffffff;
        color: var(--st-text);
        transition: border-color 0.15s ease;
      }

      input:focus,
      textarea:focus {
        outline: none;
        border-color: var(--st-blue);
        box-shadow: 0 0 0 3px rgba(31, 78, 156, 0.14);
      }

      input:disabled,
      textarea:disabled {
        background: #f1f4f9;
        cursor: not-allowed;
      }

      .etiqueta-con-contador {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
      }

      .contador-caracteres {
        font-size: 0.8rem;
        color: var(--st-text-muted);
        font-weight: 600;
      }

      .contador-caracteres--excedido {
        color: var(--st-danger);
        font-weight: 700;
      }

      .mensaje-error {
        font-size: 0.83rem;
        color: var(--st-danger);
        font-weight: 600;
      }

      .mensaje-error--bloque {
        padding: 0.6rem 0.75rem;
        background: var(--st-danger-bg);
        border: 1px solid #fecdca;
        border-radius: 6px;
      }

      .acciones-formulario {
        margin-top: 0.35rem;
      }

      .btn-enviar {
        width: 100%;
        padding: 0.75rem 1.2rem;
        border: none;
        border-radius: 6px;
        background: var(--st-navy);
        border-bottom: 3px solid var(--st-gold);
        color: #ffffff;
        font-weight: 700;
        font-size: 0.96rem;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }

      .btn-enviar:hover:not(:disabled) {
        background: var(--st-blue);
      }

      .btn-enviar:disabled {
        background: #c8d2e3;
        border-bottom-color: #aebbd1;
        color: #54627a;
        cursor: not-allowed;
      }

      .alerta {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.9rem 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
      }

      .alerta p {
        margin: 0.2rem 0 0;
        font-size: 0.88rem;
      }

      .alerta-exito {
        background: var(--st-success-bg);
        border: 1px solid #abefc6;
        color: var(--st-success);
        justify-content: flex-start;
      }

      .alerta-error {
        background: var(--st-danger-bg);
        border: 1px solid #fecdca;
        color: var(--st-danger);
        justify-content: flex-start;
      }

      .alerta-aviso {
        background: var(--st-warning-bg);
        border: 1px solid #f7d994;
        color: var(--st-warning-text);
        flex-wrap: wrap;
      }

      .btn-reintentar {
        padding: 0.45rem 0.8rem;
        border-radius: 6px;
        border: 1px solid var(--st-warning-text);
        background: #ffffff;
        color: var(--st-warning-text);
        font-weight: 700;
        font-size: 0.84rem;
        cursor: pointer;
      }
    `,
  ],
})
export class SolicitudFormularioComponent {
  private readonly fb = inject(FormBuilder);

  eventoActual: Evento | null = null;
  intentoEnvio = false;

  @Input()
  set eventoSeleccionado(evento: Evento | null) {
    const cambioDeEvento = this.eventoActual?.id !== evento?.id;
    this.eventoActual = evento;

    if (evento && cambioDeEvento) {
      this.intentoEnvio = false;
      this.formulario.reset({
        fecha_propuesta: evento.fecha,
        hora_inicio_propuesta: evento.hora_inicio,
        hora_fin_propuesta: evento.hora_fin,
        motivo: '',
      });
    } else if (!evento) {
      this.intentoEnvio = false;
      this.formulario.reset({
        fecha_propuesta: '',
        hora_inicio_propuesta: '',
        hora_fin_propuesta: '',
        motivo: '',
      });
    } else {
      this.formulario.updateValueAndValidity();
    }
  }

  get eventoSeleccionado(): Evento | null {
    return this.eventoActual;
  }

  @Input() tienePendiente = false;
  @Input() enviando = false;
  @Input() mensajeExito = '';
  @Input() avisoRefrescoPosterior = '';
  @Input() errorEnvio = '';

  @Output() enviarSolicitud = new EventEmitter<SolicitudCreacionPayload>();
  @Output() recargarSolicitudes = new EventEmitter<void>();

  readonly formulario = this.fb.group(
    {
      fecha_propuesta: ['', [Validators.required, fechaFormatoValidoValidator()]],
      hora_inicio_propuesta: ['', [Validators.required, horaFormatoYRangoValidator()]],
      hora_fin_propuesta: ['', [Validators.required, horaFormatoYRangoValidator()]],
      motivo: ['', [Validators.required, motivoUnicodeValidator(400)]],
    },
    {
      validators: [solicitudGrupoValidator(() => this.eventoActual)],
    }
  );

  get longitudMotivoUnicode(): number {
    return contarRunasMotivo(this.formulario.get('motivo')?.value);
  }

  mostrarErrorControl(nombre: string): boolean {
    const control = this.formulario.get(nombre);
    if (!control) {
      return false;
    }
    return control.invalid && (control.touched || control.dirty || this.intentoEnvio);
  }

  mostrarErroresGrupo(): boolean {
    return (
      this.intentoEnvio ||
      Boolean(this.formulario.get('fecha_propuesta')?.dirty) ||
      Boolean(this.formulario.get('hora_inicio_propuesta')?.dirty) ||
      Boolean(this.formulario.get('hora_fin_propuesta')?.dirty)
    );
  }

  onSubmit(): void {
    if (!this.eventoActual || this.enviando || this.tienePendiente) {
      return;
    }

    this.intentoEnvio = true;
    this.formulario.updateValueAndValidity();

    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const valores = this.formulario.getRawValue();
    this.enviarSolicitud.emit({
      evento_id: this.eventoActual.id,
      motivo: (valores.motivo ?? '').trim(),
      fecha_propuesta: (valores.fecha_propuesta ?? '').trim(),
      hora_inicio_propuesta: (valores.hora_inicio_propuesta ?? '').trim(),
      hora_fin_propuesta: (valores.hora_fin_propuesta ?? '').trim(),
    });
  }
}

