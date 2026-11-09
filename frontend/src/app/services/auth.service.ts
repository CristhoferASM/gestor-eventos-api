import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, of, tap } from 'rxjs';
import {
  ApiErrorRespuesta,
  RespuestaDesafio,
  RespuestaSesion,
  Usuario,
} from '../models/gestor-eventos.models';

const CLAVE_SESION = 'showtech_sesion';
const CLAVE_AVISO = 'showtech_aviso';

/**
 * Lo único que se guarda en el navegador: quién es el usuario y cuándo vence la sesión (datos no secretos).
 * El token de sesión NO se guarda en JavaScript: viaja en una cookie HttpOnly que el navegador adjunta solo.
 */
interface SesionGuardada {
  expira_en: string;
  usuario: Usuario;
}

/**
 * Estado de autenticación del portal. El backend emite el token tras el segundo paso o el acceso con Google y lo
 * entrega en una cookie HttpOnly (JavaScript no puede leerla, así que un XSS no puede robar la sesión).
 * Aquí solo se recuerda el usuario y el vencimiento en sessionStorage (se cierra con la pestaña, como el prototipo).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/auth';

  private readonly _usuario = signal<Usuario | null>(null);

  readonly usuario = this._usuario.asReadonly();
  readonly autenticado = computed(() => this._usuario() !== null);

  /** Mensaje para mostrar en el login cuando la sesión terminó sola (ej. token vencido). */
  readonly avisoSesion = signal<string>('');

  constructor() {
    this.restaurarSesion();
    this.recuperarAviso();
  }

  /** Paso 1: correo y contraseña. Devuelve el desafío de verificación. */
  iniciarSesion(correo: string, password: string): Observable<RespuestaDesafio> {
    return this.http
      .post<RespuestaDesafio>(`${this.baseUrl}/login`, { correo, password })
      .pipe(tap((resp) => resp.sesion && this.guardarSesion(resp.sesion)));
  }

  /** Paso 2: código de 6 dígitos. Si es correcto guarda la sesión. */
  verificarCodigo(desafioId: string, codigo: string): Observable<RespuestaSesion> {
    return this.http
      .post<RespuestaSesion>(`${this.baseUrl}/verificar`, { desafio_id: desafioId, codigo })
      .pipe(tap((sesion) => this.guardarSesion(sesion)));
  }

  reenviarCodigo(desafioId: string): Observable<RespuestaDesafio> {
    return this.http.post<RespuestaDesafio>(`${this.baseUrl}/reenviar-codigo`, {
      desafio_id: desafioId,
    });
  }

  /** Acceso con Google: el backend valida el ID token de Firebase y abre sesión directamente. */
  iniciarSesionConGoogle(idToken: string): Observable<RespuestaSesion> {
    return this.http
      .post<RespuestaSesion>(`${this.baseUrl}/google`, { id_token: idToken })
      .pipe(tap((sesion) => this.guardarSesion(sesion)));
  }

  /**
   * Vuelve a pedir el usuario al backend. Sirve cuando el asesor vincula la cuenta con un cliente mientras la
   * persona ya tiene la sesión abierta: así ve sus eventos sin cerrar sesión.
   */
  refrescarUsuario(): Observable<Usuario | null> {
    return this.http.get<Usuario>(`${this.baseUrl}/me`).pipe(
      tap((usuario) => {
        this._usuario.set(usuario);
        this.actualizarUsuarioGuardado(usuario);
      }),
      catchError(() => of(null)),
    );
  }

  /** Cierra la sesión en el backend (si es posible) y siempre la limpia en el navegador. */
  cerrarSesion(): void {
    if (this.autenticado()) {
      // El navegador adjunta la cookie; el backend invalida la sesión y la borra
      this.http.post(`${this.baseUrl}/logout`, {}).pipe(catchError(() => of(null))).subscribe();
    }
    this.limpiarSesion();
  }

  /** Limpia la sesión local. Si se pasa un aviso, el login lo mostrará. */
  limpiarSesion(aviso = ''): void {
    this._usuario.set(null);
    this.avisoSesion.set(aviso);
    try {
      sessionStorage.removeItem(CLAVE_SESION);
      // App recarga la página al terminar la sesión: el aviso se guarda para mostrarlo tras la recarga
      if (aviso) {
        sessionStorage.setItem(CLAVE_AVISO, aviso);
      }
    } catch {
      /* sessionStorage no disponible: no hay nada que limpiar */
    }
  }

  /**
   * Convierte errores HTTP del módulo de acceso en mensajes en español.
   * Prioriza el mensaje del backend (ya redactado para el usuario).
   */
  obtenerMensajeError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return 'No fue posible conectar con el servidor. Verifica que el backend esté en ejecución e inténtalo de nuevo.';
      }
      if (err.status >= 500 && err.status !== 503) {
        return 'Se produjo un error interno en el servidor. Por favor, inténtalo nuevamente.';
      }
      const cuerpo = err.error as ApiErrorRespuesta | null | undefined;
      if (typeof cuerpo === 'object' && cuerpo !== null && typeof cuerpo.error === 'string' && cuerpo.error.trim()) {
        return cuerpo.error.trim();
      }
    }
    return 'No se pudo completar el acceso. Por favor, inténtalo nuevamente.';
  }

  /**
   * Indica si el error obliga a empezar de nuevo desde correo y contraseña
   * (el backend lo expresa en el mensaje: «... vuelve a iniciar sesión»).
   */
  requiereReiniciarLogin(err: unknown): boolean {
    if (!(err instanceof HttpErrorResponse)) {
      return false;
    }
    const cuerpo = err.error as ApiErrorRespuesta | null | undefined;
    const mensaje = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo.error ?? '') : '';
    return (err.status === 401 || err.status === 429) && /iniciar sesión/i.test(mensaje);
  }

  private guardarSesion(sesion: RespuestaSesion): void {
    this._usuario.set(sesion.usuario);
    this.avisoSesion.set('');
    try {
      const guardada: SesionGuardada = { expira_en: sesion.expira_en, usuario: sesion.usuario };
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify(guardada));
    } catch {
      /* sin sessionStorage la sesión dura solo mientras la página siga abierta */
    }
  }

  /** Muestra (una sola vez) el aviso que dejó una sesión terminada antes de la última recarga. */
  private recuperarAviso(): void {
    try {
      const aviso = sessionStorage.getItem(CLAVE_AVISO);
      if (aviso) {
        sessionStorage.removeItem(CLAVE_AVISO);
        if (!this.autenticado()) {
          this.avisoSesion.set(aviso);
        }
      }
    } catch {
      /* sin sessionStorage no hay aviso que recuperar */
    }
  }

  private actualizarUsuarioGuardado(usuario: Usuario): void {
    try {
      const crudo = sessionStorage.getItem(CLAVE_SESION);
      if (crudo) {
        const guardada = JSON.parse(crudo) as SesionGuardada;
        sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ ...guardada, usuario }));
      }
    } catch {
      /* sin sessionStorage no hay nada que actualizar */
    }
  }

  private restaurarSesion(): void {
    try {
      const crudo = sessionStorage.getItem(CLAVE_SESION);
      if (!crudo) {
        return;
      }
      const guardada = JSON.parse(crudo) as SesionGuardada;
      const vigente = guardada?.usuario && new Date(guardada.expira_en).getTime() > Date.now();
      if (!vigente) {
        sessionStorage.removeItem(CLAVE_SESION);
        return;
      }
      this._usuario.set(guardada.usuario);
    } catch {
      /* contenido corrupto o sessionStorage bloqueado: se inicia sin sesión */
    }
  }
}
