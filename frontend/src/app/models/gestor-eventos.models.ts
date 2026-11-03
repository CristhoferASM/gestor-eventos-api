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
}

export interface SolicitudCreacionPayload {
  evento_id: number;
  motivo: string;
  fecha_propuesta: string;
  hora_inicio_propuesta: string;
  hora_fin_propuesta: string;
  informacion_general_propuesta?: InformacionGeneralPropuesta;
  tiempos_tecnicos_propuestos?: TiemposTecnicosPropuestos;
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
