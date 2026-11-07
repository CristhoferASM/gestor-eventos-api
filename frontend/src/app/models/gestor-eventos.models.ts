export interface Evento {
  id: number;
  nombre: string;
  espacio: string;
  fecha: string;       // Formato YYYY-MM-DD
  hora_inicio: string; // Formato HH:MM
  hora_fin: string;    // Formato HH:MM
  estado: string;      // ej. "Confirmado", "Programado"
  contacto: string;
  telefono: string;
  correo: string;
  observaciones: string;

  // Tiempos técnicos adicionales
  has_montaje?: boolean;
  montaje_fecha?: string;
  montaje_hora_inicio?: string;
  montaje_hora_fin?: string;
  has_desmontaje?: boolean;
  desmontaje_fecha?: string;
  desmontaje_hora_inicio?: string;
  desmontaje_hora_fin?: string;
  has_ensayo?: boolean;
  ensayo_fecha?: string;
  ensayo_hora_inicio?: string;
  ensayo_hora_fin?: string;

  // Adicionales del evento
  adicionales?: AdicionalItem[];
}

export interface AdicionalCatalogo {
  id: string;
  nombre: string;
  tarifa_hora: number;
  unidad_label: string;
  unidad: string;
}

export interface AdicionalItem {
  id: string;
  nombre: string;
  unidad?: string;
  cantidad: number;
  horas: number;
  tarifa_hora: number;
  subtotal: number;
}

export interface AdicionalPropuestoDTO {
  id: string;
  cantidad: number;
  horas: number;
}

export interface InformacionGeneralPropuesta {
  nombre: string;
  contacto: string;
  telefono: string;
  correo: string;
  observaciones: string;
}

export interface TiemposTecnicosPropuestos {
  has_montaje: boolean;
  montaje_fecha: string;
  montaje_hora_inicio: string;
  montaje_hora_fin: string;
  has_desmontaje: boolean;
  desmontaje_fecha: string;
  desmontaje_hora_inicio: string;
  desmontaje_hora_fin: string;
  has_ensayo: boolean;
  ensayo_fecha: string;
  ensayo_hora_inicio: string;
  ensayo_hora_fin: string;
}

export interface DatosHorario {
  nombre?: string;
  espacio?: string;
  contacto?: string;
  telefono?: string;
  correo?: string;
  observaciones?: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;

  // Tiempos técnicos en snapshot
  has_montaje?: boolean;
  montaje_fecha?: string;
  montaje_hora_inicio?: string;
  montaje_hora_fin?: string;
  has_desmontaje?: boolean;
  desmontaje_fecha?: string;
  desmontaje_hora_inicio?: string;
  desmontaje_hora_fin?: string;
  has_ensayo?: boolean;
  ensayo_fecha?: string;
  ensayo_hora_inicio?: string;
  ensayo_hora_fin?: string;

  // Adicionales del evento
  adicionales?: AdicionalItem[];
}

export interface SolicitudCreacionPayload {
  evento_id: number;
  motivo: string;
  fecha_propuesta: string;
  hora_inicio_propuesta: string;
  hora_fin_propuesta: string;
  informacion_general_propuesta?: InformacionGeneralPropuesta;
  tiempos_tecnicos_propuestos?: TiemposTecnicosPropuestos;
  adicionales_propuestos?: AdicionalPropuestoDTO[];
}

export interface Solicitud {
  id: number;
  evento_id: number;
  motivo: string;
  fecha_propuesta: string;
  hora_inicio_propuesta: string;
  hora_fin_propuesta: string;
  informacion_general_propuesta?: InformacionGeneralPropuesta;
  tiempos_tecnicos_propuestos?: TiemposTecnicosPropuestos;
  adicionales_propuestos?: AdicionalPropuestoDTO[];
  estado: string;
  fecha_creacion: string;
  datos_originales: DatosHorario;
  datos_propuestos: DatosHorario;
}

export interface CrearSolicitudRespuesta {
  mensaje: string;
  solicitud: Solicitud;
}

export interface ApiErrorRespuesta {
  error?: string;
}

export const ESTADO_PENDIENTE_REVISION = 'Pendiente de revisión';
export const TEXTO_SIN_ESPECIFICAR = 'Sin especificar';
export const TEXTO_NO_DISPONIBLE = 'Dato no disponible en este registro';

