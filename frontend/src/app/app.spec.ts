import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { SolicitudFormularioComponent } from './components/solicitud-formulario/solicitud-formulario.component';
import { Evento } from './models/gestor-eventos.models';

const EVENTO_PRUEBA: Evento = {
  id: 1,
  nombre: 'Lanzamiento Corporativo Showtech 2026',
  espacio: 'Auditorio Principal A',
  fecha: '2026-11-15',
  hora_inicio: '09:00',
  hora_fin: '13:00',
  estado: 'Confirmado',
};

describe('App y SolicitudFormularioComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, SolicitudFormularioComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('debe mostrar el encabezado SHOWTECH SOLUTIONS, insignia Evento seleccionado, etiqueta Fecha propuesta * y mensaje previo al registro', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('SHOWTECH SOLUTIONS');
    expect(compiled.querySelector('h1')?.textContent).toContain('Solicitudes de modificación');
    expect(compiled.textContent).toContain('Todavía no hay solicitudes registradas');

    // Insignias de estado y selección en la tarjeta
    expect(compiled.querySelector('.insignia-estado')?.textContent?.trim()).toBe('Confirmado');
    expect(compiled.querySelector('.insignia-seleccionado')?.textContent?.trim()).toBe(
      'Evento seleccionado'
    );
    expect(compiled.querySelector('.tarjeta-evento--activo')).toBeTruthy();

    // Etiqueta de fecha sin "(YYYY-MM-DD)" y con indicador obligatorio
    const labelFecha = compiled.querySelector('label[for="fecha_propuesta"]');
    expect(labelFecha?.textContent?.trim()).toBe('Fecha propuesta *');

    // Mensaje antes de registrar
    expect(compiled.querySelector('.mensaje-reserva')?.textContent).toContain(
      'La solicitud quedará pendiente de revisión. Tu reserva actual se mantendrá sin cambios'
    );
  });

  it('debe validar formato estricto HH:mm, rango 06:00-22:00, inicio < fin, motivo Unicode <= 400 y cambio obligatorio', () => {
    const fixture = TestBed.createComponent(SolicitudFormularioComponent);
    const comp = fixture.componentInstance;
    comp.eventoSeleccionado = EVENTO_PRUEBA;
    fixture.detectChanges();

    // Al cargar el evento sin cambios ni motivo, el formulario es inválido
    expect(comp.formulario.invalid).toBe(true);

    // Mismo horario y fecha que el evento original -> error sinCambiosRespectoAlOriginal
    comp.formulario.patchValue({
      fecha_propuesta: '2026-11-15',
      hora_inicio_propuesta: '09:00',
      hora_fin_propuesta: '13:00',
      motivo: 'Motivo válido pero sin cambiar horario ni fecha',
    });
    expect(comp.formulario.hasError('sinCambiosRespectoAlOriginal')).toBe(true);

    // Hora en formato no estricto (9:00) y fuera de rango (05:30 o 22:30)
    comp.formulario.patchValue({
      fecha_propuesta: '2026-11-18',
      hora_inicio_propuesta: '9:00',
      hora_fin_propuesta: '13:00',
    });
    expect(comp.formulario.get('hora_inicio_propuesta')?.hasError('formatoHora')).toBe(true);

    comp.formulario.patchValue({
      hora_inicio_propuesta: '05:30',
      hora_fin_propuesta: '22:30',
    });
    expect(comp.formulario.get('hora_inicio_propuesta')?.hasError('rangoHorario')).toBe(true);
    expect(comp.formulario.get('hora_fin_propuesta')?.hasError('rangoHorario')).toBe(true);

    // Inicio posterior o igual al fin
    comp.formulario.patchValue({
      hora_inicio_propuesta: '15:00',
      hora_fin_propuesta: '12:00',
    });
    expect(comp.formulario.hasError('inicioPosteriorOIgualAFin')).toBe(true);

    // Motivo con solo espacios
    comp.formulario.patchValue({
      hora_inicio_propuesta: '10:00',
      hora_fin_propuesta: '14:00',
      motivo: '     ',
    });
    expect(comp.formulario.get('motivo')?.hasError('motivoVacio')).toBe(true);

    // Motivo de 400 caracteres Unicode (válido) vs 401 caracteres Unicode (inválido)
    comp.formulario.patchValue({
      motivo: 'á'.repeat(400),
    });
    expect(comp.longitudMotivoUnicode).toBe(400);
    expect(comp.formulario.valid).toBe(true);

    comp.formulario.patchValue({
      motivo: 'ñ'.repeat(401),
    });
    expect(comp.longitudMotivoUnicode).toBe(401);
    expect(comp.formulario.get('motivo')?.hasError('maximoUnicode')).toBe(true);
  });

  it('debe bloquear el doble envío, actualizar el mensaje tras registrar y mostrar rangos horarios con .rango-horario', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([]);
    fixture.detectChanges();

    const payload = {
      evento_id: 1,
      motivo: 'Cambio de horario requerido',
      fecha_propuesta: '2026-11-20',
      hora_inicio_propuesta: '10:00',
      hora_fin_propuesta: '14:00',
    };

    // Primer envío e intento inmediato de segundo envío antes de recibir respuesta
    app.alEnviarSolicitud(payload);
    app.alEnviarSolicitud(payload);

    const postReqs = httpMock.match('/api/solicitudes');
    expect(postReqs.length).toBe(1);
    expect(postReqs[0].request.method).toBe('POST');

    const solicitudCreada = {
      id: 1,
      ...payload,
      estado: 'Pendiente de revisión',
      fecha_creacion: '2026-11-02 12:10:00',
      datos_originales: {
        fecha: '2026-11-15',
        hora_inicio: '09:00',
        hora_fin: '13:00',
      },
      datos_propuestos: {
        fecha: '2026-11-20',
        hora_inicio: '10:00',
        hora_fin: '14:00',
      },
    };

    postReqs[0].flush({
      mensaje: 'Solicitud registrada exitosamente.',
      solicitud: solicitudCreada,
    });

    // Refresco posterior de GET /api/solicitudes
    const refreshReq = httpMock.expectOne('/api/solicitudes');
    expect(refreshReq.request.method).toBe('GET');
    refreshReq.flush([solicitudCreada]);
    fixture.detectChanges();

    expect(app.enviandoSolicitud()).toBe(false);
    expect(app.eventoSeleccionadoTienePendiente()).toBe(true);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.mensaje-reserva')?.textContent).toContain(
      'La solicitud está pendiente de revisión. Tu reserva actual se mantiene sin cambios'
    );

    const rangos = compiled.querySelectorAll('.rango-horario');
    expect(rangos.length).toBeGreaterThanOrEqual(2);
    expect(rangos[0].textContent?.replace(/\s+/g, ' ').trim()).toBe('09:00 - 13:00');
    expect(rangos[1].textContent?.replace(/\s+/g, ' ').trim()).toBe('10:00 - 14:00');
  });

  it('debe conservar el estado pendiente y el mensaje correspondiente al recargar la página desde la API', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([
      {
        id: 1,
        evento_id: 1,
        motivo: 'Solicitud previamente registrada',
        fecha_propuesta: '2026-11-20',
        hora_inicio_propuesta: '10:00',
        hora_fin_propuesta: '14:00',
        estado: 'Pendiente de revisión',
        fecha_creacion: '2026-11-02 12:10:00',
        datos_originales: {
          fecha: '2026-11-15',
          hora_inicio: '09:00',
          hora_fin: '13:00',
        },
        datos_propuestos: {
          fecha: '2026-11-20',
          hora_inicio: '10:00',
          hora_fin: '14:00',
        },
      },
    ]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.mensaje-reserva')?.textContent).toContain(
      'La solicitud está pendiente de revisión. Tu reserva actual se mantiene sin cambios'
    );
    const btnSolicitar = compiled.querySelector('.btn-solicitar') as HTMLButtonElement | null;
    expect(btnSolicitar?.disabled).toBe(true);
    const btnEnviar = compiled.querySelector('.btn-enviar') as HTMLButtonElement | null;
    expect(btnEnviar?.disabled).toBe(true);
  });
});
