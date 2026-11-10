import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { SolicitudFormularioComponent } from './components/solicitud-formulario/solicitud-formulario.component';
import { ConsultaDisponibilidadPayload, Evento } from './models/gestor-eventos.models';

const EVENTO: Evento = {
  id: 1,
  nombre: 'Ceremonia de graduación',
  espacio: 'Auditorio Showtech',
  fecha: '2026-11-15',
  hora_inicio: '09:00',
  hora_fin: '13:00',
  estado: 'Confirmado',
  contacto: 'María Rodríguez',
  telefono: '998 765 432',
  correo: 'm.rodriguez@demo-showtech.test',
  observaciones: 'Silletería para 350 personas.',
  has_montaje: true,
  montaje_fecha: '2026-11-15',
  montaje_hora_inicio: '08:00',
  montaje_hora_fin: '09:00',
  has_desmontaje: true,
  desmontaje_fecha: '2026-11-15',
  desmontaje_hora_inicio: '13:00',
  desmontaje_hora_fin: '14:00',
  has_ensayo: false,
  ensayo_fecha: '',
  ensayo_hora_inicio: '',
  ensayo_hora_fin: '',
  adicionales: [],
};

// El formulario espera 500 ms a que el usuario deje de escribir antes de consultar
const esperarRetardo = () => new Promise<void>((resolver) => setTimeout(resolver, 650));