export interface FilaComparativa {
  campo: string;
  actual: string;
  propuesto: string;
  modificado: boolean;
}

/**
 * Formatea una fecha YYYY-MM-DD en dd/mm/aaaa sin instanciar objetos Date para evitar cualquier
 * desplazamiento indeseado por zona horaria.
 */
export function formatearFechaVisual(fecha: string | undefined | null): string {
  if (fecha === undefined || fecha === null || !fecha.trim()) {
    return TEXTO_NO_DISPONIBLE;
  }
  const limpio = fecha.trim();
  const partes = limpio.split('-');
  if (partes.length === 3 && partes[0].length === 4) {
    const [anio, mes, dia] = partes;
    return `${dia}/${mes}/${anio}`;
  }
  return limpio;
}

/**
 * Formatea un campo obligatorio (como nombre o persona de contacto).
 * Si el campo no existe en el registro (solicitudes antiguas) o está vacío, muestra
 * "Dato no disponible en este registro".
 */
export function formatearTextoObligatorio(valor: string | undefined | null): string {
  if (valor === undefined || valor === null) {
    return TEXTO_NO_DISPONIBLE;
  }
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : TEXTO_NO_DISPONIBLE;
}

/**
 * Formatea un campo opcional (como teléfono, correo u observaciones).
 * - Si el campo no existe en el registro (solicitudes antiguas), muestra "Dato no disponible en este registro".
 * - Si el campo existe pero fue dejado explícitamente vacío (""), muestra "Sin especificar".
 * - Si tiene contenido, muestra el texto limpio.
 */
export function formatearTextoOpcional(valor: string | undefined | null): string {
  if (valor === undefined || valor === null) {
    return TEXTO_NO_DISPONIBLE;
  }
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : TEXTO_SIN_ESPECIFICAR;
}

/**
 * Formatea una franja técnica (montaje, desmontaje, ensayo).
 * - Si has es undefined o null: "Dato no disponible en este registro" (solicitudes previas).
 * - Si has es false: "No requiere".
 * - Si has es true: "dd/mm/aaaa • HH:mm - HH:mm".
 */
export function formatearBloqueTecnico(
  has?: boolean | null,
  fecha?: string | null,
  horaInicio?: string | null,
  horaFin?: string | null,
  fechaEventoFallback?: string | null
): string {
  if (has === undefined || has === null) {
    return TEXTO_NO_DISPONIBLE;
  }
  if (!has) {
    return 'No requiere';
  }
  const f = formatearFechaVisual(fecha || fechaEventoFallback);
  const ini = (horaInicio ?? '').trim();
  const fin = (horaFin ?? '').trim();
  if (!ini && !fin) {
    return 'No requiere';
  }
  return `${f} • ${ini} - ${fin}`;
}

/**
 * Construye la lista unificada de filas comparativas para revisión (Paso 3) y detalle modal,
 * garantizando la misma estructura de 3 columnas, reglas de formato e identificación accesible de cambios.
 */
