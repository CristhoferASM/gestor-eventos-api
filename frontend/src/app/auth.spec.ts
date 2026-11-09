import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './services/auth.service';
import { GoogleAuthService } from './services/google-auth.service';
import { authInterceptor } from './interceptors/auth.interceptor';
import { LoginComponent } from './components/login/login.component';
import { RespuestaDesafio, RespuestaSesion, Usuario } from './models/gestor-eventos.models';

const USUARIO: Usuario = {
  id: 2,
  correo: 'cliente@horizonte.com',
  nombre: 'Promoción Horizonte 2026',
  rol: 'cliente',
  cliente_id: 'CLI-001',
};

const DESAFIO: RespuestaDesafio = {
  desafio_id: 'desafio-1',
  correo_enmascarado: 'cl***@horizonte.com',
  expira_en_segundos: 60,
  reenvio_en_segundos: 30,
  codigo_prueba: '123456',
};

function sesion(expiraEnMs = 3600_000): RespuestaSesion {
  return { token: 'tok-1', expira_en: new Date(Date.now() + expiraEnMs).toISOString(), usuario: USUARIO };
}

function configurar(extra: object[] = []) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      ...extra,
    ],
  });
  return {
    auth: TestBed.inject(AuthService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('AuthService', () => {
  afterEach(() => sessionStorage.clear());

  it('guarda la sesión (en memoria y en sessionStorage) tras verificar el código', () => {
    const { auth, http } = configurar();
    expect(auth.autenticado()).toBe(false);

    auth.verificarCodigo('desafio-1', '123456').subscribe();
    const req = http.expectOne('/api/auth/verificar');
    expect(req.request.body).toEqual({ desafio_id: 'desafio-1', codigo: '123456' });
    req.flush(sesion());

    expect(auth.autenticado()).toBe(true);
    expect(auth.usuario()?.cliente_id).toBe('CLI-001');
    // El token NO se guarda en el navegador (viaja en una cookie HttpOnly); solo el usuario y el vencimiento
    const guardado = sessionStorage.getItem('showtech_sesion') ?? '';
    expect(guardado).toContain('CLI-001');
    expect(guardado).not.toContain('tok-1');
    expect(guardado).not.toContain('token');
  });

  it('restaura una sesión vigente y descarta una vencida o corrupta', () => {
    sessionStorage.setItem('showtech_sesion', JSON.stringify({ expira_en: sesion().expira_en, usuario: USUARIO }));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    expect(TestBed.inject(AuthService).usuario()?.cliente_id).toBe('CLI-001');

    TestBed.resetTestingModule();
    sessionStorage.setItem('showtech_sesion', JSON.stringify({ expira_en: sesion(-1000).expira_en, usuario: USUARIO }));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    expect(TestBed.inject(AuthService).autenticado()).toBe(false);
    expect(sessionStorage.getItem('showtech_sesion')).toBeNull();

    TestBed.resetTestingModule();
    sessionStorage.setItem('showtech_sesion', '{no es json');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    expect(TestBed.inject(AuthService).autenticado()).toBe(false);
  });

  it('cerrarSesion avisa al backend y limpia la sesión local', () => {
    const { auth, http } = configurar();
    auth.iniciarSesionConGoogle('id-token').subscribe();
    http.expectOne('/api/auth/google').flush(sesion());
    expect(auth.autenticado()).toBe(true);

    auth.cerrarSesion();
    expect(auth.autenticado()).toBe(false);
    expect(sessionStorage.getItem('showtech_sesion')).toBeNull();
    const logout = http.expectOne('/api/auth/logout');
    expect(logout.request.method).toBe('POST');
    expect(logout.request.headers.has('Authorization')).toBe(false); // la cookie HttpOnly la adjunta el navegador
    logout.flush({ mensaje: 'Sesión cerrada.' });
  });

  it('traduce errores HTTP a mensajes en español y detecta cuándo hay que reiniciar el login', () => {
    const { auth, http } = configurar();
    let errorCredenciales: unknown;
    let errorDesafio: unknown;
    let errorCodigo: unknown;
    let errorServidor: unknown;

    auth.iniciarSesion('a@b.com', 'x').subscribe({ error: (e) => (errorCredenciales = e) });
    http.expectOne('/api/auth/login').flush({ error: 'Correo o contraseña incorrectos.' }, { status: 401, statusText: 'Unauthorized' });

    auth.verificarCodigo('d', '1').subscribe({ error: (e) => (errorDesafio = e) });
    http.expectOne('/api/auth/verificar').flush(
      { error: 'Demasiados intentos fallidos; vuelve a iniciar sesión.' },
      { status: 429, statusText: 'Too Many Requests' },
    );

    auth.verificarCodigo('d', '2').subscribe({ error: (e) => (errorCodigo = e) });
    http.expectOne('/api/auth/verificar').flush({ error: 'El código de verificación es incorrecto.' }, { status: 401, statusText: 'Unauthorized' });

    auth.iniciarSesion('a@b.com', 'x').subscribe({ error: (e) => (errorServidor = e) });
    http.expectOne('/api/auth/login').flush({ error: 'detalle interno secreto' }, { status: 500, statusText: 'Server Error' });

    expect(auth.obtenerMensajeError(errorCredenciales)).toBe('Correo o contraseña incorrectos.');
    expect(auth.requiereReiniciarLogin(errorCredenciales)).toBe(false);
    expect(auth.requiereReiniciarLogin(errorDesafio)).toBe(true);
    expect(auth.requiereReiniciarLogin(errorCodigo)).toBe(false);
    expect(auth.obtenerMensajeError(errorServidor)).not.toContain('secreto');
  });
});

describe('authInterceptor', () => {
  afterEach(() => sessionStorage.clear());

  it('no maneja tokens en JavaScript: ninguna llamada lleva cabecera Authorization', () => {
    const { auth, http } = configurar();
    auth.iniciarSesionConGoogle('id-token').subscribe();
    http.expectOne('/api/auth/google').flush(sesion());

    const cliente = TestBed.inject(HttpClient);
    cliente.get('/api/eventos').subscribe();
    cliente.get('https://ejemplo.com/datos').subscribe();

    expect(http.expectOne('/api/eventos').request.headers.has('Authorization')).toBe(false);
    expect(http.expectOne('https://ejemplo.com/datos').request.headers.has('Authorization')).toBe(false);
  });

  it('un 401 en una ruta de negocio cierra la sesión local y deja un aviso para el login', () => {
    const { auth, http } = configurar();
    auth.iniciarSesionConGoogle('id-token').subscribe();
    http.expectOne('/api/auth/google').flush(sesion());

    TestBed.inject(HttpClient).get('/api/eventos').subscribe({ error: () => undefined });
    http.expectOne('/api/eventos').flush({ error: 'Sesión no válida o expirada.' }, { status: 401, statusText: 'Unauthorized' });

    expect(auth.autenticado()).toBe(false);
    expect(auth.avisoSesion()).toContain('sesión expiró');
  });

  it('un 401 en /api/auth/* (credenciales incorrectas) no toca la sesión', () => {
    const { auth, http } = configurar();
    auth.iniciarSesionConGoogle('id-token').subscribe();
    http.expectOne('/api/auth/google').flush(sesion());

    auth.verificarCodigo('d', '000000').subscribe({ error: () => undefined });
    http.expectOne('/api/auth/verificar').flush({ error: 'El código de verificación es incorrecto.' }, { status: 401, statusText: 'Unauthorized' });

    expect(auth.autenticado()).toBe(true);
  });
});

describe('LoginComponent', () => {
  class GoogleFalso {
    resultado: Promise<string> = Promise.resolve('id-token-google');
    obtenerIdToken(): Promise<string> {
      return this.resultado;
    }
    mensajeDeError(err: unknown): string {
      return (err as { code?: string }).code === 'auth/popup-closed-by-user' ? '' : 'No fue posible iniciar sesión con Google.';
    }
  }

  function crear() {
    const google = new GoogleFalso();
    const { auth, http } = configurar([{ provide: GoogleAuthService, useValue: google }]);
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, comp: fixture.componentInstance, el, auth, http, google };
  }

  function escribir(el: HTMLElement, selector: string, valor: string): void {
    const input = el.querySelector(selector) as HTMLInputElement;
    input.value = valor;
    input.dispatchEvent(new Event('input'));
  }

  afterEach(() => sessionStorage.clear());

  it('valida correo y contraseña antes de llamar al backend', () => {
    const { fixture, comp, el, http } = crear();

    comp.enviarLogin(new Event('submit'));
    fixture.detectChanges();
    expect(el.querySelector('#errorEmail')?.textContent).toContain('Ingresa tu correo electrónico.');
    expect(el.querySelector('#errorPassword')?.textContent).toContain('Ingresa tu contraseña.');

    escribir(el, '#inputEmail', 'no-es-correo');
    escribir(el, '#inputPassword', 'x');
    comp.enviarLogin(new Event('submit'));
    fixture.detectChanges();
    expect(el.querySelector('#errorEmail')?.textContent).toContain('formato de correo válido');
    http.expectNone('/api/auth/login');
  });

  it('los atajos de cuentas demo rellenan el formulario', () => {
    const { fixture, comp, el } = crear();
    comp.usarCuentaDemo('asesor');
    fixture.detectChanges();
    expect((el.querySelector('#inputEmail') as HTMLInputElement).value).toBe('asesor@showtech.com');
    expect((el.querySelector('#inputPassword') as HTMLInputElement).value).toBe('Asesor2026!');
  });

  it('con credenciales correctas pasa a la verificación; con un código correcto abre la sesión', () => {
    const { fixture, comp, el, auth, http } = crear();
    comp.usarCuentaDemo('cliente');
    comp.enviarLogin(new Event('submit'));

    const login = http.expectOne('/api/auth/login');
    expect(login.request.body).toEqual({ correo: 'cliente@horizonte.com', password: 'Cliente2026!' });
    login.flush(DESAFIO);
    fixture.detectChanges();

    expect(comp.paso()).toBe(2);
    expect(el.textContent).toContain('cl***@horizonte.com');
    expect(el.querySelectorAll('.casilla-codigo').length).toBe(6);
    expect(el.textContent).toContain('Vigencia: 60s');
    expect(el.textContent).toContain('Reenviar código (30s)');
    expect(el.querySelector('.codigo-prueba-valor')?.textContent).toContain('••••••');

    comp.autocompletarCodigo();
    comp.verificarCodigo();
    const verificar = http.expectOne('/api/auth/verificar');
    expect(verificar.request.body).toEqual({ desafio_id: 'desafio-1', codigo: '123456' });
    verificar.flush(sesion());

    expect(auth.autenticado()).toBe(true);
    fixture.destroy(); // limpia los temporizadores
  });

  it('un código incompleto o incorrecto muestra el error sin cerrar el paso', () => {
    const { fixture, comp, el, http } = crear();
    comp.usarCuentaDemo('cliente');
    comp.enviarLogin(new Event('submit'));
    http.expectOne('/api/auth/login').flush(DESAFIO);
    fixture.detectChanges();

    comp.verificarCodigo();
    fixture.detectChanges();
    expect(el.querySelector('.alerta-error')?.textContent).toContain('completa los 6 dígitos');
    http.expectNone('/api/auth/verificar');

    comp.digitos.set(['0', '0', '0', '0', '0', '0']);
    comp.verificarCodigo();
    http.expectOne('/api/auth/verificar').flush({ error: 'El código de verificación es incorrecto.' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(comp.paso()).toBe(2);
    expect(el.querySelector('.alerta-error')?.textContent).toContain('es incorrecto');
    fixture.destroy();
  });

  it('si el backend invalida el desafío (demasiados intentos) vuelve al login con el aviso', () => {
    const { fixture, comp, el, http } = crear();
    comp.usarCuentaDemo('cliente');
    comp.enviarLogin(new Event('submit'));
    http.expectOne('/api/auth/login').flush(DESAFIO);
    comp.digitos.set(['1', '1', '1', '1', '1', '1']);
    comp.verificarCodigo();
    http.expectOne('/api/auth/verificar').flush(
      { error: 'Demasiados intentos fallidos; vuelve a iniciar sesión.' },
      { status: 429, statusText: 'Too Many Requests' },
    );
    fixture.detectChanges();

    expect(comp.paso()).toBe(1);
    expect(el.querySelector('.alerta-error')?.textContent).toContain('Demasiados intentos fallidos');
  });

  it('muestra el error del backend cuando la contraseña es incorrecta', () => {
    const { fixture, comp, el, http } = crear();
    comp.usarCuentaDemo('cliente');
    comp.enviarLogin(new Event('submit'));
    http.expectOne('/api/auth/login').flush({ error: 'Correo o contraseña incorrectos.' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(comp.paso()).toBe(1);
    expect(el.querySelector('.alerta-error')?.textContent).toContain('Correo o contraseña incorrectos.');
  });

  it('el acceso con Google envía el ID token al backend y abre la sesión', async () => {
    const { fixture, comp, auth, http } = crear();
    const promesa = comp.continuarConGoogle();
    await Promise.resolve();
    await Promise.resolve();

    const req = http.expectOne('/api/auth/google');
    expect(req.request.body).toEqual({ id_token: 'id-token-google' });
    req.flush({ ...sesion(), usuario: { ...USUARIO, cliente_id: undefined, proveedor: 'google' } });
    await promesa;

    expect(auth.autenticado()).toBe(true);
    expect(auth.usuario()?.proveedor).toBe('google');
    fixture.destroy();
  });

  it('cerrar el popup de Google no muestra error; un rechazo del backend sí', async () => {
    const { fixture, comp, el, google, http } = crear();

    google.resultado = Promise.reject({ code: 'auth/popup-closed-by-user' });
    await comp.continuarConGoogle();
    fixture.detectChanges();
    expect(el.querySelector('.alerta-error')).toBeNull();
    expect(comp.conectandoGoogle()).toBe(false);

    google.resultado = Promise.resolve('otro-token');
    const promesa = comp.continuarConGoogle();
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne('/api/auth/google').flush(
      { error: 'Ese correo está registrado con contraseña; inicia sesión con correo y contraseña.' },
      { status: 403, statusText: 'Forbidden' },
    );
    await promesa;
    fixture.detectChanges();
    expect(el.querySelector('.alerta-error')?.textContent).toContain('registrado con contraseña');
  });
});

describe('Estado vacío para cuentas sin cliente vinculado y código de solicitud', () => {
  afterEach(() => sessionStorage.clear());

  it('muestra «No tienes eventos vinculados a esta cuenta» con el correo de Google', async () => {
    const { EventosListaComponent } = await import('./components/eventos-lista/eventos-lista.component');
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(EventosListaComponent);
    fixture.componentInstance.eventos = [];
    fixture.componentInstance.sinClienteVinculado = true;
    fixture.componentInstance.cuentaGoogle = true;
    fixture.componentInstance.correoCuenta = 'ana@gmail.com';
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('No tienes eventos vinculados a esta cuenta');
    expect(texto).toContain('ana@gmail.com');
    expect(texto).toContain('contacta a tu asesor comercial');
    expect(texto).not.toContain('No hay eventos registrados');
  });

  it('un cliente con eventos vinculados sin eventos conserva el mensaje genérico', async () => {
    const { EventosListaComponent } = await import('./components/eventos-lista/eventos-lista.component');
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(EventosListaComponent);
    fixture.componentInstance.eventos = [];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No hay eventos registrados');
  });

  it('formatearCodigoSolicitud usa el año de fecha_creacion y rellena el número a 3 dígitos', async () => {
    const { formatearCodigoSolicitud } = await import('./models/gestor-eventos.models');
    expect(formatearCodigoSolicitud({ id: 7, fecha_creacion: '2026-11-06T15:05:32-05:00' })).toBe('SOL-2026-007');
    expect(formatearCodigoSolicitud({ id: 1234, fecha_creacion: '2027-01-02 10:00:00' })).toBe('SOL-2027-1234');
    expect(formatearCodigoSolicitud({ id: 5, fecha_creacion: '' })).toMatch(/^SOL-\d{4}-005$/);
  });
});

describe('Atajo diario del asesor', () => {
  afterEach(() => sessionStorage.clear());

  const ASESOR: Usuario = { id: 1, correo: 'asesor@showtech.com', nombre: 'Asesor(a) comercial', rol: 'asesor' };

  it('si la contraseña abre la sesión directamente, no se pasa al paso del código', () => {
    const google = { obtenerIdToken: async () => '', mensajeDeError: () => '' };
    const { auth, http } = configurar([{ provide: GoogleAuthService, useValue: google }]);
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    comp.usarCuentaDemo('asesor');
    comp.enviarLogin(new Event('submit'));
    http.expectOne('/api/auth/login').flush({
      desafio_id: '', correo_enmascarado: '', expira_en_segundos: 0, reenvio_en_segundos: 0, codigo_prueba: '',
      recordatorio_diario: true,
      sesion: { token: 't', expira_en: new Date(Date.now() + 3600_000).toISOString(), usuario: ASESOR },
    });
    fixture.detectChanges();

    expect(comp.paso()).toBe(1);
    expect(auth.autenticado()).toBe(true);
    expect(auth.usuario()?.rol).toBe('asesor');
    expect(comp.ingresando()).toBe(false);
  });

  it('en el paso del código el asesor ve el aviso de «una vez al día», y el cliente no', () => {
    const google = { obtenerIdToken: async () => '', mensajeDeError: () => '' };
    const { http } = configurar([{ provide: GoogleAuthService, useValue: google }]);
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;

    comp.usarCuentaDemo('asesor');
    comp.enviarLogin(new Event('submit'));
    http.expectOne('/api/auth/login').flush({ ...DESAFIO, recordatorio_diario: true });
    fixture.detectChanges();
    expect(el.textContent).toContain('Solo te pediremos este código una vez al día en este navegador.');

    // El reenvío no pierde el aviso
    comp.segundosReenvio.set(0);
    comp.reenviarCodigo();
    http.expectOne('/api/auth/reenviar-codigo').flush(DESAFIO);
    fixture.detectChanges();
    expect(el.textContent).toContain('una vez al día');
    fixture.destroy();
  });

  it('para el cliente no aparece el aviso', () => {
    const google = { obtenerIdToken: async () => '', mensajeDeError: () => '' };
    const { http } = configurar([{ provide: GoogleAuthService, useValue: google }]);
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    comp.usarCuentaDemo('cliente');
    comp.enviarLogin(new Event('submit'));
    http.expectOne('/api/auth/login').flush(DESAFIO);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('una vez al día');
    fixture.destroy();
  });
});

describe('Casillas del código: escritura rápida', () => {
  afterEach(() => sessionStorage.clear());

  it('el foco pasa a la siguiente casilla al instante, así que teclear rápido no pierde dígitos', () => {
    const google = { obtenerIdToken: async () => '', mensajeDeError: () => '' };
    const { http } = configurar([{ provide: GoogleAuthService, useValue: google }]);
    const fixture = TestBed.createComponent(LoginComponent);
    document.body.appendChild(fixture.nativeElement); // el foco real solo funciona dentro del documento
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    comp.usarCuentaDemo('cliente');
    comp.enviarLogin(new Event('submit'));
    http.expectOne('/api/auth/login').flush(DESAFIO);
    fixture.detectChanges();

    const casillas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('.casilla-codigo'));
    expect(casillas.length).toBe(6);
    casillas[0].focus();

    // Se teclean los 6 dígitos sin esperar entre uno y otro (sin dejar pasar ningún temporizador)
    '123456'.split('').forEach((digito, i) => {
      const activa = document.activeElement as HTMLInputElement;
      expect(activa, `el dígito ${i + 1} debía caer en su propia casilla`).toBe(casillas[i]);
      activa.value = digito;
      activa.dispatchEvent(new Event('input'));
    });

    expect(comp.digitos().join('')).toBe('123456');
    fixture.destroy();
    fixture.nativeElement.remove();
  });
});

describe('Aviso de sesión terminada', () => {
  afterEach(() => sessionStorage.clear());

  it('sobrevive a la recarga de la página y se muestra una sola vez', () => {
    const { auth } = configurar();
    auth.limpiarSesion('Tu sesión expiró o ya no es válida. Inicia sesión nuevamente.');

    // La página se recarga (App lo hace al cerrar sesión): se crea un servicio nuevo con el mismo sessionStorage
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    expect(TestBed.inject(AuthService).avisoSesion()).toContain('sesión expiró');

    // Ya no vuelve a aparecer en la siguiente recarga
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    expect(TestBed.inject(AuthService).avisoSesion()).toBe('');
  });

  it('un cierre de sesión normal no deja ningún aviso', () => {
    const { auth } = configurar();
    auth.limpiarSesion();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    expect(TestBed.inject(AuthService).avisoSesion()).toBe('');
  });
});
