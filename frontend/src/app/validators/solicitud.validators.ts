import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { AdicionalItem, Evento, sonAdicionalesIguales } from '../models/gestor-eventos.models';

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HORA_REGEX = /^\d{2}:\d{2}$/;
const CORREO_BASICO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MINUTOS_MIN = 6 * 60;  // 06:00
const MINUTOS_MAX = 22 * 60; // 22:00

/**
 * Cuenta los puntos de código Unicode tras recortar espacios externos,
 * de forma coherente con utf8.RuneCountInString(strings.TrimSpace(s)) en Go.
 */
export function contarRunasUnicode(valor: string | null | undefined): number {
  if (!valor) {
    return 0;
  }
  return Array.from(valor.trim()).length;
}

export const contarRunasMotivo = contarRunasUnicode;

/**
 * Comprueba que un correo electrónico no vacío tenga un formato sintáctico válido,
 * con la misma regla determinista que esCorreoValido en el backend Go.
 */
export function esCorreoFormatoValido(correoRaw: string | null | undefined): boolean {
  const correo = (correoRaw ?? '').trim();
  if (!correo) {
    return true;
  }
  if (!CORREO_BASICO_REGEX.test(correo) || correo.includes('..')) {
    return false;
  }
  const partes = correo.split('@');
  if (partes.length !== 2) {
    return false;
  }
  const [local, dominio] = partes;
  if (
    local.startsWith('.') ||
    local.endsWith('.') ||
    dominio.startsWith('.') ||
    dominio.endsWith('.')
  ) {
    return false;
  }
  const etiquetas = dominio.split('.');
  if (etiquetas.length < 2) {
    return false;
  }
  for (const et of etiquetas) {
    if (!et || et.startsWith('-') || et.endsWith('-')) {
      return false;
    }
  }
  return true;
}

/**
 * Convierte una cadena en formato estricto HH:mm a minutos desde medianoche,
 * o devuelve null si el formato o la hora no son válidos.
 */
export function parsearHoraAMinutos(horaRaw: string | null | undefined): number | null {
  if (!horaRaw) {
    return null;
  }
  const limpia = horaRaw.trim();
  if (!HORA_REGEX.test(limpia)) {
    return null;
  }
  const partes = limpia.split(':');
  const horas = Number(partes[0]);
  const minutos = Number(partes[1]);
  if (
    !Number.isInteger(horas) ||
    !Number.isInteger(minutos) ||
    horas < 0 ||
    horas > 23 ||
    minutos < 0 ||
    minutos > 59
  ) {
    return null;
  }
  return horas * 60 + minutos;
}

/**
 * Valida si una cadena tiene formato YYYY-MM-DD y corresponde a una fecha calendario real.
 */
export function esFechaCalendarioValida(valor: string | null | undefined): boolean {
  if (!valor) return false;
  const limpia = valor.trim();
  if (!FECHA_REGEX.test(limpia)) return false;
  const [anioStr, mesStr, diaStr] = limpia.split('-');
  const anio = Number(anioStr);
  const mes = Number(mesStr);
  const dia = Number(diaStr);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return false;
  }
  const fechaUTC = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fechaUTC.getUTCFullYear() === anio &&
    fechaUTC.getUTCMonth() + 1 === mes &&
    fechaUTC.getUTCDate() === dia
  );
}

/**
 * Valida que la fecha tenga formato YYYY-MM-DD y corresponda a una fecha calendario válida
 * sin aplicar desplazamientos por zona horaria ni prohibir fechas pasadas.
 */
export function fechaFormatoValidoValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const valor = (control.value ?? '').toString().trim();
    if (!valor) {
      return null; // Validators.required se encarga del vacío
    }
    if (!esFechaCalendarioValida(valor)) {
      return { formatoFecha: true };
    }
    return null;
  };
}

/**
 * Valida un campo de texto obligatorio tras recortar espacios y verifica su límite de puntos de código Unicode.
 */
export function textoObligatorioUnicodeValidator(
  maxRunas: number,
  claveErrorVacio = 'textoVacio'
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = (control.value ?? '').toString();
    const limpio = raw.trim();
    if (limpio.length === 0) {
      return { [claveErrorVacio]: true };
    }
    const totalRunas = Array.from(limpio).length;
    if (totalRunas > maxRunas) {
      return {
        maximoUnicode: {
          max: maxRunas,
          actual: totalRunas,
        },
      };
    }
    return null;
  };
}