export function construirFilasComparativa(
  orig: {
    nombre?: string;
    contacto?: string;
    telefono?: string;
    correo?: string;
    observaciones?: string;
    fecha?: string;
    hora_inicio?: string;
    hora_fin?: string;
    has_montaje?: boolean;
    montaje_fecha?: string;
    montaje_hora_inicio?: string;
    montaje_hora_fin?: string;
    has_desmontaje?: boolean;
    desmontaje_fecha?: string;
    desmontaje_hora_inicio?: string;
    desmontaje_hora_fin?: string;
    has_ensayo?: boolean;
    ensayo_fecha?: string;
    ensayo_hora_inicio?: string;
    ensayo_hora_fin?: string;
  } | null | undefined,
  prop: {
    nombre?: string;
    contacto?: string;
    telefono?: string;
    correo?: string;
    observaciones?: string;
    fecha?: string;
    hora_inicio?: string;
    hora_fin?: string;
    has_montaje?: boolean;
    montaje_fecha?: string;
    montaje_hora_inicio?: string;
    montaje_hora_fin?: string;
    has_desmontaje?: boolean;
    desmontaje_fecha?: string;
    desmontaje_hora_inicio?: string;
    desmontaje_hora_fin?: string;
    has_ensayo?: boolean;
    ensayo_fecha?: string;
    ensayo_hora_inicio?: string;
    ensayo_hora_fin?: string;
  } | null | undefined
): FilaComparativa[] {
  const origNombre = orig?.nombre;
  const propNombre = prop?.nombre;
  const nombreMod =
    origNombre !== undefined && propNombre !== undefined
      ? origNombre.trim() !== propNombre.trim()
      : Boolean(origNombre !== propNombre);

  const origContacto = orig?.contacto;
  const propContacto = prop?.contacto;
  const contactoMod =
    origContacto !== undefined && propContacto !== undefined
      ? origContacto.trim() !== propContacto.trim()
      : Boolean(origContacto !== propContacto);

  const origTel = orig?.telefono;
  const propTel = prop?.telefono;
  const telMod =
    origTel !== undefined && propTel !== undefined
      ? origTel.trim() !== propTel.trim()
      : Boolean(origTel !== propTel);

  const origCorreo = orig?.correo;
  const propCorreo = prop?.correo;
  const correoMod =
    origCorreo !== undefined && propCorreo !== undefined
      ? origCorreo.trim() !== propCorreo.trim()
      : Boolean(origCorreo !== propCorreo);

  const origObs = orig?.observaciones;
  const propObs = prop?.observaciones;
  const obsMod =
    origObs !== undefined && propObs !== undefined
      ? origObs.trim() !== propObs.trim()
      : Boolean(origObs !== propObs);

  const origFecha = orig?.fecha;
  const propFecha = prop?.fecha;
  const fechaMod =
    origFecha !== undefined && propFecha !== undefined
      ? origFecha.trim() !== propFecha.trim()
      : Boolean(origFecha !== propFecha);

  const origHoraIni = orig?.hora_inicio?.trim();
  const origHoraFin = orig?.hora_fin?.trim();
  const propHoraIni = prop?.hora_inicio?.trim();
  const propHoraFin = prop?.hora_fin?.trim();

  const origHorarioTexto =
    origHoraIni && origHoraFin ? `${origHoraIni} - ${origHoraFin}` : TEXTO_NO_DISPONIBLE;
  const propHorarioTexto =
    propHoraIni && propHoraFin ? `${propHoraIni} - ${propHoraFin}` : TEXTO_NO_DISPONIBLE;

  const horarioMod =
    origHoraIni !== undefined && propHoraIni !== undefined
      ? origHoraIni !== propHoraIni || origHoraFin !== propHoraFin
      : Boolean(origHoraIni !== propHoraIni || origHoraFin !== propHoraFin);

  const origMontTexto = formatearBloqueTecnico(
    orig?.has_montaje,
    orig?.montaje_fecha,
    orig?.montaje_hora_inicio,
    orig?.montaje_hora_fin,
    orig?.fecha
  );
  const propMontTexto = formatearBloqueTecnico(
    prop?.has_montaje,
    prop?.montaje_fecha,
    prop?.montaje_hora_inicio,
    prop?.montaje_hora_fin,
    prop?.fecha
  );
  const montMod =
    orig?.has_montaje !== undefined && prop?.has_montaje !== undefined
      ? origMontTexto !== propMontTexto
      : false;

  const origDesmTexto = formatearBloqueTecnico(
    orig?.has_desmontaje,
    orig?.desmontaje_fecha,
    orig?.desmontaje_hora_inicio,
    orig?.desmontaje_hora_fin,
    orig?.fecha
  );
  const propDesmTexto = formatearBloqueTecnico(
    prop?.has_desmontaje,
    prop?.desmontaje_fecha,
    prop?.desmontaje_hora_inicio,
    prop?.desmontaje_hora_fin,
    prop?.fecha
  );
  const desmMod =
    orig?.has_desmontaje !== undefined && prop?.has_desmontaje !== undefined
      ? origDesmTexto !== propDesmTexto
      : false;

  const origEnsTexto = formatearBloqueTecnico(
    orig?.has_ensayo,
    orig?.ensayo_fecha,
    orig?.ensayo_hora_inicio,
    orig?.ensayo_hora_fin,
    orig?.fecha
  );
  const propEnsTexto = formatearBloqueTecnico(
    prop?.has_ensayo,
    prop?.ensayo_fecha,
    prop?.ensayo_hora_inicio,
    prop?.ensayo_hora_fin,
    prop?.fecha
  );
  const ensMod =
    orig?.has_ensayo !== undefined && prop?.has_ensayo !== undefined
      ? origEnsTexto !== propEnsTexto
      : false;

  return [
    {
      campo: 'Nombre del evento',
      actual: formatearTextoObligatorio(origNombre),
      propuesto: formatearTextoObligatorio(propNombre),
      modificado: nombreMod,
    },
    {
      campo: 'Persona de contacto',
      actual: formatearTextoObligatorio(origContacto),
      propuesto: formatearTextoObligatorio(propContacto),
      modificado: contactoMod,
    },
    {
      campo: 'Teléfono',
      actual: formatearTextoOpcional(origTel),
      propuesto: formatearTextoOpcional(propTel),
      modificado: telMod,
    },
    {
      campo: 'Correo electrónico',
      actual: formatearTextoOpcional(origCorreo),
      propuesto: formatearTextoOpcional(propCorreo),
      modificado: correoMod,
    },
    {
      campo: 'Observaciones y requerimientos',
      actual: formatearTextoOpcional(origObs),
      propuesto: formatearTextoOpcional(propObs),
      modificado: obsMod,
    },
    {
      campo: 'Fecha del evento',
      actual: formatearFechaVisual(origFecha),
      propuesto: formatearFechaVisual(propFecha),
      modificado: fechaMod,
    },
    {
      campo: 'Horario del evento',
      actual: origHorarioTexto,
      propuesto: propHorarioTexto,
      modificado: horarioMod,
    },
    {
      campo: 'Montaje técnico previo',
      actual: origMontTexto,
      propuesto: propMontTexto,
      modificado: montMod,
    },
    {
      campo: 'Desmontaje técnico posterior',
      actual: origDesmTexto,
      propuesto: propDesmTexto,
      modificado: desmMod,
    },
    {
      campo: 'Ensayo técnico previo',
      actual: origEnsTexto,
      propuesto: propEnsTexto,
      modificado: ensMod,
    },
  ];
}

