import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Evento } from '../models/gestor-eventos.models';

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HORA_REGEX = /^\d{2}:\d{2}$/;
const MINUTOS_MIN = 6 * 60;  // 06:00
const MINUTOS_MAX = 22 * 60; // 22:00

/**
 * Cuenta los puntos de código Unicode tras recortar espacios externos,
 * de forma coherente con utf8.RuneCountInString(strings.TrimSpace(s)) en Go.
 */
export function contarRunasMotivo(valor: string | null | undefined): number {
  if (!valor) {
    return 0;
  }
  return Array.from(valor.trim()).length;
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
 * Valida que la fecha tenga formato YYYY-MM-DD y corresponda a una fecha calendario válida
 * sin aplicar desplazamientos por zona horaria ni prohibir fechas pasadas.
 */
export function fechaFormatoValidoValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const valor = (control.value ?? '').toString().trim();
    if (!valor) {
      return null; // Validators.required se encarga del vacío
    }
    if (!FECHA_REGEX.test(valor)) {
      return { formatoFecha: true };
    }
    const [anioStr, mesStr, diaStr] = valor.split('-');
    const anio = Number(anioStr);
    const mes = Number(mesStr);
    const dia = Number(diaStr);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
      return { formatoFecha: true };
    }
    const fechaUTC = new Date(Date.UTC(anio, mes - 1, dia));
    if (
      fechaUTC.getUTCFullYear() !== anio ||
      fechaUTC.getUTCMonth() + 1 !== mes ||
      fechaUTC.getUTCDate() !== dia
    ) {
      return { formatoFecha: true };
    }
    return null;
  };
}

/**
 * Valida que el motivo no quede vacío tras quitar espacios y no supere el máximo de caracteres Unicode.
 */
export function motivoUnicodeValidator(maxRunas = 400): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = (control.value ?? '').toString();
    const limpio = raw.trim();
    if (limpio.length === 0) {
      return { motivoVacio: true };
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

/**
 * Validador de grupo para comprobar:
 * 1) Que la hora de inicio sea estrictamente anterior a la hora de fin.
 * 2) Que exista al menos un cambio en fecha u horario respecto al evento original seleccionado.
 */
export function solicitudGrupoValidator(obtenerEventoActual: () => Evento | null): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const fecha = (group.get('fecha_propuesta')?.value ?? '').toString().trim();
    const horaInicio = (group.get('hora_inicio_propuesta')?.value ?? '').toString().trim();
    const horaFin = (group.get('hora_fin_propuesta')?.value ?? '').toString().trim();

    const errores: ValidationErrors = {};

    const minInicio = parsearHoraAMinutos(horaInicio);
    const minFin = parsearHoraAMinutos(horaFin);

    if (minInicio !== null && minFin !== null && minInicio >= minFin) {
      errores['inicioPosteriorOIgualAFin'] = true;
    }

    const evento = obtenerEventoActual();
    if (
      evento &&
      fecha &&
      minInicio !== null &&
      minFin !== null &&
      fecha === evento.fecha &&
      horaInicio === evento.hora_inicio &&
      horaFin === evento.hora_fin
    ) {
      errores['sinCambiosRespectoAlOriginal'] = true;
    }

    return Object.keys(errores).length > 0 ? errores : null;
  };
}