/**
 * Valida que el motivo no quede vacío tras quitar espacios y no supere el máximo de caracteres Unicode.
 */
export function motivoUnicodeValidator(maxRunas = 400): ValidatorFn {
  return textoObligatorioUnicodeValidator(maxRunas, 'motivoVacio');
}

/**
 * Valida un campo de texto opcional tras recortar espacios, comprobando únicamente su límite Unicode.
 */
export function textoOpcionalUnicodeValidator(maxRunas: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = (control.value ?? '').toString();
    const limpio = raw.trim();
    if (limpio.length === 0) {
      return null;
    }
    const totalRunas = Array.from(limpio).length;
    if (totalRunas > maxRunas) {
      return {
        maximoUnicode: {
          max: maxRunas,
          actual: totalRunas,
        },
      };
    }
    return null;
  };
}

/**
 * Valida un correo electrónico opcional: permite cadena vacía tras trim, verifica máximo Unicode (80)
 * y formato válido cuando tiene contenido.
 */
export function correoOpcionalValidator(maxRunas = 80): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = (control.value ?? '').toString();
    const limpio = raw.trim();
    if (limpio.length === 0) {
      return null;
    }
    const totalRunas = Array.from(limpio).length;
    if (totalRunas > maxRunas) {
      return {
        maximoUnicode: {
          max: maxRunas,
          actual: totalRunas,
        },
      };
    }
    if (!esCorreoFormatoValido(limpio)) {
      return { formatoCorreo: true };
    }
    return null;
  };
}

/**
 * Valida que una hora cumpla el formato estricto HH:mm y esté entre 06:00 y 22:00 inclusive.
 */
export function horaFormatoYRangoValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const valor = (control.value ?? '').toString().trim();
    if (!valor) {
      return null; // Validators.required se encarga del vacío
    }
    const minutos = parsearHoraAMinutos(valor);
    if (minutos === null) {
      return { formatoHora: true };
    }
    if (minutos < MINUTOS_MIN || minutos > MINUTOS_MAX) {
      return { rangoHorario: true };
    }
    return null;
  };
}

export interface DatosHorarioEvento {
  fecha?: string | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  has_montaje?: boolean | null;
  montaje_fecha?: string | null;
  montaje_hora_inicio?: string | null;
  montaje_hora_fin?: string | null;
  has_desmontaje?: boolean | null;
  desmontaje_fecha?: string | null;
  desmontaje_hora_inicio?: string | null;
  desmontaje_hora_fin?: string | null;
  has_ensayo?: boolean | null;
  ensayo_fecha?: string | null;
  ensayo_hora_inicio?: string | null;
  ensayo_hora_fin?: string | null;
}

export interface ErrorHorarioCampo {
  campo: string;
  mensaje: string;
}

export interface ResultadoValidacionHorarios {
  esValido: boolean;
  errores: ErrorHorarioCampo[];
  erroresPorCampo: Record<string, string>;
  primerCampoInvalido: string | null;
}

/**
 * Validador centralizado y determinista de coherencia de horarios compartida entre Cliente y Asesor.
 * Comprueba formato estricto HH:mm, rango 06:00-22:00, orden cronológico, franjas técnicas en el mismo día,
 * no solapamientos entre actividades y límites exactos de franjas contiguas.
 */