export function formatSoles(monto: number | string | undefined | null): string {
  const n = Number(monto) || 0;
  return `S/ ${n.toFixed(2)}`;
}

export function sonAdicionalesIguales(
  orig: AdicionalItem[] | undefined | null,
  prop: AdicionalItem[] | undefined | null
): boolean {
  const o = Array.isArray(orig) ? orig : [];
  const p = Array.isArray(prop) ? prop : [];
  if (o.length !== p.length) return false;
  const mapO = new Map<string, AdicionalItem>();
  for (const item of o) {
    mapO.set(item.id, item);
  }
  for (const item of p) {
    const origItem = mapO.get(item.id);
    if (!origItem) return false;
    if (
      origItem.cantidad !== item.cantidad ||
      origItem.horas !== item.horas ||
      origItem.tarifa_hora !== item.tarifa_hora ||
      origItem.subtotal !== item.subtotal
    ) {
      return false;
    }
  }
  return true;
}

export interface FilaComparativaAdicional {
  id: string;
  nombre: string;
  datosActualesTexto: string;
  cambiosPropuestosTexto: string;
  tarifaTexto: string;
  subtotalPropuestoTexto: string;
  variacionTexto: string;
  tipoVariacion: 'inc' | 'red' | 'igual';
  modificada: boolean;
  estado: 'alta' | 'modificado' | 'retiro' | 'sin_cambio';
  subtotalActual?: number;
  subtotalPropuesto?: number;
  itemDiff?: number;
}

export interface ResumenComparativoAdicionales {
  disponible: boolean;
  vacio: boolean;
  filas: FilaComparativaAdicional[];
  totalActual: number | null;
  totalPropuesto: number | null;
  diferencia: number | null;
  totalActualTexto: string;
  totalPropuestoTexto: string;
  diferenciaTexto: string;
  diferenciaSigno: string;
  serviciosActualesCount: number;
  serviciosPropuestosCount: number;
  tipoDiferencia: 'mas' | 'menos' | 'neutro';
  explicacionDiferencia: string;
  tieneReduccion: boolean;
  totalActualDisponible: boolean;
  totalPropuestoDisponible: boolean;
  errorCatalogoIncompleto?: boolean;
  mensajeErrorCatalogo?: string;
}

