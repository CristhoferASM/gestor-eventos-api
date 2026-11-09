import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { Evento, Solicitud, Usuario } from './models/gestor-eventos.models';

const CLIENTE: Usuario = { id: 2, correo: 'cliente@horizonte.com', nombre: 'Promoción Horizonte 2026', rol: 'cliente', cliente_id: 'CLI-001' };
const ASESOR: Usuario = { id: 1, correo: 'asesor@showtech.com', nombre: 'Asesor(a) comercial', rol: 'asesor' };

const EVENTO = {
  id: 1,
  cliente_id: 'CLI-001',
  nombre: 'Ceremonia de graduación',
  espacio: 'Auditorio Showtech',
  fecha: '2026-11-15',
  hora_inicio: '09:00',
  hora_fin: '13:00',
  estado: 'Confirmado',
  contacto: 'María Rodríguez',
  telefono: '998 765 432',
  correo: 'm@demo.test',
  observaciones: '',
} as Evento;

function solicitud(estado: string, extra: Partial<Solicitud> = {}): Solicitud {
  const datos = {
    nombre: 'Ceremonia de graduación', espacio: 'Auditorio Showtech', contacto: 'María Rodríguez',
    telefono: '998 765 432', correo: 'm@demo.test', observaciones: '',
    fecha: '2026-11-15', hora_inicio: '09:00', hora_fin: '13:00',
  };
  return {
    id: 1,
    evento_id: 1,
    motivo: 'Cambio de horario',
    fecha_propuesta: '2026-11-15',
    hora_inicio_propuesta: '10:00',
    hora_fin_propuesta: '13:00',
    informacion_general_propuesta: { nombre: datos.nombre, contacto: datos.contacto, telefono: datos.telefono, correo: datos.correo, observaciones: '' },
    estado,
    fecha_creacion: '2026-11-06T15:05:32-05:00',
    datos_originales: datos,
    datos_propuestos: { ...datos, hora_inicio: '10:00' },
    ...extra,
  } as Solicitud;
}

function sesion(usuario: Usuario): void {
  sessionStorage.setItem(
    'showtech_sesion',
    JSON.stringify({ token: 't', expira_en: new Date(Date.now() + 3600_000).toISOString(), usuario }),
  );
}

async function montar(usuario: Usuario, solicitudes: Solicitud[]) {
  sessionStorage.clear();
  sesion(usuario);
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [App],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(App);
  fixture.detectChanges();
  http.expectOne('/api/eventos').flush([EVENTO]);
  http.expectOne('/api/solicitudes').flush(solicitudes);
  http.expectOne('/api/adicionales').flush([]);
  fixture.detectChanges();
  return { fixture, app: fixture.componentInstance, http, el: fixture.nativeElement as HTMLElement };
}

