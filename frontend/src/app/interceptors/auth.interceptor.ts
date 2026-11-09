import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * La sesión viaja en una cookie HttpOnly que el navegador adjunta solo a las llamadas del mismo origen (/api):
 * aquí no se maneja ningún token. Si el backend responde 401 en una ruta de negocio con sesión activa
 * (cookie vencida o inválida), se cierra la sesión local y se avisa en el login.
 * Los 401 de /api/auth/* (contraseña o código incorrectos) no cierran la sesión: los maneja el login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api')) {
    return next(req);
  }

  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((err: unknown) => {
      const esRutaAuth = req.url.startsWith('/api/auth/');
      if (err instanceof HttpErrorResponse && err.status === 401 && auth.autenticado() && !esRutaAuth) {
        auth.limpiarSesion('Tu sesión expiró o ya no es válida. Inicia sesión nuevamente.');
      }
      return throwError(() => err);
    }),
  );
};