export function calcularComparativoAdicionales(
  origAdic?: AdicionalItem[] | null,
  actAdic?: AdicionalItem[] | null,
  catalogo?: AdicionalCatalogo[]
): ResumenComparativoAdicionales {
  const origDisponible = Array.isArray(origAdic);
  const actDisponible = Array.isArray(actAdic);
  const disponible = origDisponible || actDisponible;

  if (!disponible) {
    return {
      disponible: false,
      vacio: true,
      filas: [],
      totalActual: null,
      totalPropuesto: null,
      diferencia: null,
      totalActualTexto: TEXTO_NO_DISPONIBLE,
      totalPropuestoTexto: TEXTO_NO_DISPONIBLE,
      diferenciaTexto: TEXTO_NO_DISPONIBLE,
      diferenciaSigno: '',
      serviciosActualesCount: 0,
      serviciosPropuestosCount: 0,
      tipoDiferencia: 'neutro',
      explicacionDiferencia: TEXTO_NO_DISPONIBLE,
      tieneReduccion: false,
      totalActualDisponible: false,
      totalPropuestoDisponible: false,
    };
  }

  const orig = origDisponible ? origAdic! : [];
  const act = actDisponible ? actAdic! : [];

  let errorIncompleto = false;
  let errorMsg = '';

  const allIds = Array.from(new Set([...orig.map((o) => o.id), ...act.map((a) => a.id)]));

  const filas: FilaComparativaAdicional[] = allIds.map((id) => {
    const itemOrig = orig.find((o) => o.id === id);
    const itemAct = act.find((a) => a.id === id);
    const catItem = catalogo?.find((c) => c.id === id);

    // Muestra el nombre comercial del adicional, nunca su identificador como sustituto silencioso.
    let nombre = itemOrig?.nombre || itemAct?.nombre || catItem?.nombre;
    if (!nombre) {
      errorIncompleto = true;
      errorMsg = `El adicional '${id}' no cuenta con nombre comercial ni registro en catálogo.`;
      nombre = `Adicional no identificado (${id})`;
    }

    // Para el lado vigente, utiliza los nombres, tarifas y subtotales guardados en el evento,
    // sin recalcularlos con tarifas actuales.
    const tarifaHora = itemOrig?.tarifa_hora ?? itemAct?.tarifa_hora ?? catItem?.tarifa_hora;
    let tarifaTexto = TEXTO_NO_DISPONIBLE;
    if (tarifaHora !== undefined) {
      tarifaTexto = `${formatSoles(tarifaHora)} / h`;
    } else {
      errorIncompleto = true;
      if (!errorMsg) errorMsg = `No se pudo determinar la tarifa del adicional '${nombre}'.`;
    }

    const subOrig = itemOrig ? Number(itemOrig.subtotal) : 0;
    const subAct = itemAct ? Number(itemAct.subtotal) : 0;
    const itemDiff = Math.round((subAct - subOrig) * 100) / 100;

    let strOrig: string;
    if (!origDisponible) {
      strOrig = TEXTO_NO_DISPONIBLE;
    } else if (itemOrig) {
      strOrig = `${itemOrig.cantidad} un. × ${itemOrig.horas} h (${formatSoles(subOrig)})`;
    } else {
      strOrig = 'No contratado';
    }

    let strAct: string;
    if (!actDisponible) {
      strAct = TEXTO_NO_DISPONIBLE;
    } else if (itemAct) {
      strAct = `${itemAct.cantidad} un. × ${itemAct.horas} h (${formatSoles(subAct)})`;
    } else {
      strAct = '(Retirado)';
    }

    let estado: 'alta' | 'modificado' | 'retiro' | 'sin_cambio' = 'sin_cambio';
    let variacionTexto = 'Sin cambio';
    let tipoVariacion: 'inc' | 'red' | 'igual' = 'igual';
    let filaMod = false;

    if (!itemOrig && !!itemAct) {
      // Alta / Nuevo adicional propuesto: nunca "Sin cambio"
      estado = 'alta';
      filaMod = true;
      tipoVariacion = 'inc';
      variacionTexto = `+${formatSoles(itemDiff)}`;
    } else if (!!itemOrig && !itemAct) {
      // Retiro / Eliminado
      estado = 'retiro';
      filaMod = true;
      tipoVariacion = 'red';
      variacionTexto = `-${formatSoles(Math.abs(itemDiff))}`;
    } else if (!!itemOrig && !!itemAct) {
      const cambioEnDatos =
        itemOrig.cantidad !== itemAct.cantidad ||
        itemOrig.horas !== itemAct.horas ||
        itemOrig.subtotal !== itemAct.subtotal;

      if (cambioEnDatos) {
        estado = 'modificado';
        filaMod = true;
        if (itemDiff > 0) {
          tipoVariacion = 'inc';
          variacionTexto = `+${formatSoles(itemDiff)}`;
        } else if (itemDiff < 0) {
          tipoVariacion = 'red';
          variacionTexto = `-${formatSoles(Math.abs(itemDiff))}`;
        } else {
          tipoVariacion = 'igual';
          variacionTexto = 'S/ 0.00';
        }
      } else {
        estado = 'sin_cambio';
        filaMod = false;
        tipoVariacion = 'igual';
        variacionTexto = 'Sin cambio';
      }
    }

    return {
      id,
      nombre,
      datosActualesTexto: strOrig,
      cambiosPropuestosTexto: strAct,
      tarifaTexto,
      subtotalPropuestoTexto: actDisponible && itemAct ? formatSoles(subAct) : formatSoles(0),
      variacionTexto,
      tipoVariacion,
      modificada: filaMod,
      estado,
      subtotalActual: itemOrig ? subOrig : undefined,
      subtotalPropuesto: itemAct ? subAct : undefined,
      itemDiff,
    };
  });

  // Totales
  const totalOrig = origDisponible
    ? Math.round(orig.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0) * 100) / 100
    : null;

  const totalAct = actDisponible
    ? Math.round(act.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0) * 100) / 100
    : null;

  let diff: number | null = null;
  let diffSigno = '';
  let tipoDiferencia: 'mas' | 'menos' | 'neutro' = 'neutro';
  let diffTextoExplicativo = 'Sin variación en costo de adicionales';
  let diferenciaTexto = TEXTO_NO_DISPONIBLE;

  if (totalOrig !== null && totalAct !== null) {
    diff = Math.round((totalAct - totalOrig) * 100) / 100;
    if (diff > 0) {
      tipoDiferencia = 'mas';
      diffSigno = '+';
      diffTextoExplicativo = 'Incremento propuesto en adicionales';
    } else if (diff < 0) {
      tipoDiferencia = 'menos';
      diffSigno = '-';
      diffTextoExplicativo = 'Reducción propuesta (sin devolución automática)';
    }
    diferenciaTexto = `${diffSigno}${formatSoles(Math.abs(diff))}`;
  }

  return {
    disponible: true,
    vacio: allIds.length === 0,
    filas,
    totalActual: totalOrig,
    totalPropuesto: totalAct,
    diferencia: diff,
    totalActualTexto: totalOrig !== null ? formatSoles(totalOrig) : TEXTO_NO_DISPONIBLE,
    totalPropuestoTexto: totalAct !== null ? formatSoles(totalAct) : TEXTO_NO_DISPONIBLE,
    diferenciaTexto,
    diferenciaSigno: diffSigno,
    serviciosActualesCount: orig.length,
    serviciosPropuestosCount: act.length,
    tipoDiferencia,
    explicacionDiferencia: diffTextoExplicativo,
    tieneReduccion: diff !== null && diff < 0,
    totalActualDisponible: origDisponible,
    totalPropuestoDisponible: actDisponible,
    errorCatalogoIncompleto: errorIncompleto,
    mensajeErrorCatalogo: errorMsg,
  };
}

