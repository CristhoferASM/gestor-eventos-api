import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AdicionalCatalogo,
  ApiErrorRespuesta,
  ClienteConEventos,
  CrearSolicitudRespuesta,
  Evento,
  RetirarSolicitudRespuesta,
  Solicitud,
  SolicitudCreacionPayload,
  Usuario,
} from '../models/gestor-eventos.models';

@Injectable({
  providedIn: 'root',
})
export class EventosApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api';

  obtenerEventos(): Observable<Evento[]> {
    return this.http.get<Evento[]>(`${this.baseUrl}/eventos`);
  }

  obtenerEventoPorId(id: number): Observable<Evento> {
    return this.http.get<Evento>(`${this.baseUrl}/eventos/${id}`);
  }

  obtenerSolicitudes(): Observable<Solicitud[]> {
    return this.http.get<Solicitud[]>(`${this.baseUrl}/solicitudes`);
  }

  obtenerCatalogoAdicionales(): Observable<AdicionalCatalogo[]> {
    return this.http.get<AdicionalCatalogo[]>(`${this.baseUrl}/adicionales`);
  }

  crearSolicitud(payload: SolicitudCreacionPayload): Observable<CrearSolicitudRespuesta> {
    return this.http.post<CrearSolicitudRespuesta>(`${this.baseUrl}/solicitudes`, payload);
  }

  /** Solo asesor: clientes a los que se puede vincular una cuenta. */
  obtenerClientes(): Observable<ClienteConEventos[]> {
    return this.http.get<ClienteConEventos[]>(`${this.baseUrl}/clientes`);
  }

  /** Solo asesor: cuentas de Google que aún no tienen un cliente vinculado. */
  obtenerCuentasPendientes(): Observable<Usuario[]> {
    return this.http.get<Usuario[]>(`${this.baseUrl}/usuarios/pendientes-de-vinculo`);
  }

  /** Solo asesor: asocia una cuenta de Google con un cliente. */
  vincularCuenta(correo: string, clienteId: string): Observable<{ mensaje: string; usuario: Usuario }> {
    return this.http.post<{ mensaje: string; usuario: Usuario }>(`${this.baseUrl}/usuarios/vincular`, {
      correo,
      cliente_id: clienteId,
    });
  }

  /** El cliente retira una solicitud que sigue pendiente (la solicitud se conserva con estado «Retirada por el cliente»). */
  retirarSolicitud(id: number): Observable<RetirarSolicitudRespuesta> {
    return this.http.post<RetirarSolicitudRespuesta>(`${this.baseUrl}/solicitudes/${id}/retirar`, {});
  }

  /**
   * Convierte errores HTTP (0, 400, 404, 409, 500) en mensajes comprensibles en español
   * sin exponer trazas internas del servidor.
   */
  obtenerMensajeError(err: unknown, contexto: 'carga' | 'envio' = 'envio'): string {
    if (err instanceof HttpErrorResponse) {
      const cuerpo = err.error as ApiErrorRespuesta | null | undefined;
      const mensajeBackend =
        typeof cuerpo === 'object' && cuerpo !== null && typeof cuerpo.error === 'string'
          ? cuerpo.error.trim()
          : '';

      switch (err.status) {
        case 0:
          return 'No fue posible conectar con el servidor (127.0.0.1:8081). Verifica que el backend Go esté en ejecución e inténtalo de nuevo.';
        case 400:
          return (
            mensajeBackend ||
            'Los datos ingresados no son válidos. Revisa la fecha, el horario y el motivo.'
          );
        case 404:
          return mensajeBackend || 'El evento seleccionado no existe o ya no se encuentra disponible.';
        case 409:
          return (
            mensajeBackend ||
            'Ya existe una solicitud pendiente de revisión para este evento.'
          );
        case 500:
          return 'Se produjo un error interno en el servidor. Por favor, inténtalo nuevamente.';
        default:
          if (err.status >= 500) {
            return 'Se produjo un error interno en el servidor. Por favor, inténtalo nuevamente.';
          }
          return (
            mensajeBackend ||
            (contexto === 'carga'
              ? 'No se pudo completar la consulta con el servidor.'
              : 'No se pudo procesar la solicitud en este momento.')
          );
      }
    }

    return contexto === 'carga'
      ? 'No se pudieron cargar los datos desde el servidor.'
      : 'Ocurrió un problema inesperado al enviar la solicitud.';
  }
}

