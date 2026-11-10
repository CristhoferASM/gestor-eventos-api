import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { VinculoCuentasComponent } from './components/vinculo-cuentas/vinculo-cuentas.component';
import { EventosListaComponent } from './components/eventos-lista/eventos-lista.component';
import { AuthService } from './services/auth.service';
import { Usuario } from './models/gestor-eventos.models';

const CLIENTES = [
  { cliente_id: 'CLI-001', eventos: ['Ceremonia de graduación'] },
  { cliente_id: 'CLI-002', eventos: ['Encuentro de docentes'] },
];
const ANA: Usuario = { id: 0, correo: 'ana@gmail.com', nombre: 'Ana Pérez', rol: 'cliente', proveedor: 'google' };

function montarPanel() {
  sessionStorage.clear();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(VinculoCuentasComponent);
  fixture.detectChanges();
  return { fixture, comp: fixture.componentInstance, http, el: fixture.nativeElement as HTMLElement };
}

describe('Panel de vinculación de cuentas de Google (asesor)', () => {
  afterEach(() => sessionStorage.clear());

  it('lista las cuentas pendientes y los clientes disponibles', () => {
    const { fixture, http, el } = montarPanel();
    http.expectOne('/api/clientes').flush(CLIENTES);
    http.expectOne('/api/usuarios/pendientes-de-vinculo').flush([ANA]);
    fixture.detectChanges();

    expect(el.textContent).toContain('Ana Pérez');
    expect(el.textContent).toContain('ana@gmail.com');
    expect(el.textContent).toContain('CLI-002 — Encuentro de docentes');
    expect((el.querySelector('.fila-vinculo button') as HTMLButtonElement).disabled).toBe(true); // sin elegir cliente
    http.verify();
  });

  it('muestra la razón social del cliente cuando la API la envía', () => {
    const { fixture, http, el } = montarPanel();
    http.expectOne('/api/clientes').flush([{ cliente_id: 'CLI-001', razon_social: 'Promoción Horizonte 2026', eventos: ['Ceremonia de graduación'] }]);
    http.expectOne('/api/usuarios/pendientes-de-vinculo').flush([ANA]);
    fixture.detectChanges();

    expect(el.textContent).toContain('CLI-001 — Promoción Horizonte 2026 — Ceremonia de graduación');
    http.verify();
  });

  it('vincula con el cliente elegido y quita la cuenta de la lista', () => {
    const { fixture, comp, http, el } = montarPanel();
    http.expectOne('/api/clientes').flush(CLIENTES);
    http.expectOne('/api/usuarios/pendientes-de-vinculo').flush([ANA]);
    fixture.detectChanges();

    comp.elegir('ana@gmail.com', 'CLI-002');
    fixture.detectChanges();
    const boton = el.querySelector('.fila-vinculo button') as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    boton.click();
    fixture.detectChanges();

    const req = http.expectOne('/api/usuarios/vincular');
    expect(req.request.body).toEqual({ correo: 'ana@gmail.com', cliente_id: 'CLI-002' });
    req.flush({ mensaje: 'Cuenta vinculada.', usuario: { ...ANA, cliente_id: 'CLI-002' } });
    fixture.detectChanges();

    expect(el.textContent).toContain('vinculada con CLI-002');
    expect(el.textContent).toContain('No hay cuentas de Google pendientes de vincular');
    expect(el.querySelector('.fila-vinculo')).toBeNull();
  });

  it('muestra el mensaje del servidor si el vínculo falla', () => {
    const { fixture, comp, http, el } = montarPanel();
    http.expectOne('/api/clientes').flush(CLIENTES);
    http.expectOne('/api/usuarios/pendientes-de-vinculo').flush([ANA]);
    comp.elegir('ana@gmail.com', 'CLI-002');
    comp.vincular(ANA);
    http.expectOne('/api/usuarios/vincular').flush({ error: 'El cliente indicado no existe.' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('El cliente indicado no existe.');
    expect(el.querySelector('.fila-vinculo')).toBeTruthy(); // sigue pendiente
  });

  it('una cuenta que no es asesor recibe el 403 como error visible', () => {
    const { fixture, http, el } = montarPanel();
    http.expectOne('/api/clientes').flush({ error: 'Solo el asesor comercial puede administrar la vinculación de cuentas.' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
  });
});

describe('Cuenta sin vínculo: botón «Ya me vincularon: actualizar»', () => {
  it('emite el evento para volver a consultar', () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(EventosListaComponent);
    const comp = fixture.componentInstance;
    comp.eventos = [];
    comp.sinClienteVinculado = true;
    let emitido = 0;
    comp.verificarVinculo.subscribe(() => emitido++);
    fixture.detectChanges();

    const boton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Ya me vincularon'),
    ) as HTMLButtonElement;
    boton.click();
    expect(emitido).toBe(1);
  });

  it('AuthService.refrescarUsuario actualiza el usuario con el cliente_id recién asignado', () => {
    sessionStorage.clear();
    sessionStorage.setItem(
      'showtech_sesion',
      JSON.stringify({ expira_en: new Date(Date.now() + 3600_000).toISOString(), usuario: ANA }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    expect(auth.usuario()?.cliente_id).toBeUndefined();

    auth.refrescarUsuario().subscribe();
    http.expectOne('/api/auth/me').flush({ ...ANA, cliente_id: 'CLI-002' });

    expect(auth.usuario()?.cliente_id).toBe('CLI-002');
    expect(sessionStorage.getItem('showtech_sesion')).toContain('CLI-002');
    sessionStorage.clear();
  });
});