/**
 * Formatea de manera uniforme la fecha y hora de envío (`fecha_creacion`) devuelta por el backend.
 *
 * Comportamiento:
 * 1. Si el valor es nulo, indefinido, vacío o no tiene formato válido de fecha, retorna 'Fecha no disponible'.
 * 2. Si proviene en formato legacy sin zona horaria ("YYYY-MM-DD HH:MM:SS" o "YYYY-MM-DDTHH:MM:SS"):
 *    extrae directamente sus componentes para generar "DD/MM/YYYY, HH:mm:ss" sin forzar conversión a UTC.
 * 3. Si proviene en estándar RFC 3339 / ISO 8601 con zona horaria explícita (Z o offset [+-]HH:MM):
 *    convierte el instante exacto a la zona horaria 'America/Lima' (incluyendo posibles cambios de día)
 *    y genera "DD/MM/YYYY, HH:mm:ss".
 */
export function formatearFechaHoraEnvio(fechaCreacion?: string | null): string {
  if (!fechaCreacion) {
    return 'Fecha no disponible';
  }
  const limpio = String(fechaCreacion).trim();
  if (!limpio) {
    return 'Fecha no disponible';
  }

  // 1. Formato legacy sin zona horaria ("YYYY-MM-DD HH:MM:SS" o "YYYY-MM-DDTHH:MM:SS")
  const regexLegacy = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/;
  const matchLegacy = limpio.match(regexLegacy);
  if (matchLegacy) {
    const [, anio, mes, dia, hora, min, seg] = matchLegacy;
    const y = parseInt(anio, 10);
    const m = parseInt(mes, 10);
    const d = parseInt(dia, 10);
    const h = parseInt(hora, 10);
    const mi = parseInt(min, 10);
    const s = parseInt(seg, 10);
    if (m < 1 || m > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) {
      return 'Fecha no disponible';
    }
    return `${dia}/${mes}/${anio}, ${hora}:${min}:${seg}`;
  }

  // 2. Formato con zona horaria explícita (RFC 3339 / ISO 8601 con Z o offset [+-]HH:MM)
  const regexConZona = /^(?:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:Z|[+-]\d{2}:\d{2})$/i;
  if (!regexConZona.test(limpio)) {
    return 'Fecha no disponible';
  }

  const d = new Date(limpio);
  if (isNaN(d.getTime())) {
    return 'Fecha no disponible';
  }

  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const partes = dtf.formatToParts(d);
    let day = '';
    let month = '';
    let year = '';
    let hour = '';
    let minute = '';
    let second = '';

    for (const p of partes) {
      if (p.type === 'day') day = p.value;
      else if (p.type === 'month') month = p.value;
      else if (p.type === 'year') year = p.value;
      else if (p.type === 'hour') hour = p.value === '24' ? '00' : p.value;
      else if (p.type === 'minute') minute = p.value;
      else if (p.type === 'second') second = p.value;
    }

    if (!day || !month || !year || !hour || !minute || !second) {
      return 'Fecha no disponible';
    }

    return `${day}/${month}/${year}, ${hour}:${minute}:${second}`;
  } catch {
    return 'Fecha no disponible';
  }
}

