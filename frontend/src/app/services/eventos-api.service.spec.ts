import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EventosApiService } from './eventos-api.service';
import { SolicitudCreacionPayload } from '../models/gestor-eventos.models';

describe('EventosApiService', () => {
  let service: EventosApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), EventosApiService],
    });
    service = TestBed.inject(EventosApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('debe consultar GET /api/eventos', () => {
    const eventosDemo = [
      {
        id: 1,
        nombre: 'Lanzamiento Corporativo Showtech 2026',
        espacio: 'Auditorio Principal A',
        fecha: '2026-11-15',
        hora_inicio: '09:00',
        hora_fin: '13:00',
        estado: 'Confirmado',
      },
    ];

    service.obtenerEventos().subscribe((res) => {
      expect(res.length).toBe(1);
      expect(res[0].nombre).toBe('Lanzamiento Corporativo Showtech 2026');
    });

    const req = httpMock.expectOne('/api/eventos');
    expect(req.request.method).toBe('GET');
    req.flush(eventosDemo);
  });

  it('debe enviar POST /api/solicitudes con el contrato esperado', () => {
    const payload: SolicitudCreacionPayload = {
      evento_id: 1,
      motivo: 'Cambio de horario por montaje técnico',
      fecha_propuesta: '2026-11-18',
      hora_inicio_propuesta: '10:00',
      hora_fin_propuesta: '14:00',
    };

    service.crearSolicitud(payload).subscribe((res) => {
      expect(res.mensaje).toBe('Solicitud registrada exitosamente.');
      expect(res.solicitud.id).toBe(1);
      expect(res.solicitud.estado).toBe('Pendiente de revisión');
    });

    const req = httpMock.expectOne('/api/solicitudes');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({
      mensaje: 'Solicitud registrada exitosamente.',
      solicitud: {
        id: 1,
        ...payload,
        estado: 'Pendiente de revisión',
        fecha_creacion: '2026-11-02 12:00:00',
        datos_originales: {
          fecha: '2026-11-15',
          hora_inicio: '09:00',
          hora_fin: '13:00',
        },
        datos_propuestos: {
          fecha: '2026-11-18',
          hora_inicio: '10:00',
          hora_fin: '14:00',
        },
      },
    });
  });

  it('debe traducir códigos 400, 404, 409 y 500 a mensajes comprensibles sin filtrar detalles en 500', () => {
    const err400 = new HttpErrorResponse({
      status: 400,
      error: { error: 'La hora de inicio propuesta debe ser anterior a la hora de fin.' },
    });
    expect(service.obtenerMensajeError(err400)).toContain(
      'La hora de inicio propuesta debe ser anterior a la hora de fin.'
    );

    const err404 = new HttpErrorResponse({
      status: 404,
      error: { error: 'El evento con ID 99 no existe.' },
    });
    expect(service.obtenerMensajeError(err404)).toContain('El evento con ID 99 no existe.');

    const err409 = new HttpErrorResponse({
      status: 409,
      error: { error: 'Ya existe una solicitud pendiente de revisión para este evento.' },
    });
    expect(service.obtenerMensajeError(err409)).toContain('solicitud pendiente de revisión');

    const err500 = new HttpErrorResponse({
      status: 500,
      error: { error: 'detalle interno sensible de base de datos' },
    });
    const msg500 = service.obtenerMensajeError(err500);
    expect(msg500).toContain('error interno en el servidor');
    expect(msg500).not.toContain('detalle interno sensible');
  });
});

