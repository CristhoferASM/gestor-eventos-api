export interface Evento {
  id: number;
  nombre: string;
  espacio: string;
  fecha: string;       // Formato YYYY-MM-DD
  hora_inicio: string; // Formato HH:MM
  hora_fin: string;    // Formato HH:MM
  estado: string;      // ej. "Confirmado", "Programado"
}

export interface DatosHorario {
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
}

export interface SolicitudCreacionPayload {
  evento_id: number;
  motivo: string;
  fecha_propuesta: string;
  hora_inicio_propuesta: string;
  hora_fin_propuesta: string;
}

export interface Solicitud {
  id: number;
  evento_id: number;
  motivo: string;
  fecha_propuesta: string;
  hora_inicio_propuesta: string;
  hora_fin_propuesta: string;
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