/**
 * Determina si una solicitud cuenta con la información mínima indispensable en
 * sus snapshots `datos_originales` y `datos_propuestos` para efectuar una comparación válida.
 */
export function tieneDatosComparativosSuficientes(
  sol: Solicitud | null | undefined
): boolean {
  if (!sol || !sol.datos_originales || !sol.datos_propuestos) {
    return false;
  }
  const orig = sol.datos_originales;
  const prop = sol.datos_propuestos;
  if (typeof orig !== 'object' || typeof prop !== 'object') {
    return false;
  }
  // Se requiere que ambos snapshots tengan campos identificables
  const origValido = Boolean(orig.fecha || orig.hora_inicio || orig.nombre || orig.contacto);
  const propValido = Boolean(prop.fecha || prop.hora_inicio || prop.nombre || prop.contacto);
  return origValido && propValido;
}

/**
 * Cuenta la cantidad total de cambios solicitados basándose en los snapshots:
 * - Cada campo general o de contacto modificado cuenta 1 vez.
 * - La fecha cuenta 1 vez.
 * - El horario principal cuenta como 1 bloque aunque cambien inicio y fin.
 * - Montaje, desmontaje y ensayo cuentan como 1 bloque cada uno.
 * - Cada adicional agregado, modificado (incluso con variación monetaria cero) o retirado cuenta 1 vez.
 * - No cuenta motivo, fecha_creacion, IDs ni campos derivados.
 *
 * Retorna `null` si el registro no tiene datos comparativos suficientes o si arroja 0 cambios.
 */