export function validarCoherenciaHorarios(
  datos: DatosHorarioEvento | null | undefined
): ResultadoValidacionHorarios {
  const errores: ErrorHorarioCampo[] = [];
  const erroresPorCampo: Record<string, string> = {};

  const registrarError = (campo: string, mensaje: string) => {
    errores.push({ campo, mensaje });
    if (!erroresPorCampo[campo]) {
      erroresPorCampo[campo] = mensaje;
    }
  };

  const fecha = (datos?.fecha ?? '').trim();
  if (!fecha) {
    registrarError('eventDate', 'La fecha del evento es obligatoria.');
  } else if (!esFechaCalendarioValida(fecha)) {
    registrarError('eventDate', 'La fecha del evento no tiene un formato válido (AAAA-MM-DD).');
  }

  const hIni = (datos?.hora_inicio ?? '').trim();
  let minIni: number | null = null;
  if (!hIni) {
    registrarError('eventStartTime', 'La hora de inicio del evento es obligatoria.');
  } else {
    minIni = parsearHoraAMinutos(hIni);
    if (minIni === null) {
      registrarError('eventStartTime', 'La hora de inicio del evento debe tener formato HH:mm válido.');
    } else if (minIni < MINUTOS_MIN || minIni > MINUTOS_MAX) {
      registrarError('eventStartTime', 'La hora de inicio del evento debe estar entre las 06:00 y las 22:00.');
    }
  }

  const hFin = (datos?.hora_fin ?? '').trim();
  let minFin: number | null = null;
  if (!hFin) {
    registrarError('eventEndTime', 'La hora de fin del evento es obligatoria.');
  } else {
    minFin = parsearHoraAMinutos(hFin);
    if (minFin === null) {
      registrarError('eventEndTime', 'La hora de fin del evento debe tener formato HH:mm válido.');
    } else if (minFin < MINUTOS_MIN || minFin > MINUTOS_MAX) {
      registrarError('eventEndTime', 'La hora de fin del evento debe estar entre las 06:00 y las 22:00.');
    }
  }

  if (minIni !== null && minFin !== null && minIni >= minFin) {
    registrarError('eventStartTime', 'La hora de inicio del evento debe ser anterior a la hora de fin.');
  }

  // Actividades técnicas (ignorar si están desactivadas)
  const hasMontaje = Boolean(datos?.has_montaje);
  let minMIni: number | null = null;
  let minMFin: number | null = null;

  if (hasMontaje) {
    const mFecha = (datos?.montaje_fecha ?? '').trim();
    if (!mFecha) {
      registrarError('montajeDate', 'La fecha de montaje es obligatoria.');
    } else if (!esFechaCalendarioValida(mFecha)) {
      registrarError('montajeDate', 'La fecha de montaje no tiene un formato válido (AAAA-MM-DD).');
    } else if (fecha && mFecha !== fecha) {
      registrarError('montajeDate', 'El montaje debe realizarse en el mismo día del evento.');
    }

    const mHIni = (datos?.montaje_hora_inicio ?? '').trim();
    if (!mHIni) {
      registrarError('montajeStartTime', 'La hora de inicio del montaje es obligatoria.');
    } else {
      minMIni = parsearHoraAMinutos(mHIni);
      if (minMIni === null) {
        registrarError('montajeStartTime', 'La hora de inicio del montaje debe tener formato HH:mm válido.');
      } else if (minMIni < MINUTOS_MIN || minMIni > MINUTOS_MAX) {
        registrarError('montajeStartTime', 'La hora de inicio del montaje debe estar entre las 06:00 y las 22:00.');
      }
    }

    const mHFin = (datos?.montaje_hora_fin ?? '').trim();
    if (!mHFin) {
      registrarError('montajeEndTime', 'La hora de fin del montaje es obligatoria.');
    } else {
      minMFin = parsearHoraAMinutos(mHFin);
      if (minMFin === null) {
        registrarError('montajeEndTime', 'La hora de fin del montaje debe tener formato HH:mm válido.');
      } else if (minMFin < MINUTOS_MIN || minMFin > MINUTOS_MAX) {
        registrarError('montajeEndTime', 'La hora de fin del montaje debe estar entre las 06:00 y las 22:00.');
      }
    }

    if (minMIni !== null && minMFin !== null && minMIni >= minMFin) {
      registrarError('montajeStartTime', 'La hora de inicio del montaje debe ser anterior a la hora de fin.');
    }

    if (minMFin !== null && minIni !== null && minMFin > minIni) {
      registrarError('montajeEndTime', 'El montaje debe finalizar antes o al comenzar el evento.');
    }
  }

  const hasDesmontaje = Boolean(datos?.has_desmontaje);
  let minDIni: number | null = null;
  let minDFin: number | null = null;

  if (hasDesmontaje) {
    const dFecha = (datos?.desmontaje_fecha ?? '').trim();
    if (!dFecha) {
      registrarError('desmontajeDate', 'La fecha de desmontaje es obligatoria.');
    } else if (!esFechaCalendarioValida(dFecha)) {
      registrarError('desmontajeDate', 'La fecha de desmontaje no tiene un formato válido (AAAA-MM-DD).');
    } else if (fecha && dFecha !== fecha) {
      registrarError('desmontajeDate', 'El desmontaje debe realizarse en el mismo día del evento.');
    }

    const dHIni = (datos?.desmontaje_hora_inicio ?? '').trim();
    if (!dHIni) {
      registrarError('desmontajeStartTime', 'La hora de inicio del desmontaje es obligatoria.');
    } else {
      minDIni = parsearHoraAMinutos(dHIni);
      if (minDIni === null) {
        registrarError('desmontajeStartTime', 'La hora de inicio del desmontaje debe tener formato HH:mm válido.');
      } else if (minDIni < MINUTOS_MIN || minDIni > MINUTOS_MAX) {
        registrarError('desmontajeStartTime', 'La hora de inicio del desmontaje debe estar entre las 06:00 y las 22:00.');
      }
    }

    const dHFin = (datos?.desmontaje_hora_fin ?? '').trim();
    if (!dHFin) {
      registrarError('desmontajeEndTime', 'La hora de fin del desmontaje es obligatoria.');
    } else {
      minDFin = parsearHoraAMinutos(dHFin);
      if (minDFin === null) {
        registrarError('desmontajeEndTime', 'La hora de fin del desmontaje debe tener formato HH:mm válido.');
      } else if (minDFin < MINUTOS_MIN || minDFin > MINUTOS_MAX) {
        registrarError('desmontajeEndTime', 'La hora de fin del desmontaje debe estar entre las 06:00 y las 22:00.');
      }
    }

    if (minDIni !== null && minDFin !== null && minDIni >= minDFin) {
      registrarError('desmontajeStartTime', 'La hora de inicio del desmontaje debe ser anterior a la hora de fin.');
    }

    if (minDIni !== null && minFin !== null && minDIni < minFin) {
      registrarError('desmontajeStartTime', 'El desmontaje debe iniciar al concluir o después de finalizar el evento.');
    }
  }

  const hasEnsayo = Boolean(datos?.has_ensayo);
  let minEIni: number | null = null;
  let minEFin: number | null = null;

  if (hasEnsayo) {
    const eFecha = (datos?.ensayo_fecha ?? '').trim();
    if (!eFecha) {
      registrarError('ensayoDate', 'La fecha de ensayo es obligatoria.');
    } else if (!esFechaCalendarioValida(eFecha)) {
      registrarError('ensayoDate', 'La fecha de ensayo no tiene un formato válido (AAAA-MM-DD).');
    } else if (fecha && eFecha !== fecha) {
      registrarError('ensayoDate', 'El ensayo debe realizarse en el mismo día del evento.');
    }

    const eHIni = (datos?.ensayo_hora_inicio ?? '').trim();
    if (!eHIni) {
      registrarError('ensayoStartTime', 'La hora de inicio del ensayo es obligatoria.');
    } else {
      minEIni = parsearHoraAMinutos(eHIni);
      if (minEIni === null) {
        registrarError('ensayoStartTime', 'La hora de inicio del ensayo debe tener formato HH:mm válido.');
      } else if (minEIni < MINUTOS_MIN || minEIni > MINUTOS_MAX) {
        registrarError('ensayoStartTime', 'La hora de inicio del ensayo debe estar entre las 06:00 y las 22:00.');
      }
    }

    const eHFin = (datos?.ensayo_hora_fin ?? '').trim();
    if (!eHFin) {
      registrarError('ensayoEndTime', 'La hora de fin del ensayo es obligatoria.');
    } else {
      minEFin = parsearHoraAMinutos(eHFin);
      if (minEFin === null) {
        registrarError('ensayoEndTime', 'La hora de fin del ensayo debe tener formato HH:mm válido.');
      } else if (minEFin < MINUTOS_MIN || minEFin > MINUTOS_MAX) {
        registrarError('ensayoEndTime', 'La hora de fin del ensayo debe estar entre las 06:00 y las 22:00.');
      }
    }

    if (minEIni !== null && minEFin !== null && minEIni >= minEFin) {
      registrarError('ensayoStartTime', 'La hora de inicio del ensayo debe ser anterior a la hora de fin.');
    }

    if (minEFin !== null && minIni !== null && minEFin > minIni) {
      registrarError('ensayoEndTime', 'El ensayo debe finalizar antes o al comenzar el evento.');
    }

    if (hasMontaje && minEIni !== null && minEFin !== null && minMIni !== null && minMFin !== null) {
      if (!(minEFin <= minMIni || minEIni >= minMFin)) {
        registrarError('ensayoStartTime', 'El ensayo técnico no debe solaparse con la franja de montaje.');
      }
    }
  }

  const esValido = errores.length === 0;
  return {
    esValido,
    errores,
    erroresPorCampo,
    primerCampoInvalido: errores.length > 0 ? errores[0].campo : null,
  };
}