describe('Retiro de solicitud (portal del cliente)', () => {
  afterEach(() => sessionStorage.clear());

  it('el cliente ve «Retirar solicitud» solo en solicitudes pendientes', async () => {
    const { fixture, app, el } = await montar(CLIENTE, [solicitud('Pendiente de revisión')]);

    app.abrirModalDetalle(app.solicitudes()[0]);
    fixture.detectChanges();
    expect(el.querySelector('#btn-retirar-solicitud')?.textContent).toContain('Retirar solicitud');
    expect(el.querySelector('.btn-outline-danger')).toBeTruthy();

    app.cerrarModalDetalle();
    app.abrirModalDetalle(solicitud('Retirada por el cliente', { fecha_retiro: '2026-11-07T10:00:00-05:00' }));
    fixture.detectChanges();
    expect(el.querySelector('#btn-retirar-solicitud')).toBeNull();
    expect(el.querySelector('.modal-nota')?.textContent).toContain('retirada por el cliente');
    expect(el.querySelector('.modal-nota')?.textContent).toContain('Puede formular una nueva solicitud');
  });

  it('el asesor no puede retirar: ve su portal y la regla del componente lo rechaza', async () => {
    const { fixture, app, http, el } = await montar(ASESOR, [solicitud('Pendiente de revisión')]);
    expect(app.vistaActiva()).toBe('asesor');
    expect(el.querySelector('app-asesor-portal')).toBeTruthy();
    expect(el.querySelector('#btn-retirar-solicitud')).toBeNull();
    expect(app.puedeRetirar(solicitud('Pendiente de revisión'))).toBe(false);
    http.verify();
    fixture.destroy();
  });

  it('pide confirmación, llama al backend, actualiza el estado, muestra el aviso y libera el evento', async () => {
    const { fixture, app, http, el } = await montar(CLIENTE, [solicitud('Pendiente de revisión')]);

    // Mientras está pendiente, el evento no permite otra solicitud
    expect(el.querySelector('.btn-solicitar')?.hasAttribute('disabled')).toBe(true);

    app.abrirModalDetalle(app.solicitudes()[0]);
    fixture.detectChanges();
    (el.querySelector('#btn-retirar-solicitud') as HTMLButtonElement).click();
    fixture.detectChanges();

    const dialogo = el.querySelector('#titulo-modal-retiro');
    expect(dialogo?.textContent).toContain('Retirar solicitud de modificación');
    expect(el.textContent).toContain('¿Deseas retirar esta solicitud? Tu reserva actual se mantendrá sin cambios.');

    // «Volver» cancela sin llamar al backend
    (el.querySelector('#btn-cancelar-retiro') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectNone('/api/solicitudes/1/retirar');
    expect(el.querySelector('#titulo-modal-retiro')).toBeNull();

    // Confirmar: un único POST (el doble clic no duplica la llamada)
    (el.querySelector('#btn-retirar-solicitud') as HTMLButtonElement).click();
    fixture.detectChanges();
    const confirmar = el.querySelector('#btn-confirmar-retiro') as HTMLButtonElement;
    confirmar.click();
    confirmar.click();
    fixture.detectChanges();
    expect((el.querySelector('#btn-confirmar-retiro') as HTMLButtonElement).disabled).toBe(true);

    const req = http.expectOne('/api/solicitudes/1/retirar');
    expect(req.request.method).toBe('POST');
    req.flush({
      mensaje: 'Solicitud retirada. Tu reserva se mantiene sin cambios.',
      solicitud: solicitud('Retirada por el cliente', { fecha_retiro: '2026-11-07T10:00:00-05:00' }),
    });
    fixture.detectChanges();

    expect(el.querySelector('#titulo-modal-retiro')).toBeNull();
    expect(app.solicitudes()[0].estado).toBe('Retirada por el cliente');
    expect(el.querySelector('.toast.ok')?.textContent).toContain('Solicitud retirada. Tu reserva se mantiene sin cambios');
    expect(el.querySelector('#btn-retirar-solicitud')).toBeNull();
    expect(el.querySelector('.modal-nota')?.textContent).toContain('retirada por el cliente');

    // Al cerrar el detalle, el evento vuelve a permitir una nueva solicitud y la lista muestra la insignia gris
    app.cerrarModalDetalle();
    fixture.detectChanges();
    expect(el.querySelector('.btn-solicitar')?.hasAttribute('disabled')).toBe(false);
    expect(el.querySelector('.badge-solicitud-retirada')?.textContent).toContain('Retirada por el cliente');
    expect(el.querySelector('.tarjeta-evento-cliente .badge-solicitud-pendiente')).toBeNull();
  });

  it('si el servidor rechaza el retiro (409) muestra el motivo, conserva el modal y refresca la lista', async () => {
    const { fixture, app, http, el } = await montar(CLIENTE, [solicitud('Pendiente de revisión')]);
    app.abrirModalDetalle(app.solicitudes()[0]);
    fixture.detectChanges();
    app.abrirModalRetiro();
    fixture.detectChanges();
    app.confirmarRetiro();

    http.expectOne('/api/solicitudes/1/retirar').flush(
      { error: 'Solo es posible retirar solicitudes que sigan pendientes de revisión.' },
      { status: 409, statusText: 'Conflict' },
    );
    http.expectOne('/api/solicitudes').flush([solicitud('Retirada por el cliente')]);
    fixture.detectChanges();

    expect(el.querySelector('#titulo-modal-retiro')).toBeTruthy();
    expect(el.querySelector('#titulo-modal-retiro')?.closest('.modal-card')?.textContent).toContain('Solo es posible retirar solicitudes');
    expect((el.querySelector('#btn-confirmar-retiro') as HTMLButtonElement).disabled).toBe(false);
  });

  it('Escape cierra primero el diálogo de retiro y no el detalle', async () => {
    const { fixture, app, el } = await montar(CLIENTE, [solicitud('Pendiente de revisión')]);
    app.abrirModalDetalle(app.solicitudes()[0]);
    app.abrirModalRetiro();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el.querySelector('#titulo-modal-retiro')).toBeNull();
    expect(el.querySelector('#titulo-modal-detalle')).toBeTruthy();
  });
});