export function contarCambiosSolicitud(
  sol: Solicitud | null | undefined,
  catalogo?: AdicionalCatalogo[]
): number | null {
  if (!tieneDatosComparativosSuficientes(sol)) {
    return null;
  }

  const orig = sol!.datos_originales;
  const prop = sol!.datos_propuestos;

  // Reutiliza la función existente que ya compara campos generales, fecha, horario y tiempos técnicos
  const filasCampos = construirFilasComparativa(orig, prop);
  const cambiosCampos = filasCampos.filter((f) => f.modificado).length;

  let cambiosAdicionales = 0;
  if (Array.isArray(orig?.adicionales) || Array.isArray(prop?.adicionales)) {
    const compAdic = calcularComparativoAdicionales(orig?.adicionales, prop?.adicionales, catalogo);
    // Cada fila donde modificada === true (alta, modificado o retiro) cuenta 1 vez
    cambiosAdicionales = compAdic.filas.filter((f) => f.modificada).length;
  }

  const total = cambiosCampos + cambiosAdicionales;
  if (total <= 0) {
    return null;
  }

  return total;
}

/**
 * Genera el resumen textual de cambios solicitados para el listado de solicitudes:
 * - "1 campo modificado" (singular)
 * - "X campos modificados" (plural)
 * - "Consultar detalle" (registros históricos sin datos suficientes o sin cambios detectables)
 */
export function obtenerResumenCambiosSolicitud(
  sol: Solicitud | null | undefined,
  catalogo?: AdicionalCatalogo[]
): string {
  const total = contarCambiosSolicitud(sol, catalogo);
  if (total === null) {
    return 'Consultar detalle';
  }
  if (total === 1) {
    return '1 campo modificado';
  }
  return `${total} campos modificados`;
}

/**
 * Estructura del borrador preparado por el asesor comercial en el flujo de modificación.
 */
export interface BorradorAsesor {
  evento_id: number;
  nombre: string;
  contacto: string;
  telefono: string;
  correo: string;
  solicitado_por: string;
  observaciones: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  has_montaje: boolean;
  montaje_fecha: string;
  montaje_hora_inicio: string;
  montaje_hora_fin: string;
  has_desmontaje: boolean;
  desmontaje_fecha: string;
  desmontaje_hora_inicio: string;
  desmontaje_hora_fin: string;
  has_ensayo: boolean;
  ensayo_fecha: string;
  ensayo_hora_inicio: string;
  ensayo_hora_fin: string;
  adicionales: AdicionalItem[];
}

/**
 * Inicializa un borrador del asesor con los valores vigentes de un evento seleccionado.
 */
export function crearBorradorAsesorDesdeEvento(evento: Evento): BorradorAsesor {
  return {
    evento_id: evento.id,
    nombre: evento.nombre ?? '',
    contacto: evento.contacto ?? '',
    telefono: evento.telefono ?? '',
    correo: evento.correo ?? '',
    solicitado_por: '',
    observaciones: evento.observaciones ?? '',
    fecha: evento.fecha ?? '',
    hora_inicio: evento.hora_inicio ?? '',
    hora_fin: evento.hora_fin ?? '',
    has_montaje: Boolean(evento.has_montaje),
    montaje_fecha: evento.montaje_fecha || evento.fecha || '',
    montaje_hora_inicio: evento.montaje_hora_inicio ?? '',
    montaje_hora_fin: evento.montaje_hora_fin ?? '',
    has_desmontaje: Boolean(evento.has_desmontaje),
    desmontaje_fecha: evento.desmontaje_fecha || evento.fecha || '',
    desmontaje_hora_inicio: evento.desmontaje_hora_inicio ?? '',
    desmontaje_hora_fin: evento.desmontaje_hora_fin ?? '',
    has_ensayo: Boolean(evento.has_ensayo),
    ensayo_fecha: evento.ensayo_fecha || evento.fecha || '',
    ensayo_hora_inicio: evento.ensayo_hora_inicio ?? '',
    ensayo_hora_fin: evento.ensayo_hora_fin ?? '',
    adicionales: Array.isArray(evento.adicionales)
      ? JSON.parse(JSON.stringify(evento.adicionales))
      : [],
  };
}