describe('Consulta previa de disponibilidad (formulario del cliente)', () => {
  function montar() {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(SolicitudFormularioComponent);
    const comp = fixture.componentInstance;
    comp.eventoSeleccionado = EVENTO;
    fixture.detectChanges();
    const emitidos: (ConsultaDisponibilidadPayload | null)[] = [];
    comp.consultarDisponibilidad.subscribe((p) => emitidos.push(p));
    return { fixture, comp, emitidos, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => sessionStorage.clear());

  it('emite la propuesta de horario sin motivo cuando el horario cambia, y solo una vez por cambio', async () => {
    const { comp, emitidos } = montar();

    comp.formulario.patchValue({ hora_inicio_propuesta: '10:00' });
    comp.formulario.patchValue({ hora_fin_propuesta: '12:00' }); // dos cambios seguidos = una sola consulta
    await esperarRetardo();

    expect(emitidos.length).toBe(1);
    const p = emitidos[0]!;
    expect(p.evento_id).toBe(1);
    expect(p.fecha_propuesta).toBe('2026-11-15');
    expect(p.hora_inicio_propuesta).toBe('10:00');
    expect(p.hora_fin_propuesta).toBe('12:00');
    expect(p.motivo).toBeUndefined();
    expect(p.tiempos_tecnicos_propuestos?.has_montaje).toBe(true);
    expect(p.tiempos_tecnicos_propuestos?.montaje_hora_inicio).toBe('08:00');

    // Repetir el mismo valor no vuelve a consultar
    comp.formulario.patchValue({ hora_fin_propuesta: '12:00' });
    await esperarRetardo();
    expect(emitidos.length).toBe(1);
  });

  it('no hay nada que consultar si el horario es inválido o vuelve a ser el del evento (emite null)', async () => {
    const { comp, emitidos } = montar();

    comp.formulario.patchValue({ hora_inicio_propuesta: '10:00' });
    await esperarRetardo();
    expect(emitidos.length).toBe(1);
    expect(emitidos[0]).not.toBeNull();

    comp.formulario.patchValue({ hora_inicio_propuesta: '25:00' }); // formato/rango inválido
    await esperarRetardo();
    expect(emitidos.length).toBe(2);
    expect(emitidos[1]).toBeNull();

    comp.formulario.patchValue({ hora_inicio_propuesta: '10:00' });
    await esperarRetardo();
    expect(emitidos[2]).not.toBeNull();

    comp.formulario.patchValue({ hora_inicio_propuesta: EVENTO.hora_inicio }); // igual al evento
    await esperarRetardo();
    expect(emitidos[3]).toBeNull();
  });

  it('cambiar solo un tiempo técnico también consulta', async () => {
    const { comp, emitidos } = montar();
    comp.formulario.patchValue({ montaje_hora_inicio: '07:00' });
    await esperarRetardo();
    expect(emitidos.length).toBe(1);
    expect(emitidos[0]?.tiempos_tecnicos_propuestos?.montaje_hora_inicio).toBe('07:00');
  });

  it('muestra el aviso de horario no disponible con el mensaje del servidor', () => {
    const { fixture, el } = montar();
    // setInput es lo que hace la plantilla real y marca la vista para refrescarse (asignar la propiedad a mano no)
    fixture.componentRef.setInput('disponibilidad', {
      evento_id: 1,
      disponible: false,
      mensaje: 'El auditorio ya cuenta con una reserva programada en este horario.',
    });
    fixture.detectChanges();

    const aviso = el.querySelector('#avisoDisponibilidad');
    expect(aviso).toBeTruthy();
    expect(aviso?.classList.contains('aviso-alerta')).toBe(true);
    expect(aviso?.getAttribute('role')).toBe('status');
    expect(aviso?.textContent).toContain('Horario no disponible');
    expect(aviso?.textContent).toContain('ya cuenta con una reserva programada');
  });

  it('muestra el aviso de horario disponible y oculta el de otro evento', () => {
    const { fixture, el } = montar();
    fixture.componentRef.setInput('disponibilidad', { evento_id: 1, disponible: true });
    fixture.detectChanges();
    const aviso = el.querySelector('#avisoDisponibilidad');
    expect(aviso?.classList.contains('aviso-ok')).toBe(true);
    expect(aviso?.textContent).toContain('Horario disponible');

    fixture.componentRef.setInput('disponibilidad', { evento_id: 2, disponible: false, mensaje: 'Otro evento' });
    fixture.detectChanges();
    expect(el.querySelector('#avisoDisponibilidad')).toBeNull();

    fixture.componentRef.setInput('disponibilidad', null);
    fixture.detectChanges();
    expect(el.querySelector('#avisoDisponibilidad')).toBeNull();
  });
});

describe('App: consulta previa de disponibilidad', () => {
  const PAYLOAD: ConsultaDisponibilidadPayload = {
    evento_id: 1,
    fecha_propuesta: '2026-11-15',
    hora_inicio_propuesta: '13:30',
    hora_fin_propuesta: '14:30',
  };

  function montar() {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const app = TestBed.createComponent(App).componentInstance;
    return { app, http: TestBed.inject(HttpTestingController) };
  }

  afterEach(() => sessionStorage.clear());

  it('consulta POST /api/disponibilidad y guarda el resultado atado al evento', () => {
    const { app, http } = montar();
    app.alConsultarDisponibilidad(PAYLOAD);

    const req = http.expectOne('/api/disponibilidad');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(PAYLOAD);
    req.flush({ disponible: false, mensaje: 'Reservado' });

    expect(app.disponibilidad()).toEqual({ evento_id: 1, disponible: false, mensaje: 'Reservado' });
    http.verify();
  });

  it('una consulta nueva cancela la anterior y null limpia el resultado', () => {
    const { app, http } = montar();
    app.alConsultarDisponibilidad(PAYLOAD);
    const primera = http.expectOne('/api/disponibilidad');

    app.alConsultarDisponibilidad({ ...PAYLOAD, hora_inicio_propuesta: '15:00', hora_fin_propuesta: '16:00' });
    expect(primera.cancelled).toBe(true);
    http.expectOne('/api/disponibilidad').flush({ disponible: true });
    expect(app.disponibilidad()).toEqual({ evento_id: 1, disponible: true });

    app.alConsultarDisponibilidad(null);
    expect(app.disponibilidad()).toBeNull();
    http.verify();
  });

  it('si la consulta falla no muestra nada (es orientativa; el servidor vuelve a comprobar al enviar)', () => {
    const { app, http } = montar();
    app.alConsultarDisponibilidad({ ...PAYLOAD, hora_inicio_propuesta: '15:00', hora_fin_propuesta: '16:00' });
    http.expectOne('/api/disponibilidad').flush({ disponible: true });
    expect(app.disponibilidad()?.disponible).toBe(true);

    app.alConsultarDisponibilidad(PAYLOAD);
    http.expectOne('/api/disponibilidad').flush({ error: 'Error interno del servidor.' }, { status: 500, statusText: 'Server Error' });
    expect(app.disponibilidad()).toBeNull();
    http.verify();
  });
});
