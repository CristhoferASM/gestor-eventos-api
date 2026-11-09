import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
  inject,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RespuestaDesafio } from '../../models/gestor-eventos.models';
import { AuthService } from '../../services/auth.service';
import { GoogleAuthService } from '../../services/google-auth.service';

/**
 * Cuentas de demostración del prototipo (acceso.js). Solo rellenan los campos del formulario;
 * la validación real de credenciales ocurre en el backend.
 */
const CUENTAS_DEMO = {
  asesor: { correo: 'asesor@showtech.com', password: 'Asesor2026!' },
  cliente: { correo: 'cliente@horizonte.com', password: 'Cliente2026!' },
};

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOTAL_DIGITOS = 6;

type PasoAcceso = 1 | 2;
type TipoToast = 'info' | 'ok';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly google = inject(GoogleAuthService);
  private readonly titulo = inject(Title);
  private readonly tituloOriginal = this.titulo.getTitle();

  @ViewChildren('casilla') private casillas!: QueryList<ElementRef<HTMLInputElement>>;

  readonly paso = signal<PasoAcceso>(1);

  // Paso 1
  readonly correo = signal('');
  readonly password = signal('');
  readonly verPassword = signal(false);
  readonly errorCorreo = signal('');
  readonly errorPassword = signal('');
  readonly errorCredenciales = signal('');
  readonly ingresando = signal(false);
  readonly conectandoGoogle = signal(false);

  // Paso 2
  readonly desafio = signal<RespuestaDesafio | null>(null);
  readonly digitos = signal<string[]>(Array(TOTAL_DIGITOS).fill(''));
  readonly codigoVisible = signal(false);
  readonly errorCodigo = signal('');
  readonly segundosVigencia = signal(0);
  readonly segundosReenvio = signal(0);
  readonly verificando = signal(false);
  readonly reenviando = signal(false);

  // Modales y aviso
  readonly modalRecuperacion = signal(false);
  readonly modalSoporte = signal(false);
  readonly toast = signal<{ mensaje: string; tipo: TipoToast } | null>(null);

  private temporizadorVigencia: ReturnType<typeof setInterval> | null = null;
  private temporizadorReenvio: ReturnType<typeof setInterval> | null = null;
  private temporizadorToast: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.titulo.setTitle('Iniciar sesión - Showtech Solutions');
    // Si el login aparece porque la sesión expiró, se explica arriba del botón Ingresar
    const aviso = this.auth.avisoSesion();
    if (aviso) {
      this.errorCredenciales.set(aviso);
    }
  }

  ngOnDestroy(): void {
    this.limpiarTemporizadores();
    if (this.temporizadorToast) {
      clearTimeout(this.temporizadorToast);
    }
    this.titulo.setTitle(this.tituloOriginal);
  }

  @HostListener('window:keydown.escape')
  cerrarModalesConEscape(): void {
    if (this.modalRecuperacion()) {
      this.modalRecuperacion.set(false);
    } else if (this.modalSoporte()) {
      this.modalSoporte.set(false);
    }
  }

  // -------------------------------------------------------------------------
  // Paso 1: correo y contraseña
  // -------------------------------------------------------------------------

  usarCuentaDemo(tipo: 'asesor' | 'cliente'): void {
    this.correo.set(CUENTAS_DEMO[tipo].correo);
    this.password.set(CUENTAS_DEMO[tipo].password);
    this.limpiarErroresLogin();
  }

  alternarPassword(): void {
    this.verPassword.update((v) => !v);
  }

  alEscribirCorreo(valor: string): void {
    this.correo.set(valor);
    this.errorCorreo.set('');
  }

  alEscribirPassword(valor: string): void {
    this.password.set(valor);
    this.errorPassword.set('');
  }

  enviarLogin(evento: Event): void {
    evento.preventDefault();
    if (this.ingresando() || this.conectandoGoogle()) {
      return;
    }
    this.limpiarErroresLogin();

    const correo = this.correo().trim();
    const password = this.password();
    let hayError = false;

    if (!correo) {
      this.errorCorreo.set('Ingresa tu correo electrónico.');
      hayError = true;
    } else if (!FORMATO_CORREO.test(correo)) {
      this.errorCorreo.set('Ingresa un formato de correo válido (ejemplo: usuario@correo.com).');
      hayError = true;
    }
    if (!password) {
      this.errorPassword.set('Ingresa tu contraseña.');
      hayError = true;
    }
    if (hayError) {
      return;
    }

    this.ingresando.set(true);
    this.auth.iniciarSesion(correo, password).subscribe({
      next: (desafio) => {
        this.ingresando.set(false);
        // Si el código ya se verificó hoy en este navegador, la sesión ya se abrió y App muestra el portal
        if (!desafio.sesion) {
          this.irAPasoCodigo(desafio);
        }
      },
      error: (err: unknown) => {
        this.ingresando.set(false);
        this.errorCredenciales.set(this.auth.obtenerMensajeError(err));
      },
    });
  }

  async continuarConGoogle(): Promise<void> {
    if (this.conectandoGoogle() || this.ingresando()) {
      return;
    }
    this.errorCredenciales.set('');
    this.conectandoGoogle.set(true);
    try {
      const idToken = await this.google.obtenerIdToken();
      // Al guardarse la sesión, App deja de mostrar el login
      await new Promise<void>((resolver, rechazar) =>
        this.auth.iniciarSesionConGoogle(idToken).subscribe({
          next: () => resolver(),
          error: (err: unknown) => rechazar(err),
        }),
      );
    } catch (err) {
      this.conectandoGoogle.set(false);
      const mensaje = this.esErrorFirebase(err)
        ? this.google.mensajeDeError(err)
        : this.auth.obtenerMensajeError(err);
      this.errorCredenciales.set(mensaje);
    }
  }

  abrirRecuperacion(evento: Event): void {
    evento.preventDefault();
    this.modalRecuperacion.set(true);
  }

  abrirSoporte(evento: Event): void {
    evento.preventDefault();
    this.modalSoporte.set(true);
  }

  // -------------------------------------------------------------------------
  // Paso 2: código de verificación
  // -------------------------------------------------------------------------

  private irAPasoCodigo(desafio: RespuestaDesafio): void {
    this.desafio.set(desafio);
    this.paso.set(2);
    this.titulo.setTitle('Revisa tu correo - Showtech Solutions');
    this.limpiarCasillas();
    this.errorCodigo.set('');
    this.codigoVisible.set(false);
    this.verificando.set(false);
    this.iniciarTemporizadores(desafio);
    this.enfocarCasilla(0);
  }

  volverAlLogin(evento?: Event): void {
    evento?.preventDefault();
    this.limpiarTemporizadores();
    this.limpiarCasillas();
    this.desafio.set(null);
    this.errorCodigo.set('');
    this.codigoVisible.set(false);
    this.paso.set(1);
    this.titulo.setTitle('Iniciar sesión - Showtech Solutions');
  }

  alternarCodigoPrueba(): void {
    this.codigoVisible.update((v) => !v);
  }

  autocompletarCodigo(): void {
    const codigo = this.desafio()?.codigo_prueba;
    if (!codigo) {
      return;
    }
    this.digitos.set(Array.from({ length: TOTAL_DIGITOS }, (_, i) => codigo[i] ?? ''));
    this.errorCodigo.set('');
    this.enfocarCasilla(TOTAL_DIGITOS - 1);
  }

  alEscribirDigito(indice: number, evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const valor = entrada.value.replace(/\D/g, '');
    if (valor) {
      const digito = valor.slice(-1);
      entrada.value = digito;
      this.fijarDigito(indice, digito);
      this.errorCodigo.set('');
      if (indice < TOTAL_DIGITOS - 1) {
        this.enfocarCasillaYa(indice + 1);
      }
    } else {
      entrada.value = '';
      this.fijarDigito(indice, '');
    }
  }

  alPresionarTecla(indice: number, evento: KeyboardEvent): void {
    switch (evento.key) {
      case 'Backspace': {
        evento.preventDefault();
        if (this.digitos()[indice] !== '') {
          this.fijarDigito(indice, '');
        } else if (indice > 0) {
          this.fijarDigito(indice - 1, '');
          this.enfocarCasillaYa(indice - 1);
        }
        this.errorCodigo.set('');
        break;
      }
      case 'ArrowLeft':
        if (indice > 0) {
          evento.preventDefault();
          this.enfocarCasillaYa(indice - 1);
        }
        break;
      case 'ArrowRight':
        if (indice < TOTAL_DIGITOS - 1) {
          evento.preventDefault();
          this.enfocarCasillaYa(indice + 1);
        }
        break;
      case 'Enter':
        evento.preventDefault();
        this.verificarCodigo();
        break;
    }
  }

  alPegar(evento: ClipboardEvent): void {
    evento.preventDefault();
    const pegado = (evento.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, TOTAL_DIGITOS);
    if (!pegado) {
      return;
    }
    this.digitos.set(Array.from({ length: TOTAL_DIGITOS }, (_, i) => pegado[i] ?? ''));
    this.errorCodigo.set('');
    this.enfocarCasillaYa(Math.min(pegado.length, TOTAL_DIGITOS - 1));
  }

  verificarCodigo(): void {
    const desafio = this.desafio();
    if (this.verificando() || !desafio) {
      return;
    }
    this.errorCodigo.set('');

    const codigo = this.digitos().join('');
    if (codigo.length < TOTAL_DIGITOS) {
      this.errorCodigo.set('Por favor completa los 6 dígitos del código de verificación.');
      this.enfocarCasilla(Math.max(0, this.digitos().findIndex((d) => d === '')));
      return;
    }
    if (this.segundosVigencia() <= 0) {
      this.errorCodigo.set('El código de verificación ha expirado. Por favor solicita un nuevo código o reenvíalo.');
      return;
    }

    this.verificando.set(true);
    this.auth.verificarCodigo(desafio.desafio_id, codigo).subscribe({
      // Con la sesión guardada, App reemplaza esta pantalla por el portal
      next: () => this.limpiarTemporizadores(),
      error: (err: unknown) => {
        this.verificando.set(false);
        if (this.auth.requiereReiniciarLogin(err)) {
          this.volverAlLogin();
          this.errorCredenciales.set(this.auth.obtenerMensajeError(err));
          return;
        }
        this.errorCodigo.set(this.auth.obtenerMensajeError(err));
        this.enfocarCasilla(TOTAL_DIGITOS - 1);
      },
    });
  }

  reenviarCodigo(): void {
    const desafio = this.desafio();
    if (!desafio || this.segundosReenvio() > 0 || this.reenviando()) {
      return;
    }
    this.reenviando.set(true);
    this.auth.reenviarCodigo(desafio.desafio_id).subscribe({
      next: (nuevo) => {
        this.reenviando.set(false);
        this.desafio.set({ ...nuevo, recordatorio_diario: this.desafio()?.recordatorio_diario });
        this.limpiarCasillas();
        this.errorCodigo.set('');
        this.iniciarTemporizadores(nuevo);
        this.mostrarToast('Nuevo código generado (simulación). El código anterior ha sido invalidado.', 'info');
        this.enfocarCasilla(0);
      },
      error: (err: unknown) => {
        this.reenviando.set(false);
        if (this.auth.requiereReiniciarLogin(err)) {
          this.volverAlLogin();
        }
        this.errorCodigo.set(this.auth.obtenerMensajeError(err));
      },
    });
  }

  // -------------------------------------------------------------------------
  // Utilidades internas
  // -------------------------------------------------------------------------

  private limpiarErroresLogin(): void {
    this.errorCorreo.set('');
    this.errorPassword.set('');
    this.errorCredenciales.set('');
  }

  private limpiarCasillas(): void {
    this.digitos.set(Array(TOTAL_DIGITOS).fill(''));
  }

  private fijarDigito(indice: number, valor: string): void {
    this.digitos.update((actuales) => actuales.map((d, i) => (i === indice ? valor : d)));
  }

  /** Foco tras renderizar (la casilla puede no existir todavía): con un pequeño retraso. */
  private enfocarCasilla(indice: number): void {
    setTimeout(() => this.casillas?.get(indice)?.nativeElement.focus(), 50);
  }

  /**
   * Foco inmediato al avanzar o retroceder escribiendo. Con retraso, quien teclea rápido (menos de 50 ms entre
   * dígitos) pisaba el dígito anterior porque el siguiente todavía caía en la misma casilla.
   */
  private enfocarCasillaYa(indice: number): void {
    this.casillas?.get(indice)?.nativeElement.focus();
  }

  private iniciarTemporizadores(desafio: RespuestaDesafio): void {
    this.limpiarTemporizadores();
    this.segundosVigencia.set(desafio.expira_en_segundos);
    this.segundosReenvio.set(desafio.reenvio_en_segundos);

    this.temporizadorVigencia = setInterval(() => {
      this.segundosVigencia.update((s) => Math.max(0, s - 1));
      if (this.segundosVigencia() === 0 && this.temporizadorVigencia) {
        clearInterval(this.temporizadorVigencia);
        this.temporizadorVigencia = null;
      }
    }, 1000);

    this.temporizadorReenvio = setInterval(() => {
      this.segundosReenvio.update((s) => Math.max(0, s - 1));
      if (this.segundosReenvio() === 0 && this.temporizadorReenvio) {
        clearInterval(this.temporizadorReenvio);
        this.temporizadorReenvio = null;
      }
    }, 1000);
  }

  private limpiarTemporizadores(): void {
    if (this.temporizadorVigencia) {
      clearInterval(this.temporizadorVigencia);
      this.temporizadorVigencia = null;
    }
    if (this.temporizadorReenvio) {
      clearInterval(this.temporizadorReenvio);
      this.temporizadorReenvio = null;
    }
  }

  private mostrarToast(mensaje: string, tipo: TipoToast): void {
    if (this.temporizadorToast) {
      clearTimeout(this.temporizadorToast);
    }
    this.toast.set({ mensaje, tipo });
    this.temporizadorToast = setTimeout(() => this.toast.set(null), 4000);
  }

  private esErrorFirebase(err: unknown): boolean {
    const code = (err as { code?: unknown } | null)?.code;
    return typeof code === 'string' && code.startsWith('auth/');
  }
}