/**
 * Validador de grupo para comprobar:
 * 1) Que la hora de inicio sea estrictamente anterior a la hora de fin.
 * 2) Coherencia temporal y no cruce de franjas técnicas (montaje, desmontaje, ensayo).
 * 3) Que exista al menos un cambio efectivo entre todos los campos admitidos
 *    (nombre, contacto, teléfono, correo, observaciones, fecha, horario o tiempos técnicos) respecto al evento original.
 */
export function solicitudGrupoValidator(
  obtenerEventoActual: () => Evento | null,
  obtenerAdicionalesPropuestos?: () => AdicionalItem[]
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const fecha = (group.get('fecha_propuesta')?.value ?? '').toString().trim();
    const horaInicio = (group.get('hora_inicio_propuesta')?.value ?? '').toString().trim();
    const horaFin = (group.get('hora_fin_propuesta')?.value ?? '').toString().trim();

    const nombre = (group.get('nombre_propuesto')?.value ?? '').toString().trim();
    const contacto = (group.get('contacto_propuesto')?.value ?? '').toString().trim();
    const telefono = (group.get('telefono_propuesto')?.value ?? '').toString().trim();
    const correo = (group.get('correo_propuesto')?.value ?? '').toString().trim();
    const observaciones = (group.get('observaciones_propuestas')?.value ?? '').toString().trim();

    const hasMontaje = Boolean(group.get('has_montaje')?.value);
    const montajeFecha = (group.get('montaje_fecha')?.value ?? '').toString().trim();
    const montajeStart = (group.get('montaje_hora_inicio')?.value ?? '').toString().trim();
    const montajeEnd = (group.get('montaje_hora_fin')?.value ?? '').toString().trim();

    const hasDesmontaje = Boolean(group.get('has_desmontaje')?.value);
    const desmontajeFecha = (group.get('desmontaje_fecha')?.value ?? '').toString().trim();
    const desmontajeStart = (group.get('desmontaje_hora_inicio')?.value ?? '').toString().trim();
    const desmontajeEnd = (group.get('desmontaje_hora_fin')?.value ?? '').toString().trim();

    const hasEnsayo = Boolean(group.get('has_ensayo')?.value);
    const ensayoFecha = (group.get('ensayo_fecha')?.value ?? '').toString().trim();
    const ensayoStart = (group.get('ensayo_hora_inicio')?.value ?? '').toString().trim();
    const ensayoEnd = (group.get('ensayo_hora_fin')?.value ?? '').toString().trim();

    const errores: ValidationErrors = {};

    const minInicio = parsearHoraAMinutos(horaInicio);
    const minFin = parsearHoraAMinutos(horaFin);

    if (minInicio !== null && minFin !== null && minInicio >= minFin) {
      errores['inicioPosteriorOIgualAFin'] = true;
    }

    let minMStart: number | null = null;
    let minMEnd: number | null = null;
    if (hasMontaje) {
      minMStart = parsearHoraAMinutos(montajeStart);
      minMEnd = parsearHoraAMinutos(montajeEnd);
      if (minMStart !== null && minMEnd !== null) {
        if (minMStart >= minMEnd) {
          errores['montajeInicioPosteriorOIgualAFin'] = true;
        }
        if (montajeFecha === fecha && minInicio !== null && minMEnd > minInicio) {
          errores['montajeFinalizaDespuesDeInicio'] = true;
        }
      }
    }

    if (hasDesmontaje) {
      const minDStart = parsearHoraAMinutos(desmontajeStart);
      const minDEnd = parsearHoraAMinutos(desmontajeEnd);
      if (minDStart !== null && minDEnd !== null) {
        if (minDStart >= minDEnd) {
          errores['desmontajeInicioPosteriorOIgualAFin'] = true;
        }
        if (desmontajeFecha === fecha && minFin !== null && minDStart < minFin) {
          errores['desmontajeIniciaAntesDeFin'] = true;
        }
      }
    }

    if (hasEnsayo) {
      const minEStart = parsearHoraAMinutos(ensayoStart);
      const minEEnd = parsearHoraAMinutos(ensayoEnd);
      if (minEStart !== null && minEEnd !== null) {
        if (minEStart >= minEEnd) {
          errores['ensayoInicioPosteriorOIgualAFin'] = true;
        }
        if (ensayoFecha === fecha && minInicio !== null && minEEnd > minInicio) {
          errores['ensayoFinalizaDespuesDeInicio'] = true;
        }
        if (hasMontaje && minMStart !== null && minMEnd !== null && ensayoFecha === fecha && montajeFecha === fecha) {
          if (!(minEEnd <= minMStart || minEStart >= minMEnd)) {
            errores['ensayoCruzaConMontaje'] = true;
          }
        }
      }
    }

    const evento = obtenerEventoActual();
    if (evento && fecha && minInicio !== null && minFin !== null) {
      const origNombre = (evento.nombre ?? '').trim();
      const origContacto = (evento.contacto ?? '').trim();
      const origTelefono = (evento.telefono ?? '').trim();
      const origCorreo = (evento.correo ?? '').trim();
      const origObservaciones = (evento.observaciones ?? '').trim();

      const sinCambioHorario =
        fecha === evento.fecha &&
        horaInicio === evento.hora_inicio &&
        horaFin === evento.hora_fin;

      const sinCambioInfoGeneral =
        nombre === origNombre &&
        contacto === origContacto &&
        telefono === origTelefono &&
        correo === origCorreo &&
        observaciones === origObservaciones;

      const origHasMontaje = Boolean(evento.has_montaje);
      const origMontFecha = (evento.montaje_fecha ?? '').trim();
      const origMontStart = (evento.montaje_hora_inicio ?? '').trim();
      const origMontEnd = (evento.montaje_hora_fin ?? '').trim();

      const sinCambioMontaje =
        hasMontaje === origHasMontaje &&
        (!hasMontaje || (
          montajeFecha === origMontFecha &&
          montajeStart === origMontStart &&
          montajeEnd === origMontEnd
        ));

      const origHasDesmontaje = Boolean(evento.has_desmontaje);
      const origDesmFecha = (evento.desmontaje_fecha ?? '').trim();
      const origDesmStart = (evento.desmontaje_hora_inicio ?? '').trim();
      const origDesmEnd = (evento.desmontaje_hora_fin ?? '').trim();

      const sinCambioDesmontaje =
        hasDesmontaje === origHasDesmontaje &&
        (!hasDesmontaje || (
          desmontajeFecha === origDesmFecha &&
          desmontajeStart === origDesmStart &&
          desmontajeEnd === origDesmEnd
        ));

      const origHasEnsayo = Boolean(evento.has_ensayo);
      const origEnsFecha = (evento.ensayo_fecha ?? '').trim();
      const origEnsStart = (evento.ensayo_hora_inicio ?? '').trim();
      const origEnsEnd = (evento.ensayo_hora_fin ?? '').trim();

      const sinCambioEnsayo =
        hasEnsayo === origHasEnsayo &&
        (!hasEnsayo || (
          ensayoFecha === origEnsFecha &&
          ensayoStart === origEnsStart &&
          ensayoEnd === origEnsEnd
        ));

      let sinCambioAdicionales = true;
      if (obtenerAdicionalesPropuestos) {
        const propAdic = obtenerAdicionalesPropuestos();
        const origAdic = evento.adicionales ?? [];
        sinCambioAdicionales = sonAdicionalesIguales(origAdic, propAdic);
      }

      if (
        sinCambioHorario &&
        sinCambioInfoGeneral &&
        sinCambioMontaje &&
        sinCambioDesmontaje &&
        sinCambioEnsayo &&
        sinCambioAdicionales
      ) {
        errores['sinCambiosRespectoAlOriginal'] = true;
      }
    }

    return Object.keys(errores).length > 0 ? errores : null;
  };
}
