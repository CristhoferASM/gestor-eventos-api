import { Component, DestroyRef, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import {
  AdicionalCatalogo,
  AdicionalItem,
  ConsultaDisponibilidadPayload,
  EstadoDisponibilidad,
  Evento,
  SolicitudCreacionPayload,
  TiemposTecnicosPropuestos,
  formatSoles,
  formatearEstadoEvento,
  sonAdicionalesIguales,
} from '../../models/gestor-eventos.models';
import {
  contarRunasUnicode,
  correoOpcionalValidator,
  fechaFormatoValidoValidator,
  horaFormatoYRangoValidator,
  motivoUnicodeValidator,
  solicitudGrupoValidator,
  textoObligatorioUnicodeValidator,
  textoOpcionalUnicodeValidator,
} from '../../validators/solicitud.validators';
import { SelectorFechaHoraDirective } from '../../directives/selector-fecha-hora.directive';

@Component({
  selector: 'app-solicitud-formulario',
  standalone: true,
  imports: [SelectorFechaHoraDirective, ReactiveFormsModule],
  template: `
    <section class="tarjeta paso-formulario" id="cs2" aria-labelledby="titulo-paso-2">
      <div class="tarjeta-cabecera-flex">
        <h2 id="titulo-paso-2" tabindex="-1">2. Proponer cambios para el evento</h2>
        @if (eventoActual) {
          <div class="etiqueta et-evento-activo" id="badgeEventoClientePaso2">
            ID: {{ eventoActual.id }} &bull; {{ formatearEstadoEvento(eventoActual.estado) }}
          </div>
        }
      </div>

      @if (!eventoActual) {
        <div class="aviso aviso-info">
          Seleccione un evento en el Paso 1 para proponer modificaciones de información general,
          contacto, fecha u horario.
        </div>
      } @else {
        @if (tienePendiente) {
          <div class="aviso aviso-alerta" role="status">
            <strong>Este evento ya tiene una solicitud pendiente de revisión.</strong>
            No es posible enviar una nueva solicitud mientras exista una en trámite.
          </div>
        }

        <form [formGroup]="formulario" (ngSubmit)="onSubmit()" novalidate>
          <!-- Bloque 1: Información General y Contacto -->
          <h3>Información general y contacto</h3>
          <div class="form">
            <div>
              <label for="eventCode">Código del evento</label>
              <input
                id="eventCode"
                type="text"
                readonly
                class="input-readonly"
                [value]="eventoActual.id"
              />
              <span class="ayuda">Identificador de su reserva (solo lectura).</span>
            </div>

            <div>
              <label for="eventSpace">Auditorio asignado</label>
              <input
                id="eventSpace"
                type="text"
                readonly
                class="input-readonly"
                [value]="eventoActual.espacio"
              />
              <span class="ayuda">Espacio contratado (solo lectura).</span>
            </div>

            <div class="completo">
              <label for="eventName">
                Nombre de la convocatoria o evento <span class="req">*</span>
                @if (nombreModificado) {
                  <span class="mod-pill visible" id="modBadgeEventName">Modificado</span>
                }
              </label>
              <input
                id="eventName"
                type="text"
                required
                maxlength="120"
                placeholder="Ej. Ceremonia de graduación"
                formControlName="nombre_propuesto"
                [class.campo-modificado]="nombreModificado"
                [class.input-error]="mostrarErrorControl('nombre_propuesto')"
                [attr.disabled]="tienePendiente || enviando ? true : null"
              />
              @if (mostrarErrorControl('nombre_propuesto')) {
                <span class="msg-error-campo" id="errEventName" role="alert">
                  @if (
                    formulario.get('nombre_propuesto')?.hasError('required') ||
                    formulario.get('nombre_propuesto')?.hasError('nombreVacio')
                  ) {
                    El nombre del evento es obligatorio.
                  } @else if (formulario.get('nombre_propuesto')?.hasError('maximoUnicode')) {
                    El nombre del evento no puede superar los 120 caracteres.
                  }
                </span>
              }
            </div>

            <div>
              <label for="eventContact">
                Persona de contacto <span class="req">*</span>
                @if (contactoModificado) {
                  <span class="mod-pill visible" id="modBadgeEventContact">Modificado</span>
                }
              </label>
              <input
                id="eventContact"
                type="text"
                required
                maxlength="80"
                placeholder="Nombre de la persona responsable"
                formControlName="contacto_propuesto"
                [class.campo-modificado]="contactoModificado"
                [class.input-error]="mostrarErrorControl('contacto_propuesto')"
                [attr.disabled]="tienePendiente || enviando ? true : null"
              />
              @if (mostrarErrorControl('contacto_propuesto')) {
                <span class="msg-error-campo" id="errEventContact" role="alert">
                  @if (
                    formulario.get('contacto_propuesto')?.hasError('required') ||
                    formulario.get('contacto_propuesto')?.hasError('contactoVacio')
                  ) {
                    La persona de contacto es obligatoria.
                  } @else if (formulario.get('contacto_propuesto')?.hasError('maximoUnicode')) {
                    La persona de contacto no puede superar los 80 caracteres.
                  }
                </span>
              }
            </div>

            <div>
              <label for="eventPhone">
                Teléfono de contacto
                @if (telefonoModificado) {
                  <span class="mod-pill visible" id="modBadgeEventPhone">Modificado</span>
                }
              </label>
              <input
                id="eventPhone"
                type="tel"
                maxlength="25"
                placeholder="Ej. 998 765 432"
                formControlName="telefono_propuesto"
                [class.campo-modificado]="telefonoModificado"
                [class.input-error]="mostrarErrorControl('telefono_propuesto')"
                [attr.disabled]="tienePendiente || enviando ? true : null"
              />
              @if (mostrarErrorControl('telefono_propuesto')) {
                <span class="msg-error-campo" id="errEventPhone" role="alert">
                  @if (formulario.get('telefono_propuesto')?.hasError('maximoUnicode')) {
                    El teléfono no puede superar los 25 caracteres.
                  }
                </span>
              }
            </div>

            <div class="completo">
              <label for="eventEmail">
                Correo electrónico
                @if (correoModificado) {
                  <span class="mod-pill visible" id="modBadgeEventEmail">Modificado</span>
                }
              </label>
              <input
                id="eventEmail"
                type="email"
                maxlength="80"
                placeholder="Ej. contacto@cliente.edu.pe"
                formControlName="correo_propuesto"
                [class.campo-modificado]="correoModificado"
                [class.input-error]="mostrarErrorControl('correo_propuesto')"
                [attr.disabled]="tienePendiente || enviando ? true : null"
              />
              @if (mostrarErrorControl('correo_propuesto')) {
                <span class="msg-error-campo" id="errEventEmail" role="alert">
                  @if (formulario.get('correo_propuesto')?.hasError('maximoUnicode')) {
                    El correo electrónico no puede superar los 80 caracteres.
                  } @else if (formulario.get('correo_propuesto')?.hasError('formatoCorreo')) {
                    Ingrese un correo electrónico con formato válido (ej. nombre@dominio.pe).
                  }
                </span>
              }
            </div>

            <div class="completo">
              <label for="eventNotes">
                Observaciones y requerimientos técnicos <span class="opc">(opcional)</span>
                @if (observacionesModificadas) {
                  <span class="mod-pill visible" id="modBadgeEventNotes">Modificado</span>
                }
              </label>
              <textarea
                id="eventNotes"
                rows="2"
                maxlength="300"
                placeholder="Requerimientos de audio, micrófonos, pantalla LED, distribución, etc."
                formControlName="observaciones_propuestas"
                [class.campo-modificado]="observacionesModificadas"
                [class.input-error]="mostrarErrorControl('observaciones_propuestas')"
                [attr.disabled]="tienePendiente || enviando ? true : null"
              ></textarea>
              @if (mostrarErrorControl('observaciones_propuestas')) {
                <span class="msg-error-campo" id="errEventNotes" role="alert">
                  @if (formulario.get('observaciones_propuestas')?.hasError('maximoUnicode')) {
                    Las observaciones y requerimientos no pueden superar los 300 caracteres.
                  }
                </span>
              }
            </div>
          </div>

          <!-- Bloque 2: Fecha y Horario del Evento -->
          <div class="bloque-fecha-evento">
            <h3 class="titulo-fecha-evento">Fecha y horario del evento</h3>
            <div class="insignia-evento-wrap">
              <span class="badge-tecnico badge-evento">Evento principal</span>
            </div>
            <div class="form form-evento-principal">
              <div>
                <label for="eventDate">
                  Fecha del evento <span class="req">*</span>
                  @if (fechaModificada) {
                    <span class="mod-pill visible" id="modBadgeEventDate">Modificado</span>
                  }
                </label>
                <div class="campo-fecha-wrap" id="wrap_eventDate">
                  <input
                    id="eventDate"
                    type="text"
 appSelector="fecha"
 placeholder="dd/mm/aaaa"
                    required
                    formControlName="fecha_propuesta"
                    class="input-fecha"
                    [class.campo-modificado]="fechaModificada"
                    [class.input-error]="mostrarErrorControl('fecha_propuesta')"
                    [attr.disabled]="tienePendiente || enviando ? true : null"
                  />
                  <span class="icono-calendario" aria-hidden="true">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                  </span>
                </div>
                @if (mostrarErrorControl('fecha_propuesta')) {
                  <span class="msg-error-campo" id="errEventDate" role="alert">
                    @if (formulario.get('fecha_propuesta')?.hasError('required')) {
                      La fecha propuesta es obligatoria.
                    } @else if (formulario.get('fecha_propuesta')?.hasError('formatoFecha')) {
                      Ingrese una fecha válida.
                    }
                  </span>
                }
              </div>

              <div>
                <label for="eventStartTime">
                  Hora de inicio del evento <span class="req">*</span>
                  @if (horaInicioModificada) {
                    <span class="mod-pill visible" id="modBadgeEventStartTime">Modificado</span>
                  }
                </label>
                <div class="campo-hora-wrap" id="wrap_eventStartTime">
                  <input
                    id="eventStartTime"
                    type="text"
 appSelector="hora"
                    placeholder="09:00"
                    required
                    formControlName="hora_inicio_propuesta"
                    class="input-hora"
                    [class.campo-modificado]="horaInicioModificada"
                    [class.input-error]="mostrarErrorControl('hora_inicio_propuesta')"
                    [attr.disabled]="tienePendiente || enviando ? true : null"
                  />
                  <span class="icono-reloj" aria-hidden="true">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </span>
                </div>
                @if (mostrarErrorControl('hora_inicio_propuesta')) {
                  <span class="msg-error-campo" id="errEventStartTime" role="alert">
                    @if (formulario.get('hora_inicio_propuesta')?.hasError('required')) {
                      La hora de inicio es obligatoria.
                    } @else if (formulario.get('hora_inicio_propuesta')?.hasError('formatoHora')) {
                      Use el formato HH:mm (ej. 09:00).
                    } @else if (formulario.get('hora_inicio_propuesta')?.hasError('rangoHorario')) {
                      El horario debe estar entre las 06:00 y las 22:00.
                    }
                  </span>
                }
              </div>

              <div>
                <label for="eventEndTime">
                  Hora de fin del evento <span class="req">*</span>
                  @if (horaFinModificada) {
                    <span class="mod-pill visible" id="modBadgeEventEndTime">Modificado</span>
                  }
                </label>
                <div class="campo-hora-wrap" id="wrap_eventEndTime">
                  <input
                    id="eventEndTime"
                    type="text"
 appSelector="hora"
                    placeholder="13:00"
                    required
                    formControlName="hora_fin_propuesta"
                    class="input-hora"
                    [class.campo-modificado]="horaFinModificada"
                    [class.input-error]="mostrarErrorControl('hora_fin_propuesta')"
                    [attr.disabled]="tienePendiente || enviando ? true : null"
                  />
                  <span class="icono-reloj" aria-hidden="true">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </span>
                </div>
                @if (mostrarErrorControl('hora_fin_propuesta')) {
                  <span class="msg-error-campo" id="errEventEndTime" role="alert">
                    @if (formulario.get('hora_fin_propuesta')?.hasError('required')) {
                      La hora de fin es obligatoria.
                    } @else if (formulario.get('hora_fin_propuesta')?.hasError('formatoHora')) {
                      Use el formato HH:mm (ej. 13:00).
                    } @else if (formulario.get('hora_fin_propuesta')?.hasError('rangoHorario')) {
                      El horario debe estar entre las 06:00 y las 22:00.
                    }
                  </span>
                }
              </div>
            </div>
            <p class="ayuda" style="margin-top: 6px;">
              * Horario regular de funcionamiento del auditorio: 06:00 a 22:00. Evento, montaje y
              desmontaje deben ocurrir el mismo día.
            </p>
            @if (avisoDisponibilidad; as aviso) {
              @if (aviso.disponible) {
                <div class="aviso aviso-ok aviso-disponibilidad" id="avisoDisponibilidad" role="status">
                  <strong>Horario disponible.</strong> El auditorio está libre en la fecha y el horario propuestos.
                </div>
              } @else {
                <div class="aviso aviso-alerta aviso-disponibilidad" id="avisoDisponibilidad" role="status">
                  <strong>Horario no disponible.</strong> {{ aviso.mensaje }}
                </div>
              }
            }
          </div>

          <!-- Bloque 3: Tiempos Técnicos Adicionales -->
          <h3 class="titulo-fecha-evento" style="margin-top: 18px;">Tiempos técnicos adicionales</h3>

          <div class="contenedor-tiempos-tecnicos grid-adicionales">
            <!-- Montaje Independiente -->
            <div class="caja-adicional caja-montaje" [class.desactivada]="!formulario.get('has_montaje')?.value" id="panelMontaje">
              <div class="caja-adicional-cabecera">
                <label class="check-label" for="chkMontaje">
                  <input
                    type="checkbox"
                    id="chkMontaje"
                    formControlName="has_montaje"
                    (change)="alCambiarMontaje()"
                    [attr.disabled]="tienePendiente || enviando ? true : null"
                  />
                  <span>Requiere montaje previo</span>
                </label>
                <span class="badge-tecnico badge-montaje">Montaje técnico</span>
              </div>
              <div class="campos-adicional" [class.oculto]="!formulario.get('has_montaje')?.value" id="fieldsMontaje">
                <div class="form-tecnico">
                  <div class="campo-tecnico-fecha">
                    <label for="montajeDate">
                      Fecha&nbsp;<span class="req">*</span>
                      @if (montajeFechaModificada) {
                        <span class="mod-pill visible" id="modBadgeMontajeDate">Modificado</span>
                      }
                    </label>
                    <div class="campo-fecha-wrap" id="wrap_montajeDate">
                      <input
                        type="text"
 appSelector="fecha"
 placeholder="dd/mm/aaaa"
                        id="montajeDate"
                        formControlName="montaje_fecha"
                        class="input-fecha"
                        [class.campo-modificado]="montajeFechaModificada"
                        [class.input-error]="mostrarErrorControl('montaje_fecha')"
                        aria-label="Fecha de montaje"
                        [attr.disabled]="tienePendiente || enviando ? true : null"
                      />
                      <span class="icono-calendario" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="16" y1="2" x2="16" y2="6"></line>
                          <line x1="8" y1="2" x2="8" y2="6"></line>
                          <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                      </span>
                    </div>
                    @if (mostrarErrorControl('montaje_fecha')) {
                      <span class="msg-error-campo" id="errMontajeDate" role="alert">
                        Ingrese una fecha válida para el montaje.
                      </span>
                    }
                  </div>
                  <div class="campo-tecnico-inicio">
                    <label for="montajeStartTime">
                      Hora de inicio&nbsp;<span class="req">*</span>
                      @if (montajeInicioModificado) {
                        <span class="mod-pill visible" id="modBadgeMontajeStart">Modificado</span>
                      }
                    </label>
                    <div class="campo-hora-wrap" id="wrap_montajeStartTime">
                      <input
                        type="text"
 appSelector="hora"
                        id="montajeStartTime"
                        formControlName="montaje_hora_inicio"
                        class="input-hora"
                        [class.campo-modificado]="montajeInicioModificado"
                        [class.input-error]="mostrarErrorControl('montaje_hora_inicio')"
                        aria-label="Hora de inicio del montaje"
                        [attr.disabled]="tienePendiente || enviando ? true : null"
                      />
                      <span class="icono-reloj" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                      </span>
                    </div>
                    @if (mostrarErrorControl('montaje_hora_inicio')) {
                      <span class="msg-error-campo" id="errMontajeStart" role="alert">
                        Use el formato HH:mm (06:00 a 22:00).
                      </span>
                    }
                  </div>
                  <div class="campo-tecnico-fin">
                    <label for="montajeEndTime">
                      Hora de fin&nbsp;<span class="req">*</span>
                      @if (montajeFinModificado) {
                        <span class="mod-pill visible" id="modBadgeMontajeEnd">Modificado</span>
                      }
                    </label>
                    <div class="campo-hora-wrap" id="wrap_montajeEndTime">
                      <input
                        type="text"
 appSelector="hora"
                        id="montajeEndTime"
                        formControlName="montaje_hora_fin"
                        class="input-hora"
                        [class.campo-modificado]="montajeFinModificado"
                        [class.input-error]="mostrarErrorControl('montaje_hora_fin')"
                        aria-label="Hora de fin del montaje"
                        [attr.disabled]="tienePendiente || enviando ? true : null"
                      />
                      <span class="icono-reloj" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                      </span>
                    </div>
                    @if (mostrarErrorControl('montaje_hora_fin')) {
                      <span class="msg-error-campo" id="errMontajeEnd" role="alert">
                        Use el formato HH:mm (06:00 a 22:00).
                      </span>
                    }
                  </div>
                </div>
                <span class="ayuda">* Por defecto finaliza al comenzar el evento.</span>
              </div>
            </div>

            <!-- Desmontaje Independiente -->
            <div class="caja-adicional caja-desmontaje" [class.desactivada]="!formulario.get('has_desmontaje')?.value" id="panelDesmontaje">
              <div class="caja-adicional-cabecera">
                <label class="check-label" for="chkDesmontaje">
                  <input
                    type="checkbox"
                    id="chkDesmontaje"
                    formControlName="has_desmontaje"
                    (change)="alCambiarDesmontaje()"
                    [attr.disabled]="tienePendiente || enviando ? true : null"
                  />
                  <span>Requiere desmontaje posterior</span>
                </label>
                <span class="badge-tecnico badge-desmontaje">Desmontaje técnico</span>
              </div>
              <div class="campos-adicional" [class.oculto]="!formulario.get('has_desmontaje')?.value" id="fieldsDesmontaje">
                <div class="form-tecnico">
                  <div class="campo-tecnico-fecha">
                    <label for="desmontajeDate">
                      Fecha&nbsp;<span class="req">*</span>
                      @if (desmontajeFechaModificada) {
                        <span class="mod-pill visible" id="modBadgeDesmontajeDate">Modificado</span>
                      }
                    </label>
                    <div class="campo-fecha-wrap" id="wrap_desmontajeDate">
                      <input
                        type="text"
 appSelector="fecha"
 placeholder="dd/mm/aaaa"
                        id="desmontajeDate"
                        formControlName="desmontaje_fecha"
                        class="input-fecha"
                        [class.campo-modificado]="desmontajeFechaModificada"
                        [class.input-error]="mostrarErrorControl('desmontaje_fecha')"
                        aria-label="Fecha de desmontaje"
                        [attr.disabled]="tienePendiente || enviando ? true : null"
                      />
                      <span class="icono-calendario" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="16" y1="2" x2="16" y2="6"></line>
                          <line x1="8" y1="2" x2="8" y2="6"></line>
                          <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                      </span>
                    </div>
                    @if (mostrarErrorControl('desmontaje_fecha')) {
                      <span class="msg-error-campo" id="errDesmontajeDate" role="alert">
                        Ingrese una fecha válida para el desmontaje.
                      </span>
                    }
                  </div>
                  <div class="campo-tecnico-inicio">
                    <label for="desmontajeStartTime">
                      Hora de inicio&nbsp;<span class="req">*</span>
                      @if (desmontajeInicioModificado) {
                        <span class="mod-pill visible" id="modBadgeDesmontajeStart">Modificado</span>
                      }
                    </label>
                    <div class="campo-hora-wrap" id="wrap_desmontajeStartTime">
                      <input
                        type="text"
 appSelector="hora"
                        id="desmontajeStartTime"
                        formControlName="desmontaje_hora_inicio"
                        class="input-hora"
                        [class.campo-modificado]="desmontajeInicioModificado"
                        [class.input-error]="mostrarErrorControl('desmontaje_hora_inicio')"
                        aria-label="Hora de inicio del desmontaje"
                        [attr.disabled]="tienePendiente || enviando ? true : null"
                      />
                      <span class="icono-reloj" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                      </span>
                    </div>
                    @if (mostrarErrorControl('desmontaje_hora_inicio')) {
                      <span class="msg-error-campo" id="errDesmontajeStart" role="alert">
                        Use el formato HH:mm (06:00 a 22:00).
                      </span>
                    }
                  </div>
                  <div class="campo-tecnico-fin">
                    <label for="desmontajeEndTime">
                      Hora de fin&nbsp;<span class="req">*</span>
                      @if (desmontajeFinModificado) {
                        <span class="mod-pill visible" id="modBadgeDesmontajeEnd">Modificado</span>
                      }
                    </label>
                    <div class="campo-hora-wrap" id="wrap_desmontajeEndTime">
                      <input
                        type="text"
 appSelector="hora"
                        id="desmontajeEndTime"
                        formControlName="desmontaje_hora_fin"
                        class="input-hora"
                        [class.campo-modificado]="desmontajeFinModificado"
                        [class.input-error]="mostrarErrorControl('desmontaje_hora_fin')"
                        aria-label="Hora de fin del desmontaje"
                        [attr.disabled]="tienePendiente || enviando ? true : null"
                      />
                      <span class="icono-reloj" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                      </span>
                    </div>
                    @if (mostrarErrorControl('desmontaje_hora_fin')) {
                      <span class="msg-error-campo" id="errDesmontajeEnd" role="alert">
                        Use el formato HH:mm (06:00 a 22:00).
                      </span>
                    }
                  </div>
                </div>
                <span class="ayuda">* Por defecto inicia al concluir el evento.</span>
              </div>
            </div>

            <!-- Ensayo Técnico Previo -->
            <div class="caja-adicional caja-ensayo" [class.desactivada]="!formulario.get('has_ensayo')?.value" id="panelEnsayo">
              <div class="caja-adicional-cabecera">
                <label class="check-label" for="chkEnsayo">
                  <input
                    type="checkbox"
                    id="chkEnsayo"
                    formControlName="has_ensayo"
                    (change)="alCambiarEnsayo()"
                    [attr.disabled]="tienePendiente || enviando ? true : null"
                  />
                  <span>Requiere ensayo técnico previo</span>
                  @if (ensayoAgregadoModificado) {
                    <span class="mod-pill visible" id="modBadgeEnsayoAdded">Ensayo añadido</span>
                  }
                </label>
                <span class="badge-tecnico badge-ensayo">Ensayo técnico</span>
              </div>
              <div class="campos-adicional" [class.oculto]="!formulario.get('has_ensayo')?.value" id="fieldsEnsayo">
                <div class="form-tecnico">
                  <div class="campo-tecnico-fecha">
                    <label for="ensayoDate">
                      Fecha&nbsp;<span class="req">*</span>
                      @if (ensayoFechaModificada) {
                        <span class="mod-pill visible" id="modBadgeEnsayoDate">Modificado</span>
                      }
                    </label>
                    <div class="campo-fecha-wrap" id="wrap_ensayoDate">
                      <input
                        type="text"
 appSelector="fecha"
 placeholder="dd/mm/aaaa"
                        id="ensayoDate"
                        formControlName="ensayo_fecha"
                        class="input-fecha"
                        [class.campo-modificado]="ensayoFechaModificada"
                        [class.input-error]="mostrarErrorControl('ensayo_fecha')"
                        aria-label="Fecha del ensayo técnico"
                        [attr.disabled]="tienePendiente || enviando ? true : null"
                      />
                      <span class="icono-calendario" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="16" y1="2" x2="16" y2="6"></line>
                          <line x1="8" y1="2" x2="8" y2="6"></line>
                          <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                      </span>
                    </div>
                    @if (mostrarErrorControl('ensayo_fecha')) {
                      <span class="msg-error-campo" id="errEnsayoDate" role="alert">
                        Ingrese una fecha válida para el ensayo técnico.
                      </span>
                    }
                  </div>
                  <div class="campo-tecnico-inicio">
                    <label for="ensayoStartTime">
                      Hora de inicio&nbsp;<span class="req">*</span>
                      @if (ensayoInicioModificado) {
                        <span class="mod-pill visible" id="modBadgeEnsayoStart">Modificado</span>
                      }
                    </label>
                    <div class="campo-hora-wrap" id="wrap_ensayoStartTime">
                      <input
                        type="text"
 appSelector="hora"
                        id="ensayoStartTime"
                        formControlName="ensayo_hora_inicio"
                        class="input-hora"
                        [class.campo-modificado]="ensayoInicioModificado"
                        [class.input-error]="mostrarErrorControl('ensayo_hora_inicio')"
                        aria-label="Hora de inicio del ensayo técnico"
                        [attr.disabled]="tienePendiente || enviando ? true : null"
                      />
                      <span class="icono-reloj" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                      </span>
                    </div>
                    @if (mostrarErrorControl('ensayo_hora_inicio')) {
                      <span class="msg-error-campo" id="errEnsayoStart" role="alert">
                        Use el formato HH:mm (06:00 a 22:00).
                      </span>
                    }
                  </div>
                  <div class="campo-tecnico-fin">
                    <label for="ensayoEndTime">
                      Hora de fin&nbsp;<span class="req">*</span>
                      @if (ensayoFinModificado) {
                        <span class="mod-pill visible" id="modBadgeEnsayoEnd">Modificado</span>
                      }
                    </label>
                    <div class="campo-hora-wrap" id="wrap_ensayoEndTime">
                      <input
                        type="text"
 appSelector="hora"
                        id="ensayoEndTime"
                        formControlName="ensayo_hora_fin"
                        class="input-hora"
                        [class.campo-modificado]="ensayoFinModificado"
                        [class.input-error]="mostrarErrorControl('ensayo_hora_fin')"
                        aria-label="Hora de fin del ensayo técnico"
                        [attr.disabled]="tienePendiente || enviando ? true : null"
                      />
                      <span class="icono-reloj" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                      </span>
                    </div>
                    @if (mostrarErrorControl('ensayo_hora_fin')) {
                      <span class="msg-error-campo" id="errEnsayoEnd" role="alert">
                        Use el formato HH:mm (06:00 a 22:00).
                      </span>
                    }
                  </div>
                </div>
                <span class="ayuda">* El ensayo debe finalizar antes del evento y no cruzarse con su montaje ni con otros eventos.</span>
              </div>
            </div>
          </div>

          <!-- Cronograma resumido del horario propuesto -->
          <div class="resumen-horario-box" id="resumenHorarioBoxCliente">
            <div class="resumen-horario-titulo">Cronograma propuesto:</div>
            <div class="resumen-horario-items" id="resumenHorarioItemsCliente">
              @if (formulario.get('has_ensayo')?.value && formulario.get('ensayo_hora_inicio')?.value && formulario.get('ensayo_hora_fin')?.value) {
                <span class="resumen-horario-pill pill-ensayo">
                  <strong>Ensayo:</strong> {{ formulario.get('ensayo_hora_inicio')?.value }} a {{ formulario.get('ensayo_hora_fin')?.value }}@if (obtenerDuracionEnsayo(); as dur) { ({{ dur }})}
                </span>
              }
              @if (formulario.get('has_montaje')?.value && formulario.get('montaje_hora_inicio')?.value && formulario.get('montaje_hora_fin')?.value) {
                <span class="resumen-horario-pill pill-montaje">
                  <strong>Montaje:</strong> {{ formulario.get('montaje_hora_inicio')?.value }} a {{ formulario.get('montaje_hora_fin')?.value }}@if (obtenerDuracionMontaje(); as dur) { ({{ dur }})}
                </span>
              }
              <span class="resumen-horario-pill pill-evento">
                <strong>Evento:</strong> {{ formulario.get('hora_inicio_propuesta')?.value || '--:--' }} a {{ formulario.get('hora_fin_propuesta')?.value || '--:--' }}@if (obtenerDuracionPropuesta(); as dur) { ({{ dur }})}
              </span>
              @if (formulario.get('has_desmontaje')?.value && formulario.get('desmontaje_hora_inicio')?.value && formulario.get('desmontaje_hora_fin')?.value) {
                <span class="resumen-horario-pill pill-desmontaje">
                  <strong>Desmontaje:</strong> {{ formulario.get('desmontaje_hora_inicio')?.value }} a {{ formulario.get('desmontaje_hora_fin')?.value }}@if (obtenerDuracionDesmontaje(); as dur) { ({{ dur }})}
                </span>
              }
            </div>
          </div>

          <!-- Bloque: Adicionales del Evento -->
          <div class="seccion-adicionales-evento" id="seccionAdicionalesCliente">
            <div class="adicionales-cabecera">
              <div>
                <h3>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                  </svg>
                  Adicionales del evento
                </h3>
                <p class="ayuda" style="margin-top: 2px; margin-bottom: 8px;">
                  Seleccione servicios técnicos o recursos adicionales que desee incorporar a su propuesta.
                  <span class="nota-referencial-prototipo">Importes referenciales para el prototipo</span>
                </p>
              </div>
            </div>

            <!-- Formulario para agregar / actualizar adicional -->
            <div class="adicionales-form-card">
              <div class="adicionales-form-grid">
                <div class="campo-adicional-item campo-adic-select">
                  <label for="selAdicionalCliente">Adicional</label>
                  <select
                    id="selAdicionalCliente"
                    class="select-adicional"
                    [value]="selAdicionalId()"
                    (change)="alCambiarSeleccionAdicional($event)"
                    [attr.disabled]="tienePendiente || enviando ? true : null"
                  >
                    @for (cat of catalogo(); track cat.id) {
                      <option [value]="cat.id">{{ cat.nombre }} ({{ formatSoles(cat.tarifa_hora) }} / h)</option>
                    }
                  </select>
                </div>

                <div class="campo-adicional-item">
                  <label for="numAdicionalCantidadCliente" id="lblAdicionalCantidadCliente">{{ labelUnidadActual() }}</label>
                  <input
                    type="number"
                    id="numAdicionalCantidadCliente"
                    min="1"
                    step="1"
                    [value]="numAdicionalCantidad()"
                    (input)="alCambiarCantidadAdicional($event)"
                    class="input-numero"
                    aria-label="Cantidad de unidades"
                    [attr.disabled]="tienePendiente || enviando ? true : null"
                  />
                </div>

                <div class="campo-adicional-item">
                  <label for="numAdicionalHorasCliente">Horas de uso</label>
                  <input
                    type="number"
                    id="numAdicionalHorasCliente"
                    min="1"
                    step="1"
                    [value]="numAdicionalHoras()"
                    (input)="alCambiarHorasAdicional($event)"
                    class="input-numero"
                    aria-label="Horas de uso"
                    [attr.disabled]="tienePendiente || enviando ? true : null"
                  />
                </div>

                <div class="campo-adicional-item">
                  <label for="txtAdicionalTarifaCliente">Tarifa por hora</label>
                  <input
                    type="text"
                    id="txtAdicionalTarifaCliente"
                    readonly
                    class="input-readonly"
                    [value]="tarifaActualTexto()"
                    aria-label="Tarifa por hora de solo lectura"
                  />
                </div>

                <div class="campo-adicional-item">
                  <label for="txtAdicionalSubtotalCliente">Subtotal estimado</label>
                  <input
                    type="text"
                    id="txtAdicionalSubtotalCliente"
                    readonly
                    class="input-readonly subtotal-destacado"
                    [value]="subtotalActualTexto()"
                    aria-label="Subtotal calculado"
                  />
                </div>

                <div class="campo-adicional-accion">
                  <button
                    type="button"
                    class="btn btn-primario"
                    id="btnAgregarAdicionalCliente"
                    (click)="agregarOActualizarAdicional()"
                    [disabled]="tienePendiente || enviando"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span id="btnAgregarAdicionalTextoCliente">{{ textoBotonAdicional() }}</span>
                  </button>
                </div>
              </div>
              @if (errAdicionalForm()) {
                <span class="msg-error-campo" id="errAdicionalFormCliente" role="alert">{{ errAdicionalForm() }}</span>
              }
            </div>

            <!-- Tabla de adicionales agregados en la propuesta -->
            <div class="tabla-adicionales-wrap">
              <table class="tabla-adicionales" id="tablaAdicionalesCliente">
                <thead>
                  <tr>
                    <th>Adicional</th>
                    <th style="text-align: center;">Cantidad</th>
                    <th style="text-align: center;">Horas de uso</th>
                    <th style="text-align: right;">Tarifa por hora</th>
                    <th style="text-align: right;">Subtotal</th>
                    <th style="text-align: center;">Acciones</th>
                  </tr>
                </thead>
                <tbody id="tbodyAdicionalesCliente">
                  @for (item of formAdicionales(); track item.id) {
                    <tr [attr.data-adic-id]="item.id">
                      <td><strong>{{ item.nombre }}</strong></td>
                      <td style="text-align: center;">{{ item.cantidad }}</td>
                      <td style="text-align: center;">{{ item.horas }} h</td>
                      <td style="text-align: right;">{{ formatSoles(item.tarifa_hora) }} / h</td>
                      <td style="text-align: right; font-weight: 700; color: var(--primario);">{{ formatSoles(item.subtotal) }}</td>
                      <td style="text-align: center;">
                        <button
                          type="button"
                          class="btn-accion-adic btn-edit-adic"
                          (click)="editarAdicional(item.id)"
                          title="Editar cantidad y horas"
                          [disabled]="tienePendiente || enviando"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                          </svg>
                          Editar
                        </button>
                        <button
                          type="button"
                          class="btn-accion-adic btn-delete-adic"
                          (click)="eliminarAdicional(item.id)"
                          title="Quitar de la propuesta"
                          [disabled]="tienePendiente || enviando"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                          Quitar
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
                @if (formAdicionales().length > 0) {
                  <tfoot>
                    <tr class="fila-total-adicionales">
                      <td colspan="4" style="text-align: right; font-weight: bold;">Total de adicionales propuesto:</td>
                      <td style="text-align: right; font-weight: bold; color: var(--primario);" id="totalAdicionalesTablaCliente">{{ totalAdicionalesTablaTexto() }}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                }
              </table>
              @if (formAdicionales().length === 0) {
                <div class="adicionales-vacio-msg" id="msgAdicionalesVacioCliente">
                  No ha agregado servicios adicionales a su propuesta.
                </div>
              }
            </div>
          </div>

          <!-- Bloque 4: Motivo de la Solicitud (OBLIGATORIO) -->
          <div class="form" style="margin-top: 18px;">
            <div class="completo">
              <label for="requestReason">
                Motivo de la solicitud de modificación <span class="req">*</span>
              </label>
              <textarea
                id="requestReason"
                rows="3"
                required
                placeholder="Explique la razón del cambio (ej. Ajuste de agenda de los ponentes principales, extensión de ceremonia, necesidad de ensayo previo...)"
                maxlength="400"
                formControlName="motivo"
                [class.input-error]="mostrarErrorControl('motivo')"
                [attr.disabled]="tienePendiente || enviando ? true : null"
              ></textarea>
              @if (mostrarErrorControl('motivo')) {
                <span class="msg-error-campo" id="errRequestReason" role="alert">
                  @if (
                    formulario.get('motivo')?.hasError('required') ||
                    formulario.get('motivo')?.hasError('motivoVacio')
                  ) {
                    Debe indicar el motivo de la solicitud (no puede contener solo espacios).
                  } @else if (formulario.get('motivo')?.hasError('maximoUnicode')) {
                    El motivo no puede superar los 400 caracteres.
                  }
                </span>
              }
              <span class="ayuda">
                Esta información es indispensable para que el asesor comercial evalúe la viabilidad
                de la solicitud.
              </span>
            </div>
          </div>

          @if (mostrarErroresGrupo() && formulario.hasError('inicioPosteriorOIgualAFin')) {
            <div class="msg-error" id="errorPaso2Cliente" role="alert">
              La hora de inicio propuesta debe ser anterior a la hora de fin.
            </div>
          }

          @if (mostrarErroresGrupo() && formulario.hasError('montajeInicioPosteriorOIgualAFin')) {
            <div class="msg-error" id="errorPaso2Cliente" role="alert">
              La hora de inicio del montaje debe ser anterior a su hora de fin.
            </div>
          }

          @if (mostrarErroresGrupo() && formulario.hasError('montajeFinalizaDespuesDeInicio')) {
            <div class="msg-error" id="errorPaso2Cliente" role="alert">
              El montaje no puede finalizar después del inicio del evento.
            </div>
          }

          @if (mostrarErroresGrupo() && formulario.hasError('desmontajeInicioPosteriorOIgualAFin')) {
            <div class="msg-error" id="errorPaso2Cliente" role="alert">
              La hora de inicio del desmontaje debe ser anterior a su hora de fin.
            </div>
          }

          @if (mostrarErroresGrupo() && formulario.hasError('desmontajeIniciaAntesDeFin')) {
            <div class="msg-error" id="errorPaso2Cliente" role="alert">
              El desmontaje no puede iniciar antes del fin del evento.
            </div>
          }

          @if (mostrarErroresGrupo() && formulario.hasError('ensayoInicioPosteriorOIgualAFin')) {
            <div class="msg-error" id="errorPaso2Cliente" role="alert">
              La hora de inicio del ensayo técnico debe ser anterior a su hora de fin.
            </div>
          }

          @if (mostrarErroresGrupo() && formulario.hasError('ensayoFinalizaDespuesDeInicio')) {
            <div class="msg-error" id="errorPaso2Cliente" role="alert">
              El ensayo técnico debe culminar antes de la hora de inicio del evento.
            </div>
          }

          @if (mostrarErroresGrupo() && formulario.hasError('ensayoCruzaConMontaje')) {
            <div class="msg-error" id="errorPaso2Cliente" role="alert">
              El ensayo técnico no puede cruzarse con el montaje del evento.
            </div>
          }

          @if (mostrarErroresGrupo() && formulario.hasError('sinCambiosRespectoAlOriginal')) {
            <div class="msg-error" id="errorPaso2Cliente" role="alert">
              No se han detectado modificaciones en la información general, contacto, fecha, horario ni
              tiempos técnicos. Debe proponer al menos un cambio efectivo respecto al evento original antes
              de continuar.
            </div>
          }

          <!-- Acciones del Paso 2 -->
          <div class="acciones">
            <button
              type="button"
              class="btn btn-sec"
              (click)="alSolicitarVolver()"
              [disabled]="enviando"
            >
              &larr; Volver a mis eventos
            </button>

            <div class="der">
              <button
                type="button"
                class="btn btn-sec"
                id="btnDescartarPaso2Cliente"
                (click)="alSolicitarDescartar()"
                [disabled]="enviando || tienePendiente || !tieneCambiosEnBorrador()"
              >
                Descartar cambios
              </button>
              <button
                type="submit"
                class="btn btn-primario"
                id="btnAvanzarPaso3Cliente"
                [disabled]="enviando || tienePendiente"
              >
                Continuar a revisión &rarr;
              </button>
            </div>
          </div>
        </form>
      }
    </section>
  `,
  styles: [
    `
      .bloque-fecha-evento {
        margin-top: 18px;
      }

      .titulo-fecha-evento {
        font-size: 14px;
        color: var(--primario-2);
        margin: 0 0 12px 0;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--borde);
      }

      .insignia-evento-wrap {
        display: flex;
        align-items: center;
        margin-bottom: 16px;
      }

      .badge-tecnico {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: 14px;
        font-size: 11.5px;
        font-weight: bold;
        letter-spacing: 0.3px;
        text-transform: uppercase;
      }

      .badge-tecnico.badge-evento {
        background: #eef2ff;
        color: #1f4e9c;
        border: 1px solid #c7d2fe;
      }

      .form {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
      }

      .form-evento-principal {
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      }

      .completo {
        grid-column: 1 / -1;
      }

      label {
        display: block;
        font-size: 13px;
        font-weight: bold;
        margin-bottom: 6px;
        color: var(--primario);
      }

      label .req {
        color: var(--error);
        margin-left: 2px;
      }

      label .opc {
        font-weight: normal;
        color: var(--gris);
        font-size: 12px;
      }

      .form input,
      .form textarea {
        width: 100%;
        padding: 9px 10px;
        border: 1px solid var(--borde);
        border-radius: 6px;
        font-size: 14px;
        font-family: inherit;
        background: var(--blanco);
        color: var(--texto);
        transition:
          border-color 0.15s,
          outline 0.15s;
      }

      .form input.input-readonly,
      .form input[readonly] {
        background: var(--suave);
        color: var(--gris);
        cursor: not-allowed;
      }

      .form input:focus:not([readonly]),
      .form textarea:focus {
        outline: 2px solid var(--primario-2);
        border-color: transparent;
      }

      .form input.campo-modificado,
      .form textarea.campo-modificado {
        border-color: #f2a900;
        background-color: #fffdf5;
      }

      .form input.input-error,
      .form textarea.input-error {
        border-color: var(--error) !important;
        background-color: #fff5f5 !important;
      }

      .campo-hora-wrap,
      .campo-fecha-wrap {
        position: relative;
        width: 100%;
        display: flex;
        align-items: center;
      }

      .campo-hora-wrap input.input-hora,
      .campo-fecha-wrap input.input-fecha {
        width: 100%;
        padding: 9px 36px 9px 10px;
        height: 38px;
        background: var(--blanco);
        border: 1px solid var(--borde);
        border-radius: 6px;
        font-size: 14px;
        font-family: inherit;
        color: var(--texto);
        font-weight: normal;
        cursor: pointer;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease,
          outline 0.15s ease;
      }

      .campo-hora-wrap input.input-hora:focus,
      .campo-fecha-wrap input.input-fecha:focus {
        outline: 2px solid var(--primario-2);
        border-color: transparent;
      }

      .campo-hora-wrap input.input-hora:disabled,
      .campo-fecha-wrap input.input-fecha:disabled {
        background-color: var(--suave);
        color: var(--gris);
        cursor: not-allowed;
      }

      .campo-hora-wrap .icono-reloj,
      .campo-fecha-wrap .icono-calendario {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--gris);
        pointer-events: none;
        transition: color 0.15s ease;
      }

      .campo-hora-wrap:focus-within .icono-reloj,
      .campo-fecha-wrap:focus-within .icono-calendario {
        color: var(--primario-2);
      }

      .campo-hora-wrap input.input-hora.campo-modificado,
      .campo-fecha-wrap input.input-fecha.campo-modificado {
        border-color: #f2a900;
        background-color: #fffdf5;
      }

      .campo-hora-wrap input.input-hora.input-error,
      .campo-fecha-wrap input.input-fecha.input-error {
        border-color: var(--error) !important;
        background-color: #fff5f5 !important;
      }

      .mod-pill {
        display: none;
        background: #fff4d6;
        color: #8a6100;
        border: 1px solid #f6d17b;
        border-radius: 10px;
        padding: 1px 7px;
        font-size: 11px;
        font-weight: 600;
        margin-left: 6px;
        vertical-align: middle;
      }

      .mod-pill.visible {
        display: inline-block;
      }

      .msg-error-campo {
        display: block;
        color: var(--error);
        font-size: 12px;
        margin-top: 3px;
        min-height: 14px;
      }

      .msg-error {
        color: var(--error);
        font-size: 13px;
        margin-top: 10px;
        font-weight: bold;
      }

      .resumen-horario-box {
        background: var(--blanco);
        border: 1px solid var(--borde);
        border-radius: 8px;
        padding: 12px 14px;
        margin-top: 16px;
      }

      .resumen-horario-titulo {
        font-size: 12px;
        font-weight: bold;
        color: var(--gris);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
      }

      .resumen-horario-items {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .timeline-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 16px;
        font-size: 13px;
        font-weight: 500;
      }

      .timeline-pill .pill-label {
        font-weight: bold;
      }

      .timeline-pill.evento {
        background: #eef2ff;
        color: var(--primario-2);
        border: 1px solid #c7d2fe;
      }

      .contenedor-tiempos-tecnicos {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
        margin-top: 10px;
      }

      .caja-adicional {
        background: var(--suave);
        border: 1px solid var(--borde);
        border-radius: 8px;
        padding: 16px;
        width: 100%;
        box-sizing: border-box;
        transition: padding 0.15s ease, background 0.15s ease;
      }

      .caja-adicional.desactivada {
        padding: 14px 16px;
      }

      .caja-adicional-cabecera {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
      }

      .caja-adicional.desactivada .caja-adicional-cabecera {
        margin-bottom: 0 !important;
      }

      .check-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: bold;
        color: var(--primario);
        cursor: pointer;
        margin-bottom: 0;
      }

      .check-label input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: var(--primario-2);
      }

      .campos-adicional {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px dashed var(--borde);
      }

      .campos-adicional.oculto {
        display: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        height: 0 !important;
      }

      .form-tecnico {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr);
        gap: 12px 16px;
        align-items: start;
      }

      .campo-tecnico-fecha {
        grid-column: 1;
        width: 100%;
      }

      .campo-tecnico-inicio {
        grid-column: 2;
        width: 100%;
      }

      .campo-tecnico-fin {
        grid-column: 3;
        width: 100%;
      }

      .form-tecnico > div {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .badge-tecnico.badge-montaje {
        background: #fffbeb;
        color: #b45309;
        border: 1px solid #fde68a;
      }

      .badge-tecnico.badge-desmontaje {
        background: #f5f3ff;
        color: #6d28d9;
        border: 1px solid #ddd6fe;
      }

      .badge-tecnico.badge-ensayo {
        background: #f0fdfa;
        color: #0f766e;
        border: 1px solid #99f6e4;
      }

      .resumen-horario-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 16px;
        font-size: 13px;
        font-weight: 500;
      }

      .resumen-horario-pill.pill-montaje {
        background: #fef3c7;
        color: #92400e;
        border: 1px solid #fcd34d;
      }

      .resumen-horario-pill.pill-evento {
        background: #eef2ff;
        color: var(--primario-2);
        border: 1px solid #c7d2fe;
      }

      .resumen-horario-pill.pill-desmontaje {
        background: #f5f3ff;
        color: #6d28d9;
        border: 1px solid #ddd6fe;
      }

      .resumen-horario-pill.pill-ensayo {
        background: #f0fdfa;
        color: #0f766e;
        border: 1px solid #99f6e4;
      }

      @media (max-width: 768px) {
        .form-tecnico {
          grid-template-columns: 1fr 1fr;
        }
        .campo-tecnico-fecha {
          grid-column: 1 / -1;
        }
        .campo-tecnico-inicio {
          grid-column: 1;
        }
        .campo-tecnico-fin {
          grid-column: 2;
        }
      }

      @media (max-width: 480px) {
        .form-tecnico {
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .campo-tecnico-inicio,
        .campo-tecnico-fin {
          grid-column: 1 / -1;
        }
        .caja-adicional {
          padding: 12px;
        }
        .caja-adicional.desactivada {
          padding: 10px 12px;
        }
      }

      /* Estilos del Bloque de Adicionales del Evento (Showtech Prototype) */
      .seccion-adicionales-evento {
        margin-top: 24px;
        border-top: 1px solid var(--borde);
        padding-top: 18px;
      }

      .adicionales-cabecera {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
      }

      .adicionales-cabecera h3 {
        margin: 0 0 4px 0;
        color: var(--primario);
        font-size: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .nota-referencial-prototipo {
        background: #f1f5f9;
        border: 1px solid #cbd5e1;
        color: #475569;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 4px;
        display: inline-block;
        margin-left: 6px;
        letter-spacing: 0.2px;
      }

      .adicionales-form-card {
        background: var(--blanco);
        border: 1px solid var(--borde);
        border-radius: 8px;
        padding: 14px 16px;
        margin-bottom: 14px;
        box-shadow: 0 1px 3px rgba(19, 38, 74, 0.04);
      }

      .adicionales-form-grid {
        display: grid;
        grid-template-columns: minmax(180px, 2fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(120px, 1fr) minmax(130px, 1.2fr) auto;
        gap: 10px;
        align-items: end;
      }

      .campo-adicional-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .campo-adicional-item label {
        font-size: 12px;
        font-weight: 600;
        color: var(--primario);
        margin-bottom: 0;
      }

      .campo-adicional-item .select-adicional,
      .campo-adicional-item .input-numero,
      .campo-adicional-item .input-readonly {
        width: 100%;
        height: 38px;
        padding: 6px 10px;
        border: 1.5px solid var(--borde);
        border-radius: 6px;
        font-size: 13.5px;
        font-family: inherit;
        color: var(--texto);
        background: var(--blanco);
        transition: border-color 0.15s, box-shadow 0.15s;
      }

      .campo-adicional-item .select-adicional:focus,
      .campo-adicional-item .input-numero:focus {
        border-color: var(--primario-2);
        outline: none;
        box-shadow: 0 0 0 3px rgba(31, 78, 156, 0.12);
      }

      .campo-adicional-item .input-readonly {
        background: #f8fafc;
        color: #334155;
        cursor: default;
        font-weight: 600;
      }

      .campo-adicional-item .subtotal-destacado {
        color: var(--primario);
        font-weight: 700;
        background: #f0f4fc;
        border-color: #cbd5e1;
      }

      .campo-adicional-accion {
        display: flex;
        align-items: flex-end;
      }

      .campo-adicional-accion .btn {
        height: 38px;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 0 14px;
      }

      .tabla-adicionales-wrap {
        background: var(--blanco);
        border: 1px solid var(--borde);
        border-radius: 8px;
        overflow-x: auto;
        margin-bottom: 14px;
      }

      .tabla-adicionales {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        text-align: left;
      }

      .tabla-adicionales th {
        background: var(--fondo);
        color: var(--primario);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        padding: 10px 12px;
        border-bottom: 2px solid var(--borde);
      }

      .tabla-adicionales td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--borde);
        color: var(--texto);
        vertical-align: middle;
      }

      .tabla-adicionales tr:hover td {
        background: #fbfcfe;
      }

      .fila-total-adicionales td {
        background: #f8fafc;
        font-size: 13.5px;
        border-top: 2px solid var(--borde);
      }

      .btn-accion-adic {
        border: 1px solid transparent;
        background: transparent;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
      }

      .btn-edit-adic {
        color: var(--primario-2);
        border-color: #cbd5e1;
        background: #ffffff;
      }

      .btn-edit-adic:hover:not(:disabled) {
        background: #eff6ff;
        border-color: var(--primario-2);
      }

      .btn-delete-adic {
        color: var(--error);
        border-color: #fecaca;
        background: #ffffff;
        margin-left: 4px;
      }

      .btn-delete-adic:hover:not(:disabled) {
        background: #fef2f2;
        border-color: var(--error);
      }

      .adicionales-vacio-msg {
        padding: 18px;
        text-align: center;
        color: var(--gris);
        font-size: 13.5px;
        background: #fafbfc;
      }

      @media (max-width: 900px) {
        .adicionales-form-grid {
          grid-template-columns: 1fr 1fr;
        }
        .campo-adicional-item.campo-adic-select {
          grid-column: 1 / -1;
        }
        .campo-adicional-accion {
          grid-column: 1 / -1;
        }
      }

      .acciones {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-top: 18px;
        flex-wrap: wrap;
        align-items: center;
      }

      .acciones .der {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .aviso-disponibilidad {
        margin: 12px 0 0;
      }
    `,
  ],
})
export class SolicitudFormularioComponent {
  private readonly fb = inject(FormBuilder);

  readonly catalogo = signal<AdicionalCatalogo[]>([]);

  @Input()
  set catalogoInput(items: AdicionalCatalogo[] | null | undefined) {
    const lista = Array.isArray(items) ? items : [];
    this.catalogo.set(lista);
    this.sincronizarCamposFormAdicional();
  }

  readonly formAdicionales = signal<AdicionalItem[]>([]);
  readonly formatearEstadoEvento = formatearEstadoEvento;
  readonly selAdicionalId = signal<string>('cochera');
  readonly numAdicionalCantidad = signal<number>(1);
  readonly numAdicionalHoras = signal<number>(1);
  readonly errAdicionalForm = signal<string>('');

  eventoActual: Evento | null = null;
  private borradorActual: SolicitudCreacionPayload | null = null;
  intentoEnvio = false;

  @Input()
  set eventoSeleccionado(evento: Evento | null) {
    const cambioDeEvento = this.eventoActual?.id !== evento?.id;
    this.eventoActual = evento;

    if (evento && cambioDeEvento) {
      this.aplicarValoresIniciales();
    } else if (!evento) {
      this.intentoEnvio = false;
      this.formAdicionales.set([]);
      this.formulario.reset({
        nombre_propuesto: '',
        contacto_propuesto: '',
        telefono_propuesto: '',
        correo_propuesto: '',
        observaciones_propuestas: '',
        fecha_propuesta: '',
        hora_inicio_propuesta: '',
        hora_fin_propuesta: '',
        has_montaje: false,
        montaje_fecha: '',
        montaje_hora_inicio: '',
        montaje_hora_fin: '',
        has_desmontaje: false,
        desmontaje_fecha: '',
        desmontaje_hora_inicio: '',
        desmontaje_hora_fin: '',
        has_ensayo: false,
        ensayo_fecha: '',
        ensayo_hora_inicio: '',
        ensayo_hora_fin: '',
        motivo: '',
      });
    } else {
      this.formulario.updateValueAndValidity();
    }
  }

  get eventoSeleccionado(): Evento | null {
    return this.eventoActual;
  }

  @Input()
  set borrador(valor: SolicitudCreacionPayload | null) {
    this.borradorActual = valor;
    if (this.eventoActual && valor && valor.evento_id === this.eventoActual.id) {
      const info = valor.informacion_general_propuesta;
      const tiempos = valor.tiempos_tecnicos_propuestos;
      this.formulario.patchValue(
        {
          nombre_propuesto: info ? info.nombre : (this.eventoActual.nombre ?? ''),
          contacto_propuesto: info ? info.contacto : (this.eventoActual.contacto ?? ''),
          telefono_propuesto: info ? info.telefono : (this.eventoActual.telefono ?? ''),
          correo_propuesto: info ? info.correo : (this.eventoActual.correo ?? ''),
          observaciones_propuestas: info
            ? info.observaciones
            : (this.eventoActual.observaciones ?? ''),
          fecha_propuesta: valor.fecha_propuesta,
          hora_inicio_propuesta: valor.hora_inicio_propuesta,
          hora_fin_propuesta: valor.hora_fin_propuesta,
          has_montaje: tiempos ? Boolean(tiempos.has_montaje) : Boolean(this.eventoActual.has_montaje),
          montaje_fecha: tiempos ? tiempos.montaje_fecha : (this.eventoActual.montaje_fecha ?? ''),
          montaje_hora_inicio: tiempos ? tiempos.montaje_hora_inicio : (this.eventoActual.montaje_hora_inicio ?? ''),
          montaje_hora_fin: tiempos ? tiempos.montaje_hora_fin : (this.eventoActual.montaje_hora_fin ?? ''),
          has_desmontaje: tiempos ? Boolean(tiempos.has_desmontaje) : Boolean(this.eventoActual.has_desmontaje),
          desmontaje_fecha: tiempos ? tiempos.desmontaje_fecha : (this.eventoActual.desmontaje_fecha ?? ''),
          desmontaje_hora_inicio: tiempos ? tiempos.desmontaje_hora_inicio : (this.eventoActual.desmontaje_hora_inicio ?? ''),
          desmontaje_hora_fin: tiempos ? tiempos.desmontaje_hora_fin : (this.eventoActual.desmontaje_hora_fin ?? ''),
          has_ensayo: tiempos ? Boolean(tiempos.has_ensayo) : Boolean(this.eventoActual.has_ensayo),
          ensayo_fecha: tiempos ? tiempos.ensayo_fecha : (this.eventoActual.ensayo_fecha ?? ''),
          ensayo_hora_inicio: tiempos ? tiempos.ensayo_hora_inicio : (this.eventoActual.ensayo_hora_inicio ?? ''),
          ensayo_hora_fin: tiempos ? tiempos.ensayo_hora_fin : (this.eventoActual.ensayo_hora_fin ?? ''),
          motivo: valor.motivo,
        },
        { emitEvent: false }
      );

      if (valor.adicionales_propuestos) {
        const cat = this.catalogo();
        const restaurados: AdicionalItem[] = valor.adicionales_propuestos.map((p) => {
          const c = cat.find((item) => item.id === p.id);
          const tarifa = c?.tarifa_hora ?? 0;
          const nombre = c?.nombre ?? p.id;
          return {
            id: p.id,
            nombre,
            cantidad: p.cantidad,
            horas: p.horas,
            tarifa_hora: tarifa,
            subtotal: Math.round(p.cantidad * p.horas * tarifa * 100) / 100,
          };
        });
        this.formAdicionales.set(restaurados);
      } else if (this.eventoActual.adicionales) {
        this.formAdicionales.set(JSON.parse(JSON.stringify(this.eventoActual.adicionales)));
      }
      this.sincronizarCamposFormAdicional();
      this.formulario.updateValueAndValidity({ emitEvent: false });
    }
  }

  get borrador(): SolicitudCreacionPayload | null {
    return this.borradorActual;
  }

  @Input() tienePendiente = false;
  @Input() enviando = false;
  @Input() mensajeExito = '';
  @Input() avisoRefrescoPosterior = '';
  @Input() errorEnvio = '';
  /** Última consulta de disponibilidad hecha por el contenedor (se muestra solo si es del evento actual). */
  @Input() disponibilidad: EstadoDisponibilidad | null = null;

  /** Horario propuesto (válido y distinto al del evento) para consultar su disponibilidad; `null` = nada que consultar. */
  @Output() consultarDisponibilidad = new EventEmitter<ConsultaDisponibilidadPayload | null>();
  @Output() continuarRevision = new EventEmitter<SolicitudCreacionPayload>();
  @Output() enviarSolicitud = new EventEmitter<SolicitudCreacionPayload>();
  @Output() solicitarVolver = new EventEmitter<boolean>();
  @Output() solicitarDescartar = new EventEmitter<boolean>();
  @Output() recargarSolicitudes = new EventEmitter<void>();

  readonly formulario = this.fb.group(
    {
      nombre_propuesto: [
        '',
        [Validators.required, textoObligatorioUnicodeValidator(120, 'nombreVacio')],
      ],
      contacto_propuesto: [
        '',
        [Validators.required, textoObligatorioUnicodeValidator(80, 'contactoVacio')],
      ],
      telefono_propuesto: ['', [textoOpcionalUnicodeValidator(25)]],
      correo_propuesto: ['', [correoOpcionalValidator(80)]],
      observaciones_propuestas: ['', [textoOpcionalUnicodeValidator(300)]],
      fecha_propuesta: ['', [Validators.required, fechaFormatoValidoValidator()]],
      hora_inicio_propuesta: ['', [Validators.required, horaFormatoYRangoValidator()]],
      hora_fin_propuesta: ['', [Validators.required, horaFormatoYRangoValidator()]],
      has_montaje: [false],
      montaje_fecha: ['', [fechaFormatoValidoValidator()]],
      montaje_hora_inicio: ['', [horaFormatoYRangoValidator()]],
      montaje_hora_fin: ['', [horaFormatoYRangoValidator()]],
      has_desmontaje: [false],
      desmontaje_fecha: ['', [fechaFormatoValidoValidator()]],
      desmontaje_hora_inicio: ['', [horaFormatoYRangoValidator()]],
      desmontaje_hora_fin: ['', [horaFormatoYRangoValidator()]],
      has_ensayo: [false],
      ensayo_fecha: ['', [fechaFormatoValidoValidator()]],
      ensayo_hora_inicio: ['', [horaFormatoYRangoValidator()]],
      ensayo_hora_fin: ['', [horaFormatoYRangoValidator()]],
      motivo: ['', [Validators.required, motivoUnicodeValidator(400)]],
    },
    {
      validators: [solicitudGrupoValidator(() => this.eventoActual, () => this.formAdicionales())],
    }
  );

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Consulta previa de disponibilidad: espera a que el usuario deje de escribir y no repite la misma consulta
    this.formulario.valueChanges
      .pipe(
        debounceTime(500),
        map(() => this.payloadDeDisponibilidad()),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((payload) => this.consultarDisponibilidad.emit(payload));
  }

  /** La consulta de disponibilidad solo se muestra si corresponde al evento que se está editando. */
  get avisoDisponibilidad(): EstadoDisponibilidad | null {
    const d = this.disponibilidad;
    return d && this.eventoActual && d.evento_id === this.eventoActual.id ? d : null;
  }

  /**
   * Arma la consulta de disponibilidad, o `null` si no procede: sin evento, con solicitud pendiente, con algún campo
   * de horario inválido o cuando el horario (y los tiempos técnicos) no cambian respecto al evento.
   */
  private payloadDeDisponibilidad(): ConsultaDisponibilidadPayload | null {
    const evento = this.eventoActual;
    if (!evento || this.tienePendiente) {
      return null;
    }
    const v = this.formulario.getRawValue();
    const controles = ['fecha_propuesta', 'hora_inicio_propuesta', 'hora_fin_propuesta'];
    if (v.has_montaje) controles.push('montaje_fecha', 'montaje_hora_inicio', 'montaje_hora_fin');
    if (v.has_desmontaje) controles.push('desmontaje_fecha', 'desmontaje_hora_inicio', 'desmontaje_hora_fin');
    if (v.has_ensayo) controles.push('ensayo_fecha', 'ensayo_hora_inicio', 'ensayo_hora_fin');
    if (controles.some((nombre) => this.formulario.get(nombre)?.invalid)) {
      return null;
    }

    const fecha = (v.fecha_propuesta ?? '').trim();
    const horaInicio = (v.hora_inicio_propuesta ?? '').trim();
    const horaFin = (v.hora_fin_propuesta ?? '').trim();
    const tiempos = this.armarTiemposTecnicos(v);

    const mismaFranja = (
      activo: boolean,
      fechaProp: string,
      iniProp: string,
      finProp: string,
      activoEv: boolean | undefined,
      fechaEv: string | undefined,
      iniEv: string | undefined,
      finEv: string | undefined
    ) => activo === Boolean(activoEv) && (!activo || (fechaProp === (fechaEv ?? '') && iniProp === (iniEv ?? '') && finProp === (finEv ?? '')));
    const sinCambios =
      fecha === evento.fecha &&
      horaInicio === evento.hora_inicio &&
      horaFin === evento.hora_fin &&
      mismaFranja(tiempos.has_montaje, tiempos.montaje_fecha, tiempos.montaje_hora_inicio, tiempos.montaje_hora_fin, evento.has_montaje, evento.montaje_fecha, evento.montaje_hora_inicio, evento.montaje_hora_fin) &&
      mismaFranja(tiempos.has_desmontaje, tiempos.desmontaje_fecha, tiempos.desmontaje_hora_inicio, tiempos.desmontaje_hora_fin, evento.has_desmontaje, evento.desmontaje_fecha, evento.desmontaje_hora_inicio, evento.desmontaje_hora_fin) &&
      mismaFranja(tiempos.has_ensayo, tiempos.ensayo_fecha, tiempos.ensayo_hora_inicio, tiempos.ensayo_hora_fin, evento.has_ensayo, evento.ensayo_fecha, evento.ensayo_hora_inicio, evento.ensayo_hora_fin);
    if (sinCambios) {
      return null;
    }

    return {
      evento_id: evento.id,
      fecha_propuesta: fecha,
      hora_inicio_propuesta: horaInicio,
      hora_fin_propuesta: horaFin,
      tiempos_tecnicos_propuestos: tiempos,
    };
  }

  /** Tiempos técnicos tal como se envían: las franjas desactivadas van vacías. */
  private armarTiemposTecnicos(valores: ReturnType<typeof this.formulario.getRawValue>): TiemposTecnicosPropuestos {
    const hasMontaje = Boolean(valores.has_montaje);
    const hasDesmontaje = Boolean(valores.has_desmontaje);
    const hasEnsayo = Boolean(valores.has_ensayo);
    return {
      has_montaje: hasMontaje,
      montaje_fecha: hasMontaje ? (valores.montaje_fecha ?? '').trim() : '',
      montaje_hora_inicio: hasMontaje ? (valores.montaje_hora_inicio ?? '').trim() : '',
      montaje_hora_fin: hasMontaje ? (valores.montaje_hora_fin ?? '').trim() : '',
      has_desmontaje: hasDesmontaje,
      desmontaje_fecha: hasDesmontaje ? (valores.desmontaje_fecha ?? '').trim() : '',
      desmontaje_hora_inicio: hasDesmontaje ? (valores.desmontaje_hora_inicio ?? '').trim() : '',
      desmontaje_hora_fin: hasDesmontaje ? (valores.desmontaje_hora_fin ?? '').trim() : '',
      has_ensayo: hasEnsayo,
      ensayo_fecha: hasEnsayo ? (valores.ensayo_fecha ?? '').trim() : '',
      ensayo_hora_inicio: hasEnsayo ? (valores.ensayo_hora_inicio ?? '').trim() : '',
      ensayo_hora_fin: hasEnsayo ? (valores.ensayo_hora_fin ?? '').trim() : '',
    };
  }

  private aplicarValoresIniciales(): void {
    if (!this.eventoActual) {
      return;
    }
    this.intentoEnvio = false;
    if (this.borradorActual && this.borradorActual.evento_id === this.eventoActual.id) {
      const info = this.borradorActual.informacion_general_propuesta;
      const tiempos = this.borradorActual.tiempos_tecnicos_propuestos;
      this.formulario.reset({
        nombre_propuesto: info ? info.nombre : (this.eventoActual.nombre ?? ''),
        contacto_propuesto: info ? info.contacto : (this.eventoActual.contacto ?? ''),
        telefono_propuesto: info ? info.telefono : (this.eventoActual.telefono ?? ''),
        correo_propuesto: info ? info.correo : (this.eventoActual.correo ?? ''),
        observaciones_propuestas: info
          ? info.observaciones
          : (this.eventoActual.observaciones ?? ''),
        fecha_propuesta: this.borradorActual.fecha_propuesta,
        hora_inicio_propuesta: this.borradorActual.hora_inicio_propuesta,
        hora_fin_propuesta: this.borradorActual.hora_fin_propuesta,
        has_montaje: tiempos ? Boolean(tiempos.has_montaje) : Boolean(this.eventoActual.has_montaje),
        montaje_fecha: tiempos ? tiempos.montaje_fecha : (this.eventoActual.montaje_fecha ?? ''),
        montaje_hora_inicio: tiempos ? tiempos.montaje_hora_inicio : (this.eventoActual.montaje_hora_inicio ?? ''),
        montaje_hora_fin: tiempos ? tiempos.montaje_hora_fin : (this.eventoActual.montaje_hora_fin ?? ''),
        has_desmontaje: tiempos ? Boolean(tiempos.has_desmontaje) : Boolean(this.eventoActual.has_desmontaje),
        desmontaje_fecha: tiempos ? tiempos.desmontaje_fecha : (this.eventoActual.desmontaje_fecha ?? ''),
        desmontaje_hora_inicio: tiempos ? tiempos.desmontaje_hora_inicio : (this.eventoActual.desmontaje_hora_inicio ?? ''),
        desmontaje_hora_fin: tiempos ? tiempos.desmontaje_hora_fin : (this.eventoActual.desmontaje_hora_fin ?? ''),
        has_ensayo: tiempos ? Boolean(tiempos.has_ensayo) : Boolean(this.eventoActual.has_ensayo),
        ensayo_fecha: tiempos ? tiempos.ensayo_fecha : (this.eventoActual.ensayo_fecha ?? ''),
        ensayo_hora_inicio: tiempos ? tiempos.ensayo_hora_inicio : (this.eventoActual.ensayo_hora_inicio ?? ''),
        ensayo_hora_fin: tiempos ? tiempos.ensayo_hora_fin : (this.eventoActual.ensayo_hora_fin ?? ''),
        motivo: this.borradorActual.motivo,
      });

      if (this.borradorActual.adicionales_propuestos) {
        const cat = this.catalogo();
        const restaurados: AdicionalItem[] = this.borradorActual.adicionales_propuestos.map((p) => {
          const c = cat.find((item) => item.id === p.id);
          const orig = this.eventoActual?.adicionales?.find((a) => a.id === p.id);
          const nombre = c?.nombre || orig?.nombre || `[Adicional no identificado: ${p.id}]`;
          const tarifa = c?.tarifa_hora ?? orig?.tarifa_hora ?? 0;
          return {
            id: p.id,
            nombre,
            unidad: c?.unidad || orig?.unidad || 'unidad',
            cantidad: p.cantidad,
            horas: p.horas,
            tarifa_hora: tarifa,
            subtotal: Math.round(p.cantidad * p.horas * tarifa * 100) / 100,
          };
        });
        this.formAdicionales.set(restaurados);
      } else if (this.eventoActual.adicionales) {
        this.formAdicionales.set(JSON.parse(JSON.stringify(this.eventoActual.adicionales)));
      } else {
        this.formAdicionales.set([]);
      }
    } else {
      this.formulario.reset({
        nombre_propuesto: this.eventoActual.nombre ?? '',
        contacto_propuesto: this.eventoActual.contacto ?? '',
        telefono_propuesto: this.eventoActual.telefono ?? '',
        correo_propuesto: this.eventoActual.correo ?? '',
        observaciones_propuestas: this.eventoActual.observaciones ?? '',
        fecha_propuesta: this.eventoActual.fecha,
        hora_inicio_propuesta: this.eventoActual.hora_inicio,
        hora_fin_propuesta: this.eventoActual.hora_fin,
        has_montaje: Boolean(this.eventoActual.has_montaje),
        montaje_fecha: this.eventoActual.montaje_fecha ?? '',
        montaje_hora_inicio: this.eventoActual.montaje_hora_inicio ?? '',
        montaje_hora_fin: this.eventoActual.montaje_hora_fin ?? '',
        has_desmontaje: Boolean(this.eventoActual.has_desmontaje),
        desmontaje_fecha: this.eventoActual.desmontaje_fecha ?? '',
        desmontaje_hora_inicio: this.eventoActual.desmontaje_hora_inicio ?? '',
        desmontaje_hora_fin: this.eventoActual.desmontaje_hora_fin ?? '',
        has_ensayo: Boolean(this.eventoActual.has_ensayo),
        ensayo_fecha: this.eventoActual.ensayo_fecha ?? '',
        ensayo_hora_inicio: this.eventoActual.ensayo_hora_inicio ?? '',
        ensayo_hora_fin: this.eventoActual.ensayo_hora_fin ?? '',
        motivo: '',
      });
      if (this.eventoActual.adicionales) {
        this.formAdicionales.set(JSON.parse(JSON.stringify(this.eventoActual.adicionales)));
      } else {
        this.formAdicionales.set([]);
      }
    }
    this.sincronizarCamposFormAdicional();
  }

  restaurarValoresOriginales(): void {
    if (!this.eventoActual) {
      return;
    }
    this.intentoEnvio = false;
    this.borradorActual = null;
    this.formulario.reset({
      nombre_propuesto: this.eventoActual.nombre ?? '',
      contacto_propuesto: this.eventoActual.contacto ?? '',
      telefono_propuesto: this.eventoActual.telefono ?? '',
      correo_propuesto: this.eventoActual.correo ?? '',
      observaciones_propuestas: this.eventoActual.observaciones ?? '',
      fecha_propuesta: this.eventoActual.fecha,
      hora_inicio_propuesta: this.eventoActual.hora_inicio,
      hora_fin_propuesta: this.eventoActual.hora_fin,
      has_montaje: Boolean(this.eventoActual.has_montaje),
      montaje_fecha: this.eventoActual.montaje_fecha ?? '',
      montaje_hora_inicio: this.eventoActual.montaje_hora_inicio ?? '',
      montaje_hora_fin: this.eventoActual.montaje_hora_fin ?? '',
      has_desmontaje: Boolean(this.eventoActual.has_desmontaje),
      desmontaje_fecha: this.eventoActual.desmontaje_fecha ?? '',
      desmontaje_hora_inicio: this.eventoActual.desmontaje_hora_inicio ?? '',
      desmontaje_hora_fin: this.eventoActual.desmontaje_hora_fin ?? '',
      has_ensayo: Boolean(this.eventoActual.has_ensayo),
      ensayo_fecha: this.eventoActual.ensayo_fecha ?? '',
      ensayo_hora_inicio: this.eventoActual.ensayo_hora_inicio ?? '',
      ensayo_hora_fin: this.eventoActual.ensayo_hora_fin ?? '',
      motivo: '',
    });
    if (this.eventoActual.adicionales) {
      this.formAdicionales.set(JSON.parse(JSON.stringify(this.eventoActual.adicionales)));
    } else {
      this.formAdicionales.set([]);
    }
    this.sincronizarCamposFormAdicional();
  }

  formatSoles(monto: number | undefined | null): string {
    return formatSoles(monto);
  }

  obtenerItemCatalogo(id: string): AdicionalCatalogo | undefined {
    return this.catalogo().find((c) => c.id === id);
  }

  readonly itemSeleccionadoCatalogo = computed<AdicionalCatalogo | undefined>(() => {
    return this.obtenerItemCatalogo(this.selAdicionalId());
  });

  readonly itemExistenteEnPropuesta = computed<AdicionalItem | undefined>(() => {
    const id = this.selAdicionalId();
    return this.formAdicionales().find((a) => a.id === id);
  });

  readonly labelUnidadActual = computed<string>(() => {
    return this.itemSeleccionadoCatalogo()?.unidad_label || 'Cantidad de unidades';
  });

  readonly textoBotonAdicional = computed<string>(() => {
    return this.itemExistenteEnPropuesta() ? 'Actualizar adicional' : 'Agregar adicional';
  });

  readonly tarifaActualTexto = computed<string>(() => {
    const item = this.itemSeleccionadoCatalogo();
    return item ? `${formatSoles(item.tarifa_hora)} / h` : 'S/ 0.00 / h';
  });

  readonly subtotalActualTexto = computed<string>(() => {
    const item = this.itemSeleccionadoCatalogo();
    if (!item) return 'S/ 0.00';
    const cant = this.numAdicionalCantidad();
    const horas = this.numAdicionalHoras();
    if (isNaN(cant) || cant < 1 || isNaN(horas) || horas < 1) {
      return 'S/ 0.00';
    }
    const sub = Math.round(cant * horas * item.tarifa_hora * 100) / 100;
    return formatSoles(sub);
  });

  readonly totalAdicionalesTablaTexto = computed<string>(() => {
    const total = this.formAdicionales().reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
    return formatSoles(Math.round(total * 100) / 100);
  });

  sincronizarCamposFormAdicional(): void {
    const cat = this.catalogo();
    if (cat.length === 0) {
      this.errAdicionalForm.set('');
      return;
    }
    let id = this.selAdicionalId();
    if (!cat.some((c) => c.id === id)) {
      id = cat[0].id;
      this.selAdicionalId.set(id);
    }
    const existente = this.formAdicionales().find((a) => a.id === id);
    if (existente) {
      this.numAdicionalCantidad.set(existente.cantidad);
      this.numAdicionalHoras.set(existente.horas);
    } else {
      this.numAdicionalCantidad.set(1);
      this.numAdicionalHoras.set(1);
    }
    this.errAdicionalForm.set('');
  }

  alCambiarSeleccionAdicional(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const nuevoId = select.value;
    this.selAdicionalId.set(nuevoId);
    this.sincronizarCamposFormAdicional();
  }

  alCambiarCantidadAdicional(event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = parseInt(input.value, 10);
    this.numAdicionalCantidad.set(isNaN(val) ? 0 : val);
    this.errAdicionalForm.set('');
  }

  alCambiarHorasAdicional(event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = parseInt(input.value, 10);
    this.numAdicionalHoras.set(isNaN(val) ? 0 : val);
    this.errAdicionalForm.set('');
  }

  agregarOActualizarAdicional(): void {
    this.errAdicionalForm.set('');
    const cat = this.itemSeleccionadoCatalogo();
    if (!cat) return;

    const cant = this.numAdicionalCantidad();
    const horas = this.numAdicionalHoras();

    if (!Number.isInteger(cant) || cant < 1) {
      this.errAdicionalForm.set('La cantidad de unidades debe ser un número entero mayor a 0.');
      return;
    }

    if (!Number.isInteger(horas) || horas < 1) {
      this.errAdicionalForm.set('Las horas de uso deben ser un número entero mayor a 0.');
      return;
    }

    const subtotal = Math.round(cant * horas * cat.tarifa_hora * 100) / 100;

    this.formAdicionales.update((actuales) => {
      const idx = actuales.findIndex((a) => a.id === cat.id);
      const nuevoItem: AdicionalItem = {
        id: cat.id,
        nombre: cat.nombre,
        unidad: cat.unidad || 'unidad',
        cantidad: cant,
        horas: horas,
        tarifa_hora: cat.tarifa_hora,
        subtotal,
      };
      if (idx >= 0) {
        const copia = [...actuales];
        copia[idx] = nuevoItem;
        return copia;
      }
      return [...actuales, nuevoItem];
    });

    this.formulario.updateValueAndValidity();
  }

  editarAdicional(id: string): void {
    this.selAdicionalId.set(id);
    this.sincronizarCamposFormAdicional();
  }

  eliminarAdicional(id: string): void {
    this.formAdicionales.update((actuales) => actuales.filter((a) => a.id !== id));
    this.sincronizarCamposFormAdicional();
    this.formulario.updateValueAndValidity();
  }

  alCambiarMontaje(): void {
    const activo = Boolean(this.formulario.get('has_montaje')?.value);
    if (!activo) {
      return;
    }
    const fechaActual = (this.formulario.get('fecha_propuesta')?.value ?? this.eventoActual?.fecha ?? '').trim();
    if (!this.formulario.get('montaje_fecha')?.value && fechaActual) {
      this.formulario.patchValue({ montaje_fecha: fechaActual });
    }
    const evInicio = (this.formulario.get('hora_inicio_propuesta')?.value ?? this.eventoActual?.hora_inicio ?? '').trim();
    const mIni = (this.formulario.get('montaje_hora_inicio')?.value ?? '').trim();
    const mFin = (this.formulario.get('montaje_hora_fin')?.value ?? '').trim();
    if (!mIni && !mFin && evInicio && /^\d{2}:\d{2}$/.test(evInicio)) {
      const [h, m] = evInicio.split(':').map(Number);
      const minTotal = h * 60 + m;
      const defaultIniMin = Math.max(6 * 60, minTotal - 60);
      const defaultFinMin = minTotal;
      const pad = (n: number) => String(n).padStart(2, '0');
      const iniStr = `${pad(Math.floor(defaultIniMin / 60))}:${pad(defaultIniMin % 60)}`;
      const finStr = `${pad(Math.floor(defaultFinMin / 60))}:${pad(defaultFinMin % 60)}`;
      this.formulario.patchValue({
        montaje_hora_inicio: iniStr,
        montaje_hora_fin: finStr,
      });
    }
  }

  alCambiarDesmontaje(): void {
    const activo = Boolean(this.formulario.get('has_desmontaje')?.value);
    if (!activo) {
      return;
    }
    const fechaActual = (this.formulario.get('fecha_propuesta')?.value ?? this.eventoActual?.fecha ?? '').trim();
    if (!this.formulario.get('desmontaje_fecha')?.value && fechaActual) {
      this.formulario.patchValue({ desmontaje_fecha: fechaActual });
    }
    const evFin = (this.formulario.get('hora_fin_propuesta')?.value ?? this.eventoActual?.hora_fin ?? '').trim();
    const dIni = (this.formulario.get('desmontaje_hora_inicio')?.value ?? '').trim();
    const dFin = (this.formulario.get('desmontaje_hora_fin')?.value ?? '').trim();
    if (!dIni && !dFin && evFin && /^\d{2}:\d{2}$/.test(evFin)) {
      const [h, m] = evFin.split(':').map(Number);
      const minTotal = h * 60 + m;
      const defaultIniMin = minTotal;
      const defaultFinMin = Math.min(22 * 60, minTotal + 60);
      const pad = (n: number) => String(n).padStart(2, '0');
      const iniStr = `${pad(Math.floor(defaultIniMin / 60))}:${pad(defaultIniMin % 60)}`;
      const finStr = `${pad(Math.floor(defaultFinMin / 60))}:${pad(defaultFinMin % 60)}`;
      this.formulario.patchValue({
        desmontaje_hora_inicio: iniStr,
        desmontaje_hora_fin: finStr,
      });
    }
  }

  alCambiarEnsayo(): void {
    const activo = Boolean(this.formulario.get('has_ensayo')?.value);
    if (!activo) {
      return;
    }
    const fechaActual = (this.formulario.get('fecha_propuesta')?.value ?? this.eventoActual?.fecha ?? '').trim();
    if (!this.formulario.get('ensayo_fecha')?.value && fechaActual) {
      this.formulario.patchValue({ ensayo_fecha: fechaActual });
    }
    const eIni = (this.formulario.get('ensayo_hora_inicio')?.value ?? '').trim();
    const eFin = (this.formulario.get('ensayo_hora_fin')?.value ?? '').trim();
    if (!eIni && !eFin) {
      const mIni = (this.formulario.get('montaje_hora_inicio')?.value ?? '').trim();
      const evIni = (this.formulario.get('hora_inicio_propuesta')?.value ?? this.eventoActual?.hora_inicio ?? '').trim();
      const referencia = mIni && this.formulario.get('has_montaje')?.value ? mIni : evIni;
      if (referencia && /^\d{2}:\d{2}$/.test(referencia)) {
        const [h, m] = referencia.split(':').map(Number);
        const minRef = h * 60 + m;
        const defaultIniMin = Math.max(6 * 60, minRef - 60);
        const defaultFinMin = minRef;
        const pad = (n: number) => String(n).padStart(2, '0');
        const iniStr = `${pad(Math.floor(defaultIniMin / 60))}:${pad(defaultIniMin % 60)}`;
        const finStr = `${pad(Math.floor(defaultFinMin / 60))}:${pad(defaultFinMin % 60)}`;
        this.formulario.patchValue({
          ensayo_hora_inicio: iniStr,
          ensayo_hora_fin: finStr,
        });
      }
    }
  }

  get nombreModificado(): boolean {
    if (!this.eventoActual) {
      return false;
    }
    const actual = (this.formulario.get('nombre_propuesto')?.value ?? '').trim();
    const orig = (this.eventoActual.nombre ?? '').trim();
    return actual !== orig;
  }

  get contactoModificado(): boolean {
    if (!this.eventoActual) {
      return false;
    }
    const actual = (this.formulario.get('contacto_propuesto')?.value ?? '').trim();
    const orig = (this.eventoActual.contacto ?? '').trim();
    return actual !== orig;
  }

  get telefonoModificado(): boolean {
    if (!this.eventoActual) {
      return false;
    }
    const actual = (this.formulario.get('telefono_propuesto')?.value ?? '').trim();
    const orig = (this.eventoActual.telefono ?? '').trim();
    return actual !== orig;
  }

  get correoModificado(): boolean {
    if (!this.eventoActual) {
      return false;
    }
    const actual = (this.formulario.get('correo_propuesto')?.value ?? '').trim();
    const orig = (this.eventoActual.correo ?? '').trim();
    return actual !== orig;
  }

  get observacionesModificadas(): boolean {
    if (!this.eventoActual) {
      return false;
    }
    const actual = (this.formulario.get('observaciones_propuestas')?.value ?? '').trim();
    const orig = (this.eventoActual.observaciones ?? '').trim();
    return actual !== orig;
  }

  get fechaModificada(): boolean {
    if (!this.eventoActual) {
      return false;
    }
    const actual = (this.formulario.get('fecha_propuesta')?.value ?? '').trim();
    return actual !== '' && actual !== this.eventoActual.fecha;
  }

  get horaInicioModificada(): boolean {
    if (!this.eventoActual) {
      return false;
    }
    const actual = (this.formulario.get('hora_inicio_propuesta')?.value ?? '').trim();
    return actual !== '' && actual !== this.eventoActual.hora_inicio;
  }

  get horaFinModificada(): boolean {
    if (!this.eventoActual) {
      return false;
    }
    const actual = (this.formulario.get('hora_fin_propuesta')?.value ?? '').trim();
    return actual !== '' && actual !== this.eventoActual.hora_fin;
  }

  get montajeFechaModificada(): boolean {
    if (!this.eventoActual || !this.formulario.get('has_montaje')?.value) {
      return false;
    }
    const act = (this.formulario.get('montaje_fecha')?.value ?? '').trim();
    const orig = (this.eventoActual.montaje_fecha ?? '').trim();
    return Boolean(this.eventoActual.has_montaje && act !== '' && act !== orig);
  }

  get montajeInicioModificado(): boolean {
    if (!this.eventoActual || !this.formulario.get('has_montaje')?.value) {
      return false;
    }
    const act = (this.formulario.get('montaje_hora_inicio')?.value ?? '').trim();
    const orig = (this.eventoActual.montaje_hora_inicio ?? '').trim();
    return Boolean(this.eventoActual.has_montaje && act !== '' && act !== orig);
  }

  get montajeFinModificado(): boolean {
    if (!this.eventoActual || !this.formulario.get('has_montaje')?.value) {
      return false;
    }
    const act = (this.formulario.get('montaje_hora_fin')?.value ?? '').trim();
    const orig = (this.eventoActual.montaje_hora_fin ?? '').trim();
    return Boolean(this.eventoActual.has_montaje && act !== '' && act !== orig);
  }

  get desmontajeFechaModificada(): boolean {
    if (!this.eventoActual || !this.formulario.get('has_desmontaje')?.value) {
      return false;
    }
    const act = (this.formulario.get('desmontaje_fecha')?.value ?? '').trim();
    const orig = (this.eventoActual.desmontaje_fecha ?? '').trim();
    return Boolean(this.eventoActual.has_desmontaje && act !== '' && act !== orig);
  }

  get desmontajeInicioModificado(): boolean {
    if (!this.eventoActual || !this.formulario.get('has_desmontaje')?.value) {
      return false;
    }
    const act = (this.formulario.get('desmontaje_hora_inicio')?.value ?? '').trim();
    const orig = (this.eventoActual.desmontaje_hora_inicio ?? '').trim();
    return Boolean(this.eventoActual.has_desmontaje && act !== '' && act !== orig);
  }

  get desmontajeFinModificado(): boolean {
    if (!this.eventoActual || !this.formulario.get('has_desmontaje')?.value) {
      return false;
    }
    const act = (this.formulario.get('desmontaje_hora_fin')?.value ?? '').trim();
    const orig = (this.eventoActual.desmontaje_hora_fin ?? '').trim();
    return Boolean(this.eventoActual.has_desmontaje && act !== '' && act !== orig);
  }

  get ensayoFechaModificada(): boolean {
    if (!this.eventoActual || !this.formulario.get('has_ensayo')?.value) {
      return false;
    }
    const act = (this.formulario.get('ensayo_fecha')?.value ?? '').trim();
    const orig = (this.eventoActual.ensayo_fecha ?? '').trim();
    return Boolean(this.eventoActual.has_ensayo && act !== '' && act !== orig);
  }

  get ensayoInicioModificado(): boolean {
    if (!this.eventoActual || !this.formulario.get('has_ensayo')?.value) {
      return false;
    }
    const act = (this.formulario.get('ensayo_hora_inicio')?.value ?? '').trim();
    const orig = (this.eventoActual.ensayo_hora_inicio ?? '').trim();
    return Boolean(this.eventoActual.has_ensayo && act !== '' && act !== orig);
  }

  get ensayoFinModificado(): boolean {
    if (!this.eventoActual || !this.formulario.get('has_ensayo')?.value) {
      return false;
    }
    const act = (this.formulario.get('ensayo_hora_fin')?.value ?? '').trim();
    const orig = (this.eventoActual.ensayo_hora_fin ?? '').trim();
    return Boolean(this.eventoActual.has_ensayo && act !== '' && act !== orig);
  }

  get ensayoAgregadoModificado(): boolean {
    return Boolean(this.formulario.get('has_ensayo')?.value && !this.eventoActual?.has_ensayo);
  }

  get longitudNombreUnicode(): number {
    return contarRunasUnicode(this.formulario.get('nombre_propuesto')?.value);
  }

  get longitudContactoUnicode(): number {
    return contarRunasUnicode(this.formulario.get('contacto_propuesto')?.value);
  }

  get longitudTelefonoUnicode(): number {
    return contarRunasUnicode(this.formulario.get('telefono_propuesto')?.value);
  }

  get longitudCorreoUnicode(): number {
    return contarRunasUnicode(this.formulario.get('correo_propuesto')?.value);
  }

  get longitudObservacionesUnicode(): number {
    return contarRunasUnicode(this.formulario.get('observaciones_propuestas')?.value);
  }

  get longitudMotivoUnicode(): number {
    return contarRunasUnicode(this.formulario.get('motivo')?.value);
  }

  tieneCambiosEnBorrador(): boolean {
    if (!this.eventoActual) {
      return false;
    }
    const motivoLimpio = (this.formulario.get('motivo')?.value ?? '').trim();
    const tieneCambioMontaje =
      Boolean(this.formulario.get('has_montaje')?.value) !== Boolean(this.eventoActual.has_montaje) ||
      (Boolean(this.formulario.get('has_montaje')?.value) && (
        (this.formulario.get('montaje_fecha')?.value ?? '').trim() !== (this.eventoActual.montaje_fecha ?? '') ||
        (this.formulario.get('montaje_hora_inicio')?.value ?? '').trim() !== (this.eventoActual.montaje_hora_inicio ?? '') ||
        (this.formulario.get('montaje_hora_fin')?.value ?? '').trim() !== (this.eventoActual.montaje_hora_fin ?? '')
      ));

    const tieneCambioDesmontaje =
      Boolean(this.formulario.get('has_desmontaje')?.value) !== Boolean(this.eventoActual.has_desmontaje) ||
      (Boolean(this.formulario.get('has_desmontaje')?.value) && (
        (this.formulario.get('desmontaje_fecha')?.value ?? '').trim() !== (this.eventoActual.desmontaje_fecha ?? '') ||
        (this.formulario.get('desmontaje_hora_inicio')?.value ?? '').trim() !== (this.eventoActual.desmontaje_hora_inicio ?? '') ||
        (this.formulario.get('desmontaje_hora_fin')?.value ?? '').trim() !== (this.eventoActual.desmontaje_hora_fin ?? '')
      ));

    const tieneCambioEnsayo =
      Boolean(this.formulario.get('has_ensayo')?.value) !== Boolean(this.eventoActual.has_ensayo) ||
      (Boolean(this.formulario.get('has_ensayo')?.value) && (
        (this.formulario.get('ensayo_fecha')?.value ?? '').trim() !== (this.eventoActual.ensayo_fecha ?? '') ||
        (this.formulario.get('ensayo_hora_inicio')?.value ?? '').trim() !== (this.eventoActual.ensayo_hora_inicio ?? '') ||
        (this.formulario.get('ensayo_hora_fin')?.value ?? '').trim() !== (this.eventoActual.ensayo_hora_fin ?? '')
      ));

    const tieneCambioAdicionales = !sonAdicionalesIguales(
      this.eventoActual.adicionales,
      this.formAdicionales()
    );

    return (
      this.nombreModificado ||
      this.contactoModificado ||
      this.telefonoModificado ||
      this.correoModificado ||
      this.observacionesModificadas ||
      this.fechaModificada ||
      this.horaInicioModificada ||
      this.horaFinModificada ||
      tieneCambioMontaje ||
      tieneCambioDesmontaje ||
      tieneCambioEnsayo ||
      tieneCambioAdicionales ||
      motivoLimpio.length > 0
    );
  }

  private calcularDuracionMinutos(ini?: string | null, fin?: string | null): string {
    if (!ini || !fin || !/^\d{2}:\d{2}$/.test(ini) || !/^\d{2}:\d{2}$/.test(fin)) {
      return '';
    }
    const [h1, m1] = ini.split(':').map(Number);
    const [h2, m2] = fin.split(':').map(Number);
    const minDiff = h2 * 60 + m2 - (h1 * 60 + m1);
    if (minDiff <= 0) return '';
    const horas = Math.floor(minDiff / 60);
    const minutos = minDiff % 60;
    if (horas > 0 && minutos > 0) {
      return `${horas} h ${minutos} min`;
    }
    if (horas > 0) {
      return `${horas} h`;
    }
    return `${minutos} min`;
  }

  obtenerDuracionPropuesta(): string {
    return this.calcularDuracionMinutos(
      this.formulario.get('hora_inicio_propuesta')?.value,
      this.formulario.get('hora_fin_propuesta')?.value
    );
  }

  obtenerDuracionMontaje(): string {
    return this.calcularDuracionMinutos(
      this.formulario.get('montaje_hora_inicio')?.value,
      this.formulario.get('montaje_hora_fin')?.value
    );
  }

  obtenerDuracionDesmontaje(): string {
    return this.calcularDuracionMinutos(
      this.formulario.get('desmontaje_hora_inicio')?.value,
      this.formulario.get('desmontaje_hora_fin')?.value
    );
  }

  obtenerDuracionEnsayo(): string {
    return this.calcularDuracionMinutos(
      this.formulario.get('ensayo_hora_inicio')?.value,
      this.formulario.get('ensayo_hora_fin')?.value
    );
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
      Boolean(this.formulario.get('nombre_propuesto')?.dirty) ||
      Boolean(this.formulario.get('contacto_propuesto')?.dirty) ||
      Boolean(this.formulario.get('telefono_propuesto')?.dirty) ||
      Boolean(this.formulario.get('correo_propuesto')?.dirty) ||
      Boolean(this.formulario.get('observaciones_propuestas')?.dirty) ||
      Boolean(this.formulario.get('fecha_propuesta')?.dirty) ||
      Boolean(this.formulario.get('hora_inicio_propuesta')?.dirty) ||
      Boolean(this.formulario.get('hora_fin_propuesta')?.dirty) ||
      Boolean(this.formulario.get('has_montaje')?.dirty) ||
      Boolean(this.formulario.get('montaje_fecha')?.dirty) ||
      Boolean(this.formulario.get('montaje_hora_inicio')?.dirty) ||
      Boolean(this.formulario.get('montaje_hora_fin')?.dirty) ||
      Boolean(this.formulario.get('has_desmontaje')?.dirty) ||
      Boolean(this.formulario.get('desmontaje_fecha')?.dirty) ||
      Boolean(this.formulario.get('desmontaje_hora_inicio')?.dirty) ||
      Boolean(this.formulario.get('desmontaje_hora_fin')?.dirty) ||
      Boolean(this.formulario.get('has_ensayo')?.dirty) ||
      Boolean(this.formulario.get('ensayo_fecha')?.dirty) ||
      Boolean(this.formulario.get('ensayo_hora_inicio')?.dirty) ||
      Boolean(this.formulario.get('ensayo_hora_fin')?.dirty)
    );
  }

  alSolicitarVolver(): void {
    this.solicitarVolver.emit(this.tieneCambiosEnBorrador());
  }

  alSolicitarDescartar(): void {
    if (this.tieneCambiosEnBorrador()) {
      this.solicitarDescartar.emit(true);
    }
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
    const hasMontaje = Boolean(valores.has_montaje);
    const hasDesmontaje = Boolean(valores.has_desmontaje);
    const hasEnsayo = Boolean(valores.has_ensayo);

    if (this.formAdicionales().length > 0) {
      const cat = this.catalogo();
      if (cat.length === 0) {
        this.errAdicionalForm.set(
          'El catálogo de adicionales no está disponible. No se puede continuar con la propuesta.'
        );
        return;
      }
      const itemDesconocido = this.formAdicionales().find((a) => !cat.some((c) => c.id === a.id));
      if (itemDesconocido) {
        this.errAdicionalForm.set(
          `El adicional '${itemDesconocido.nombre || itemDesconocido.id}' no existe en el catálogo de servicios.`
        );
        return;
      }
    }

    const payload: SolicitudCreacionPayload = {
      evento_id: this.eventoActual.id,
      motivo: (valores.motivo ?? '').trim(),
      fecha_propuesta: (valores.fecha_propuesta ?? '').trim(),
      hora_inicio_propuesta: (valores.hora_inicio_propuesta ?? '').trim(),
      hora_fin_propuesta: (valores.hora_fin_propuesta ?? '').trim(),
      informacion_general_propuesta: {
        nombre: (valores.nombre_propuesto ?? '').trim(),
        contacto: (valores.contacto_propuesto ?? '').trim(),
        telefono: (valores.telefono_propuesto ?? '').trim(),
        correo: (valores.correo_propuesto ?? '').trim(),
        observaciones: (valores.observaciones_propuestas ?? '').trim(),
      },
      tiempos_tecnicos_propuestos: this.armarTiemposTecnicos(valores),
      adicionales_propuestos: this.formAdicionales().map((a) => ({
        id: a.id,
        cantidad: a.cantidad,
        horas: a.horas,
      })),
    };

    this.continuarRevision.emit(payload);
    this.enviarSolicitud.emit(payload);
  }
}
