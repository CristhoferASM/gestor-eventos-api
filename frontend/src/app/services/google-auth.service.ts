import { Injectable } from '@angular/core';

/**
 * Configuración web pública del proyecto Firebase del prototipo (no es un secreto: identifica el proyecto,
 * la seguridad la dan los dominios autorizados en Firebase Console y la validación del token en el backend).
 * Debe coincidir con el proyecto que valida el backend (FIREBASE_PROJECT_ID, por defecto «showtech-prototipo»).
 */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDkAhcjG_cb5E-v08V9fvTlizGrrJGkTRk',
  authDomain: 'showtech-prototipo.firebaseapp.com',
  projectId: 'showtech-prototipo',
  storageBucket: 'showtech-prototipo.firebasestorage.app',
  messagingSenderId: '396170424327',
  appId: '1:396170424327:web:ca230d98cc9047d85d3aa2',
};

/** Error con el código de Firebase (ej. «auth/popup-closed-by-user») para mapearlo a un mensaje. */
export interface ErrorFirebase {
  code?: string;
}

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  /**
   * Abre el popup de Google y devuelve el ID token de Firebase. Después cierra la sesión de Firebase:
   * el portal usa su propio token de sesión emitido por el backend.
   * El SDK de Firebase se descarga solo al pulsar «Continuar con Google» para no pesar en la carga inicial.
   */
  async obtenerIdToken(): Promise<string> {
    const [{ getApp, getApps, initializeApp }, { GoogleAuthProvider, getAuth, signInWithPopup, signOut }] =
      await Promise.all([import('firebase/app'), import('firebase/auth')]);

    const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
    const auth = getAuth(app);
    const proveedor = new GoogleAuthProvider();
    proveedor.setCustomParameters({ prompt: 'select_account' });
    const resultado = await signInWithPopup(auth, proveedor);
    const idToken = await resultado.user.getIdToken();
    await signOut(auth).catch(() => undefined);
    return idToken;
  }

  /** Traduce el código de error de Firebase a un mensaje en español; cadena vacía = no mostrar error. */
  mensajeDeError(err: unknown): string {
    const code = (err as ErrorFirebase | null)?.code;
    switch (code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return '';
      case 'auth/popup-blocked':
        return 'La ventana emergente de Google fue bloqueada por el navegador. Habilita las ventanas emergentes para este sitio e intenta de nuevo.';
      case 'auth/unauthorized-domain':
        return 'Dominio no autorizado en Firebase Authentication. Debe autorizarse «localhost» en Firebase Console.';
      case 'auth/operation-not-allowed':
        return 'El proveedor de inicio de sesión con Google no está habilitado en Firebase Authentication.';
      case 'auth/network-request-failed':
        return 'Error de conexión con los servidores de autenticación. Verifica tu conexión a internet.';
      default:
        return 'No fue posible iniciar sesión con Google. Por favor intenta nuevamente.';
    }
  }
}
