import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { AuthService } from './services/auth.service';
import { SolicitudFormularioComponent } from './components/solicitud-formulario/solicitud-formulario.component';
import { AsesorPortalComponent } from './components/asesor-portal/asesor-portal.component';
import {
  AdicionalCatalogo,
  AdicionalItem,
  Evento,
  Solicitud,
  Usuario,
  calcularComparativoAdicionales,
  contarCambiosSolicitud,
  formatearFechaHoraEnvio,
  obtenerResumenCambiosSolicitud,
} from './models/gestor-eventos.models';

const CATALOGO_PRUEBA: AdicionalCatalogo[] = [
  { id: 'cochera', nombre: 'Cochera', tarifa_hora: 10, unidad_label: 'S/ 10.00 / h', unidad: 'unidad' },
  { id: 'pantalla_led_5x4', nombre: 'Pantalla LED 5×4', tarifa_hora: 200, unidad_label: 'S/ 200.00 / h', unidad: 'unidad' },
  { id: 'pantalla_led_4x3', nombre: 'Pantalla LED 4×3', tarifa_hora: 150, unidad_label: 'S/ 150.00 / h', unidad: 'unidad' },
  { id: 'microfono', nombre: 'Micrófono inalámbrico', tarifa_hora: 5, unidad_label: 'S/ 5.00 / h', unidad: 'unidad' },
  { id: 'teleprompter', nombre: 'Teleprompter', tarifa_hora: 10, unidad_label: 'S/ 10.00 / h', unidad: 'unidad' },
];

const EVENTO_PRUEBA: Evento = {
  id: 1,
  nombre: 'Lanzamiento Corporativo Showtech 2026',
  espacio: 'Auditorio Principal A',
  fecha: '2026-11-15',
  hora_inicio: '09:00',
  hora_fin: '13:00',
  estado: 'Confirmado',
  contacto: 'María Rodríguez',
  telefono: '998 765 432',
  correo: 'm.rodriguez@demo-showtech.test',
  observaciones: 'Disposición de silletería para 200 personas, atril central y 2 micrófonos.',
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
  adicionales: [
    {
      id: 'cochera',
      nombre: 'Cochera',
      unidad: 'unidad',
      cantidad: 1,
      horas: 4,
      tarifa_hora: 10,
      subtotal: 40,
    },
  ],
};

const SOLICITUD_PRUEBA: Solicitud = {
  id: 1,
  evento_id: 1,
  motivo: 'Cambio de persona de contacto y retiro de opcionales',
  fecha_propuesta: '2026-11-15',
  hora_inicio_propuesta: '09:00',
  hora_fin_propuesta: '13:00',
  informacion_general_propuesta: {
    nombre: 'Congreso Corporativo Showtech 2026',
    contacto: 'Lucía Fernández',
    telefono: '',
    correo: '',
    observaciones: '',
  },
  estado: 'Pendiente de revisión',
  fecha_creacion: '2026-11-02 12:10:00',
  datos_originales: {
    nombre: 'Lanzamiento Corporativo Showtech 2026',
    espacio: 'Auditorio Principal A',
    contacto: 'María Rodríguez',
    telefono: '998 765 432',
    correo: 'm.rodriguez@demo-showtech.test',
    observaciones: 'Disposición de silletería para 200 personas, atril central y 2 micrófonos.',
    fecha: '2026-11-15',
    hora_inicio: '09:00',
    hora_fin: '13:00',
  },
  datos_propuestos: {
    nombre: 'Congreso Corporativo Showtech 2026',
    espacio: 'Auditorio Principal A',
    contacto: 'Lucía Fernández',
    telefono: '',
    correo: '',
    observaciones: '',
    fecha: '2026-11-15',
    hora_inicio: '09:00',
    hora_fin: '13:00',
  },
};

/** Guarda una sesión vigente en sessionStorage; AuthService la restaura al crearse. */
function iniciarSesionDePrueba(usuario: Usuario): void {
  sessionStorage.setItem(
    'showtech_sesion',
    JSON.stringify({
      token: 'token-de-prueba',
      expira_en: new Date(Date.now() + 3600_000).toISOString(),
      usuario,
    }),
  );
}

const USUARIO_CLIENTE: Usuario = {
  id: 2,
  correo: 'cliente@horizonte.com',
  nombre: 'Promoción Horizonte 2026',
  rol: 'cliente',
  cliente_id: 'CLI-001',
};

const USUARIO_ASESOR: Usuario = {
  id: 1,
  correo: 'asesor@showtech.com',
  nombre: 'Asesor(a) comercial',
  rol: 'asesor',
};

describe('Portal del Cliente en 4 pasos (App y SolicitudFormularioComponent)', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    sessionStorage.clear();
    iniciarSesionDePrueba(USUARIO_CLIENTE);
    await TestBed.configureTestingModule({
      imports: [App, SolicitudFormularioComponent, AsesorPortalComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('debe iniciar en el paso 1 con cabecera SHOWTECH SOLUTIONS, ID numérico real, insignia Confirmado y estado vacío de solicitudes', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([]);
    fixture.detectChanges();

    expect(app.pasoActual()).toBe(1);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.marca')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'SHOWTECH SOLUTIONS'
    );
    expect(compiled.querySelector('h1')?.textContent).toContain('Solicitudes de modificación');
    expect(compiled.textContent).toContain('ID: 1');
    expect(compiled.textContent).not.toContain('EVT-');
    expect(compiled.textContent).toContain('Todavía no hay solicitudes registradas');

    expect(compiled.querySelector('.insignia-estado')?.textContent?.trim()).toBe('Confirmado');
    expect(compiled.querySelector('.insignia-seleccionado')?.textContent?.trim()).toBe(
      'Evento seleccionado'
    );

    const pasoActivo = compiled.querySelector('.paso.activo');
    expect(pasoActivo?.getAttribute('aria-current')).toBe('step');
    expect(pasoActivo?.textContent).toContain('Eventos');
  });

  it('debe precargar y validar información general, contacto, límites Unicode, correo, vaciado de opcionales y cambio únicamente en nombre o contacto', () => {
    const fixture = TestBed.createComponent(SolicitudFormularioComponent);
    const comp = fixture.componentInstance;
    comp.eventoSeleccionado = EVENTO_PRUEBA;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Verificar precarga de los datos generales y de contacto
    expect(comp.formulario.get('nombre_propuesto')?.value).toBe(EVENTO_PRUEBA.nombre);
    expect(comp.formulario.get('contacto_propuesto')?.value).toBe(EVENTO_PRUEBA.contacto);
    expect(comp.formulario.get('telefono_propuesto')?.value).toBe(EVENTO_PRUEBA.telefono);
    expect(comp.formulario.get('correo_propuesto')?.value).toBe(EVENTO_PRUEBA.correo);
    expect(comp.formulario.get('observaciones_propuestas')?.value).toBe(
      EVENTO_PRUEBA.observaciones
    );

    // Al cargar el evento sin cambios, no hay insignias Modificado
    expect(compiled.querySelectorAll('.mod-pill').length).toBe(0);

    // Mismo nombre, contacto, opcionales, fecha y horario que el original -> error sinCambiosRespectoAlOriginal
    comp.formulario.patchValue({
      motivo: 'Motivo válido pero sin cambiar ningún dato',
    });
    expect(comp.formulario.hasError('sinCambiosRespectoAlOriginal')).toBe(true);

    // Cambiar ÚNICAMENTE el nombre o contacto (manteniendo misma fecha y horario) -> VÁLIDO
    comp.formulario.patchValue({
      nombre_propuesto: 'Congreso Corporativo Showtech 2026',
    });
    fixture.detectChanges();
    expect(comp.formulario.hasError('sinCambiosRespectoAlOriginal')).toBe(false);
    expect(comp.formulario.valid).toBe(true);
    expect(comp.nombreModificado).toBe(true);
    expect(compiled.querySelectorAll('.mod-pill').length).toBe(1);

    // Vaciar campos opcionales (teléfono, correo, observaciones) debe ser válido y marcarse como Modificado
    comp.formulario.patchValue({
      nombre_propuesto: EVENTO_PRUEBA.nombre,
      contacto_propuesto: 'Lucía Fernández',
      telefono_propuesto: '   ',
      correo_propuesto: '',
      observaciones_propuestas: '',
    });
    fixture.detectChanges();
    expect(comp.formulario.valid).toBe(true);
    expect(comp.contactoModificado).toBe(true);
    expect(comp.telefonoModificado).toBe(true);
    expect(comp.correoModificado).toBe(true);
    expect(comp.observacionesModificadas).toBe(true);

    // Obligatorios vacíos (nombre y contacto solo espacios) -> Inválidos
    comp.formulario.patchValue({
      nombre_propuesto: '   ',
      contacto_propuesto: '   ',
    });
    expect(comp.formulario.get('nombre_propuesto')?.hasError('nombreVacio')).toBe(true);
    expect(comp.formulario.get('contacto_propuesto')?.hasError('contactoVacio')).toBe(true);

    // Límites Unicode (nombre 121, contacto 81, teléfono 26, correo 81, observaciones 301) y correo inválido
    comp.formulario.patchValue({
      nombre_propuesto: 'á'.repeat(121),
      contacto_propuesto: 'é'.repeat(81),
      telefono_propuesto: '9'.repeat(26),
      correo_propuesto: 'correo-invalido-sin-arroba',
      observaciones_propuestas: 'ó'.repeat(301),
    });
    expect(comp.formulario.get('nombre_propuesto')?.hasError('maximoUnicode')).toBe(true);
    expect(comp.formulario.get('contacto_propuesto')?.hasError('maximoUnicode')).toBe(true);
    expect(comp.formulario.get('telefono_propuesto')?.hasError('maximoUnicode')).toBe(true);
    expect(comp.formulario.get('correo_propuesto')?.hasError('formatoCorreo')).toBe(true);
    expect(comp.formulario.get('observaciones_propuestas')?.hasError('maximoUnicode')).toBe(true);

    // Restaurar valores originales al descartar
    comp.restaurarValoresOriginales();
    fixture.detectChanges();
    expect(comp.formulario.get('nombre_propuesto')?.value).toBe(EVENTO_PRUEBA.nombre);
    expect(comp.formulario.get('contacto_propuesto')?.value).toBe(EVENTO_PRUEBA.contacto);
    expect(comp.formulario.get('telefono_propuesto')?.value).toBe(EVENTO_PRUEBA.telefono);
    expect(comp.formulario.get('correo_propuesto')?.value).toBe(EVENTO_PRUEBA.correo);
    expect(comp.formulario.get('observaciones_propuestas')?.value).toBe(
      EVENTO_PRUEBA.observaciones
    );
    expect(comp.tieneCambiosEnBorrador()).toBe(false);
  });

  it('debe validar formato estricto HH:mm, rango 06:00-22:00, inicio < fin y motivo Unicode <= 400', () => {
    const fixture = TestBed.createComponent(SolicitudFormularioComponent);
    const comp = fixture.componentInstance;
    comp.eventoSeleccionado = EVENTO_PRUEBA;
    fixture.detectChanges();

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

    // Motivo de 400 caracteres Unicode (válido) vs 401 caracteres Unicode (inválido)
    comp.formulario.patchValue({
      hora_inicio_propuesta: '10:00',
      hora_fin_propuesta: '14:00',
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

  it('debe recorrer los pasos 1 -> 2 -> 3 sin enviar POST en el paso 2, mostrar comparativo con "Sin especificar", conservar el borrador al volver y restaurar al descartar', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([]);
    fixture.detectChanges();

    // Paso 1 -> seleccionar evento para ir al Paso 2
    app.alSeleccionarEvento(EVENTO_PRUEBA);
    fixture.detectChanges();
    expect(app.pasoActual()).toBe(2);

    // Avanzar al Paso 3 cambiando contacto y vaciando opcionales (no debe hacer POST todavía)
    const borrador = {
      evento_id: 1,
      motivo: 'Ajuste de persona de contacto y retiro de opcionales',
      fecha_propuesta: EVENTO_PRUEBA.fecha,
      hora_inicio_propuesta: EVENTO_PRUEBA.hora_inicio,
      hora_fin_propuesta: EVENTO_PRUEBA.hora_fin,
      informacion_general_propuesta: {
        nombre: 'Congreso Corporativo Showtech 2026',
        contacto: 'Lucía Fernández',
        telefono: '',
        correo: '',
        observaciones: '',
      },
    };
    app.alContinuarARevision(borrador);
    fixture.detectChanges();

    expect(app.pasoActual()).toBe(3);
    httpMock.expectNone('/api/solicitudes');

    const compiled = fixture.nativeElement as HTMLElement;
    const tablaTexto = compiled.querySelector('.comparativo-tabla')?.textContent ?? '';
    expect(tablaTexto).toContain('Congreso Corporativo Showtech 2026');
    expect(tablaTexto).toContain('Lucía Fernández');
    expect(tablaTexto).toContain('Sin especificar');
    expect(tablaTexto).toContain('15/11/2026');
    expect(tablaTexto).toContain('09:00 - 13:00');
    // Verificar que solo hay 3 columnas (no existe columna Cambio)
    const encabezados = Array.from(compiled.querySelectorAll('.comparativo-tabla th')).map((th) =>
      th.textContent?.trim()
    );
    expect(encabezados).toContain('Campo del evento');
    expect(encabezados).toContain('Datos actuales (vigentes)');
    expect(encabezados).toContain('Cambios solicitados');
    expect(encabezados).not.toContain('Cambio');
    // Sin tachados
    expect(compiled.querySelectorAll('.val-tachado').length).toBe(0);
    expect(compiled.querySelector('.mensaje-reserva')?.textContent).toContain(
      'Al enviar la solicitud, quedará pendiente de revisión. Tu reserva actual se mantendrá sin cambios.'
    );

    // Bloque informativo de costos (referencial, sin total ni cobros automaticos)
    const costos = compiled.querySelector('.bloque-costos-cliente')?.textContent ?? '';
    expect(costos).toContain('Cargo por modificación');
    expect(costos).toContain('S/ 100');
    expect(costos).toContain('S/ 500 / hora');
    expect(costos).toContain('Importe final pendiente de revisión por el asesor');
    expect(costos).toContain('no genera deudas automáticas');

    // Volver del Paso 3 al Paso 2 debe conservar el borrador completo
    app.alModificarPropuestaDesdeRevision();
    fixture.detectChanges();
    expect(app.pasoActual()).toBe(2);
    expect(app.borradorPropuesta()).toEqual(borrador);
    expect(app.formularioPaso2?.formulario.get('nombre_propuesto')?.value).toBe(
      'Congreso Corporativo Showtech 2026'
    );
    expect(app.formularioPaso2?.formulario.get('contacto_propuesto')?.value).toBe(
      'Lucía Fernández'
    );
    expect(app.formularioPaso2?.formulario.get('telefono_propuesto')?.value).toBe('');

    // Confirmar descarte en Paso 2 restaura todos los valores originales
    app.alIntentarDescartarEnPaso2();
    fixture.detectChanges();
    expect(app.modalDescartarAbierto()).toBe(true);

    app.confirmarDescarteCambios();
    fixture.detectChanges();
    expect(app.modalDescartarAbierto()).toBe(false);
    expect(app.borradorPropuesta()).toBeNull();
    expect(app.pasoActual()).toBe(2);
    expect(app.formularioPaso2?.formulario.get('nombre_propuesto')?.value).toBe(
      EVENTO_PRUEBA.nombre
    );
    expect(app.formularioPaso2?.formulario.get('contacto_propuesto')?.value).toBe(
      EVENTO_PRUEBA.contacto
    );
    expect(app.formularioPaso2?.formulario.get('telefono_propuesto')?.value).toBe(
      EVENTO_PRUEBA.telefono
    );
  });

  it('debe ejecutar un único POST en el paso 3, pasar al paso 4 tras 201 mostrando la constancia con snapshots y mantener intacto el evento original', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([]);
    fixture.detectChanges();

    const payload = {
      evento_id: 1,
      motivo: 'Cambio de persona de contacto y retiro de opcionales',
      fecha_propuesta: EVENTO_PRUEBA.fecha,
      hora_inicio_propuesta: EVENTO_PRUEBA.hora_inicio,
      hora_fin_propuesta: EVENTO_PRUEBA.hora_fin,
      informacion_general_propuesta: {
        nombre: 'Congreso Corporativo Showtech 2026',
        contacto: 'Lucía Fernández',
        telefono: '',
        correo: '',
        observaciones: '',
      },
    };

    app.alSeleccionarEvento(EVENTO_PRUEBA);
    app.alContinuarARevision(payload);
    fixture.detectChanges();
    expect(app.pasoActual()).toBe(3);

    // Primer envío e intento inmediato de segundo envío antes de recibir respuesta
    app.alEnviarSolicitud(payload);
    app.alEnviarSolicitud(payload);

    const postReqs = httpMock.match('/api/solicitudes');
    expect(postReqs.length).toBe(1);
    expect(postReqs[0].request.method).toBe('POST');

    postReqs[0].flush({
      mensaje: 'Solicitud registrada exitosamente.',
      solicitud: SOLICITUD_PRUEBA,
    });

    // Refresco posterior de GET /api/solicitudes
    const refreshReq = httpMock.expectOne('/api/solicitudes');
    expect(refreshReq.request.method).toBe('GET');
    refreshReq.flush([SOLICITUD_PRUEBA]);
    fixture.detectChanges();

    expect(app.enviandoSolicitud()).toBe(false);
    expect(app.pasoActual()).toBe(4);
    expect(app.eventoSeleccionadoTienePendiente()).toBe(true);
    // El evento original permanece sin cambios
    expect(app.eventos()[0].nombre).toBe('Lanzamiento Corporativo Showtech 2026');
    expect(app.eventos()[0].contacto).toBe('María Rodríguez');

    const compiled = fixture.nativeElement as HTMLElement;
    // Paso 4 compacto
    expect(compiled.querySelector('#titulo-paso-4')?.textContent).toContain('Tu solicitud fue registrada');
    expect(compiled.querySelector('.mensaje-confirmacion-texto')?.textContent).toContain(
      'Tu reserva actual se mantiene sin cambios'
    );
    expect(compiled.querySelector('.badge-solicitud-pendiente')?.textContent).toContain('Pendiente de revisión');
    expect(compiled.textContent).toContain('SOL-2026-001');
    expect(compiled.textContent).toContain('Lanzamiento Corporativo Showtech 2026');

    // La tabla comparativa completa ya no está en el Paso 4, está disponible en "Ver detalle de la solicitud"
    expect(compiled.querySelector('.confirmacion-exito-box .comparativo-tabla')).toBeNull();

    // Abrir modal desde Paso 4 para verificar detalle
    app.abrirModalDetalle(SOLICITUD_PRUEBA);
    fixture.detectChanges();
    expect(app.solicitudDetalleModal()).toBeTruthy();
    const dialog = compiled.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Lucía Fernández');
    expect(dialog?.textContent).toContain('Sin especificar');
    app.cerrarModalDetalle();
    fixture.detectChanges();

    // Al volver al Paso 1, el botón Solicitar modificación está bloqueado
    app.volverAMisEventos();
    fixture.detectChanges();
    expect(app.pasoActual()).toBe(1);

    const btnSolicitar = compiled.querySelector('.btn-solicitar') as HTMLButtonElement | null;
    expect(btnSolicitar?.disabled).toBe(true);
  });

  it('debe manejar conflicto 409 en el paso 3 conservando el borrador y refrescando las solicitudes', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([]);
    fixture.detectChanges();

    const payload = {
      evento_id: 1,
      motivo: 'Intento concurrente',
      fecha_propuesta: '2026-11-22',
      hora_inicio_propuesta: '11:00',
      hora_fin_propuesta: '15:00',
    };

    app.alSeleccionarEvento(EVENTO_PRUEBA);
    app.alContinuarARevision(payload);
    fixture.detectChanges();

    app.alEnviarSolicitud(payload);

    const postReq = httpMock.expectOne('/api/solicitudes');
    postReq.flush(
      { error: 'Ya existe una solicitud pendiente para este evento' },
      { status: 409, statusText: 'Conflict' }
    );

    const refreshReq = httpMock.expectOne('/api/solicitudes');
    refreshReq.flush([SOLICITUD_PRUEBA]);
    fixture.detectChanges();

    expect(app.pasoActual()).toBe(3);
    expect(app.borradorPropuesta()).toEqual(payload);
    expect(app.errorEnvio()).toContain('pendiente');
    expect(app.eventoSeleccionadoTienePendiente()).toBe(true);
  });

  it('debe mantener el paso 4 exitoso cuando POST responde 201 pero falla el GET posterior de actualización', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([]);
    fixture.detectChanges();

    const payload = {
      evento_id: 1,
      motivo: 'Cambio con fallo de red posterior',
      fecha_propuesta: '2026-11-20',
      hora_inicio_propuesta: '10:00',
      hora_fin_propuesta: '14:00',
    };

    app.alSeleccionarEvento(EVENTO_PRUEBA);
    app.alContinuarARevision(payload);
    app.alEnviarSolicitud(payload);

    const postReq = httpMock.expectOne('/api/solicitudes');
    postReq.flush({
      mensaje: 'Solicitud registrada exitosamente.',
      solicitud: SOLICITUD_PRUEBA,
    });

    const refreshReq = httpMock.expectOne('/api/solicitudes');
    refreshReq.flush('Error de red', { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    expect(app.pasoActual()).toBe(4);
    expect(app.solicitudConfirmada()?.id).toBe(1);
    expect(app.avisoRefrescoPosterior()).toContain('Tu solicitud quedó registrada');
  });

  it('debe mostrar en el modal de detalle los snapshots de la solicitud (no los valores actuales del evento) y cerrar con Escape', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    // Incluso si el evento en lista tuviese otro nombre o contacto, el modal debe usar el snapshot de la solicitud
    const eventoModificadoEnLista: Evento = {
      ...EVENTO_PRUEBA,
      nombre: 'Nombre Diferente En Evento Actual',
      contacto: 'Contacto Diferente En Evento Actual',
    };

    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    httpMock.expectOne('/api/eventos').flush([eventoModificadoEnLista]);
    httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
    fixture.detectChanges();

    app.abrirModalDetalle(SOLICITUD_PRUEBA);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const dialog = compiled.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.textContent).toContain('Solicitud SOL-2026-001');
    expect(dialog?.textContent).toContain('Lanzamiento Corporativo Showtech 2026');
    expect(dialog?.textContent).toContain('Congreso Corporativo Showtech 2026');
    expect(dialog?.textContent).toContain('María Rodríguez');
    expect(dialog?.textContent).toContain('Lucía Fernández');
    expect(dialog?.textContent).toContain('Sin especificar');
    expect(dialog?.textContent).not.toContain('Nombre Diferente En Evento Actual');

    // Cerrar con tecla Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(app.solicitudDetalleModal()).toBeNull();
  });

  it('debe mostrar "Dato no disponible en este registro" en solicitudes antiguas incompletas y distinguirlo de "Sin especificar"', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    const solicitudAntigua: Solicitud = {
      id: 99,
      evento_id: 1,
      motivo: 'Solicitud histórica previa a campos de contacto',
      fecha_propuesta: '2026-11-25',
      hora_inicio_propuesta: '10:00',
      hora_fin_propuesta: '14:00',
      estado: 'Pendiente de revisión',
      fecha_creacion: '2026-10-15 08:30:00',
      datos_originales: {
        fecha: '2026-11-15',
        hora_inicio: '09:00',
        hora_fin: '13:00',
      },
      datos_propuestos: {
        fecha: '2026-11-25',
        hora_inicio: '10:00',
        hora_fin: '14:00',
      },
    };

    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([solicitudAntigua]);
    fixture.detectChanges();

    app.abrirModalDetalle(solicitudAntigua);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const dialog = compiled.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();

    // Debe mostrar "Dato no disponible en este registro" para campos no incluidos en el registro histórico
    expect(dialog?.textContent).toContain('Dato no disponible en este registro');
    // NO debe inventar datos del evento actual (por ejemplo María Rodríguez o Lanzamiento Corporativo)
    expect(dialog?.textContent).not.toContain('María Rodríguez');
    expect(dialog?.textContent).toContain('25/11/2026');
    expect(dialog?.textContent).toContain('10:00 - 14:00');
  });

  it('debe permitir proponer cambios en tiempos técnicos (montaje, desmontaje y ensayo), reflejarlos en el cronograma, tabla de 3 columnas y modal de detalle', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([]);
    fixture.detectChanges();

    // Seleccionar evento 1 (pasa al paso 2)
    app.alSeleccionarEvento(EVENTO_PRUEBA);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Verificar que los tiempos actuales se precargan sin inventar horarios inexistentes
    const chkMontaje = compiled.querySelector('#chkMontaje') as HTMLInputElement;
    const chkDesmontaje = compiled.querySelector('#chkDesmontaje') as HTMLInputElement;
    const chkEnsayo = compiled.querySelector('#chkEnsayo') as HTMLInputElement;

    expect(chkMontaje.checked).toBe(true);
    expect(chkDesmontaje.checked).toBe(true);
    expect(chkEnsayo.checked).toBe(false);

    const montajeStart = compiled.querySelector('#montajeStartTime') as HTMLInputElement;
    const montajeEnd = compiled.querySelector('#montajeEndTime') as HTMLInputElement;
    expect(montajeStart.value).toBe('08:00');
    expect(montajeEnd.value).toBe('09:00');

    // Cronograma propuesto inicial muestra montaje, evento y desmontaje con sus duraciones
    const cronograma = compiled.querySelector('#resumenHorarioItemsCliente');
    expect(cronograma?.textContent).toContain('Montaje: 08:00 a 09:00 (1 h)');
    expect(cronograma?.textContent).toContain('Evento: 09:00 a 13:00 (4 h)');
    expect(cronograma?.textContent).toContain('Desmontaje: 13:00 a 14:00 (1 h)');

    // Activar ensayo técnico
    chkEnsayo.click();
    fixture.detectChanges();

    // Llenar ensayo válido: 07:00 a 08:00 (contiguo con inicio de montaje a 08:00)
    const ensayoStart = compiled.querySelector('#ensayoStartTime') as HTMLInputElement;
    const ensayoEnd = compiled.querySelector('#ensayoEndTime') as HTMLInputElement;
    ensayoStart.value = '07:00';
    ensayoStart.dispatchEvent(new Event('input'));
    ensayoEnd.value = '08:00';
    ensayoEnd.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(cronograma?.textContent).toContain('Ensayo: 07:00 a 08:00 (1 h)');

    // Indicar motivo obligatorio
    const motivoTextarea = compiled.querySelector('#requestReason') as HTMLTextAreaElement;
    motivoTextarea.value = 'Requerimiento de ensayo técnico previo antes del montaje para calibración de equipos';
    motivoTextarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // Avanzar a revisión (Paso 3)
    const btnAvanzar = compiled.querySelector('#btnAvanzarPaso3Cliente') as HTMLButtonElement;
    btnAvanzar.click();
    fixture.detectChanges();

    expect(app.pasoActual()).toBe(3);

    // Tabla comparativa en Paso 3 debe tener las 3 columnas y los 10 campos
    const tablaPaso3 = compiled.querySelector('#diffTableContainerCliente table') as HTMLTableElement;
    expect(tablaPaso3).toBeTruthy();
    const ths = Array.from(tablaPaso3.querySelectorAll('th')).map((th) => th.textContent?.trim());
    expect(ths).toEqual(['Campo del evento', 'Datos actuales (vigentes)', 'Cambios solicitados']);

    const filasTexto = Array.from(tablaPaso3.querySelectorAll('tbody tr')).map((tr) => tr.textContent);
    expect(filasTexto.some((t) => t?.includes('Montaje técnico previo'))).toBe(true);
    expect(filasTexto.some((t) => t?.includes('Desmontaje técnico posterior'))).toBe(true);
    expect(filasTexto.some((t) => t?.includes('Ensayo técnico previo'))).toBe(true);

    // Ensayo técnico debe aparecer marcado como modificado porque antes era 'No requiere'
    const filaEnsayo = Array.from(tablaPaso3.querySelectorAll('tbody tr')).find((tr) =>
      tr.textContent?.includes('Ensayo técnico previo')
    );
    expect(filaEnsayo?.classList.contains('fila-modificada')).toBe(true);
    expect(filaEnsayo?.textContent).toContain('No requiere');
    expect(filaEnsayo?.textContent).toContain('07:00 - 08:00');

    // Montaje no cambió, por tanto no debe tener clase fila-modificada
    const filaMontaje = Array.from(tablaPaso3.querySelectorAll('tbody tr')).find((tr) =>
      tr.textContent?.includes('Montaje técnico previo')
    );
    expect(filaMontaje?.classList.contains('fila-modificada')).toBe(false);

    // Enviar la solicitud (Paso 3 -> Paso 4)
    const btnConfirmar = compiled.querySelector('#btnEnviarSolicitud') as HTMLButtonElement;
    btnConfirmar.click();
    fixture.detectChanges();

    const postReq = httpMock.expectOne('/api/solicitudes');
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body.tiempos_tecnicos_propuestos.has_ensayo).toBe(true);
    expect(postReq.request.body.tiempos_tecnicos_propuestos.ensayo_hora_inicio).toBe('07:00');

    const solicitudCreada: Solicitud = {
      id: 10,
      evento_id: 1,
      motivo: postReq.request.body.motivo,
      fecha_propuesta: '2026-11-15',
      hora_inicio_propuesta: '09:00',
      hora_fin_propuesta: '13:00',
      estado: 'Pendiente de revisión',
      fecha_creacion: '2026-11-03 15:00:00',
      datos_originales: {
        ...EVENTO_PRUEBA,
      },
      datos_propuestos: {
        ...EVENTO_PRUEBA,
        has_ensayo: true,
        ensayo_fecha: '2026-11-15',
        ensayo_hora_inicio: '07:00',
        ensayo_hora_fin: '08:00',
      },
    };

    postReq.flush({
      mensaje: 'Solicitud registrada exitosamente',
      solicitud: solicitudCreada,
    });
    httpMock.expectOne('/api/solicitudes').flush([solicitudCreada]);
    fixture.detectChanges();

    // Debe encontrarse en el Paso 4
    expect(app.pasoActual()).toBe(4);
    expect(compiled.querySelector('#cs4')).toBeTruthy();

    // Abrir modal de detalle desde el listado y comprobar datos técnicos en modal
    app.abrirModalDetalle(solicitudCreada);
    fixture.detectChanges();

    const dialog = compiled.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Montaje técnico previo');
    expect(dialog?.textContent).toContain('Ensayo técnico previo');
    expect(dialog?.textContent).toContain('07:00 - 08:00');
  });

  it('debe gestionar adicionales en Paso 2, comparativo en Paso 3, envío en payload y reflejo en Paso 4 y modal de detalle', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([]);
    fixture.detectChanges();

    // Seleccionar evento 1 (pasa al paso 2)
    app.alSeleccionarEvento(EVENTO_PRUEBA);
    fixture.detectChanges();
    expect(app.pasoActual()).toBe(2);

    const compiled = fixture.nativeElement as HTMLElement;

    // Verificar bloque de adicionales en Paso 2
    const selAdicional = compiled.querySelector('#selAdicionalCliente') as HTMLSelectElement;
    expect(selAdicional).toBeTruthy();
    expect(selAdicional.options.length).toBeGreaterThan(3);

    // Debe mostrar precargado el adicional del evento (Cochera)
    const filasTablaPaso2 = compiled.querySelectorAll('#tablaAdicionalesCliente tbody tr');
    expect(filasTablaPaso2.length).toBe(1);
    expect(filasTablaPaso2[0].textContent).toContain('Cochera');

    // Seleccionar 'microfono' en el combo
    selAdicional.value = 'microfono';
    selAdicional.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const inpCant = compiled.querySelector('#numAdicionalCantidadCliente') as HTMLInputElement;
    const inpHrs = compiled.querySelector('#numAdicionalHorasCliente') as HTMLInputElement;
    inpCant.value = '2';
    inpCant.dispatchEvent(new Event('input'));
    inpHrs.value = '3';
    inpHrs.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // Comprobar cálculo reactivo de subtotal referencial: 2 * 3 * 5 = S/ 30.00
    const txtSubtotal = compiled.querySelector('#txtAdicionalSubtotalCliente') as HTMLInputElement;
    expect(txtSubtotal.value).toContain('30.00');

    // Click en '+ Agregar adicional'
    const btnAgregar = compiled.querySelector('#btnAgregarAdicionalCliente') as HTMLButtonElement;
    btnAgregar.click();
    fixture.detectChanges();

    // Ahora hay 2 adicionales en la tabla
    const filasActualizadas = compiled.querySelectorAll('#tablaAdicionalesCliente tbody tr');
    expect(filasActualizadas.length).toBe(2);
    expect(compiled.querySelector('#tablaAdicionalesCliente')?.textContent).toContain('Micrófono');

    // Probar edición: click en editar micrófono
    const btnsEditar = compiled.querySelectorAll('.btn-edit-adic');
    (btnsEditar[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    // Formulario de adicionales entra en modo edición
    expect(btnAgregar.textContent).toContain('Actualizar adicional');
    inpCant.value = '4';
    inpCant.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    btnAgregar.click();
    fixture.detectChanges();
    expect(btnAgregar.textContent).toContain('Actualizar adicional');

    // Al cambiar la selección a un recurso no agregado (ej. teleprompter), vuelve a 'Agregar adicional'
    selAdicional.value = 'teleprompter';
    selAdicional.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(btnAgregar.textContent).toContain('Agregar adicional');

    // Quitar Cochera para que solo quede micrófono con cambio efectivo
    const btnsQuitar = compiled.querySelectorAll('.btn-delete-adic');
    (btnsQuitar[0] as HTMLButtonElement).click();
    fixture.detectChanges();

    const filasDespuesQuitar = compiled.querySelectorAll('#tablaAdicionalesCliente tbody tr');
    expect(filasDespuesQuitar.length).toBe(1);
    expect(filasDespuesQuitar[0].textContent).toContain('Micrófono');

    // Ingresar motivo de solicitud
    const txtMotivo = compiled.querySelector('#requestReason') as HTMLTextAreaElement;
    txtMotivo.value = 'Ajuste de requerimientos audiovisuales y adicionales';
    txtMotivo.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // Continuar a Paso 3
    const btnContinuar = compiled.querySelector('#btnAvanzarPaso3Cliente') as HTMLButtonElement;
    btnContinuar.click();
    fixture.detectChanges();

    expect(app.pasoActual()).toBe(3);

    // En Paso 3: comprobar tarjeta comparativa de adicionales
    const cardAdicPaso3 = compiled.querySelector('.resumen-adicionales-box');
    expect(cardAdicPaso3).toBeTruthy();
    expect(cardAdicPaso3?.textContent).toContain('Resumen y Comparativo de Adicionales');
    expect(cardAdicPaso3?.textContent).toContain('Importes referenciales');

    // Comprobar resumen comercial: Total actual S/ 40.00, Total propuesto S/ 60.00 (4 * 3 * 5 = 60), Diferencia
    expect(cardAdicPaso3?.textContent).toContain('40.00');
    expect(cardAdicPaso3?.textContent).toContain('60.00');

    // Regresar al Paso 2 para verificar preservación del borrador
    app.alModificarPropuestaDesdeRevision();
    fixture.detectChanges();
    expect(app.pasoActual()).toBe(2);

    const filasBorrador = compiled.querySelectorAll('#tablaAdicionalesCliente tbody tr');
    expect(filasBorrador.length).toBe(1);
    expect(filasBorrador[0].textContent).toContain('Micrófono');

    // Volver a avanzar al Paso 3
    const btnContinuar2 = compiled.querySelector('#btnAvanzarPaso3Cliente') as HTMLButtonElement;
    btnContinuar2.click();
    fixture.detectChanges();
    expect(app.pasoActual()).toBe(3);

    // Enviar la solicitud (Paso 3 -> Paso 4)
    const btnConfirmar = compiled.querySelector('#btnEnviarSolicitud') as HTMLButtonElement;
    btnConfirmar.click();
    fixture.detectChanges();

    const postReq = httpMock.expectOne('/api/solicitudes');
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body.adicionales_propuestos).toBeDefined();
    expect(postReq.request.body.adicionales_propuestos.length).toBe(1);
    expect(postReq.request.body.adicionales_propuestos[0].id).toBe('microfono');
    expect(postReq.request.body.adicionales_propuestos[0].cantidad).toBe(4);
    expect(postReq.request.body.adicionales_propuestos[0].horas).toBe(3);

    const solicitudAdicCreada: Solicitud = {
      id: 20,
      evento_id: 1,
      motivo: postReq.request.body.motivo,
      fecha_propuesta: '2026-11-15',
      hora_inicio_propuesta: '09:00',
      hora_fin_propuesta: '13:00',
      estado: 'Pendiente de revisión',
      fecha_creacion: '2026-11-03 16:00:00',
      datos_originales: {
        ...EVENTO_PRUEBA,
        adicionales: [...EVENTO_PRUEBA.adicionales!],
      },
      datos_propuestos: {
        ...EVENTO_PRUEBA,
        adicionales: [
          {
            id: 'microfono',
            nombre: 'Micrófono',
            cantidad: 4,
            horas: 3,
            tarifa_hora: 5,
            subtotal: 60,
          },
        ],
      },
    };

    postReq.flush({
      mensaje: 'Solicitud registrada exitosamente',
      solicitud: solicitudAdicCreada,
    });
    httpMock.expectOne('/api/solicitudes').flush([solicitudAdicCreada]);
    fixture.detectChanges();

    // Debe encontrarse en Paso 4
    expect(app.pasoActual()).toBe(4);
    expect(compiled.querySelector('#cs4')).toBeTruthy();

    // Abrir modal de detalle desde el botón de la confirmación
    const btnVerDetalle = compiled.querySelector('#btnVerDetalleSolicitudConfirmada') as HTMLButtonElement;
    btnVerDetalle.click();
    fixture.detectChanges();

    const dialog = compiled.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Resumen y Comparativo de Adicionales');
    expect(dialog?.textContent).toContain('Micrófono');
  });

  it('CASO CONCRETO: debe calcular exactamente Pantalla LED (S/ 200) + 2 Micrófonos (S/ 10) + 5 Cocheras (S/ 50) = S/ 260 vs S/ 40 (Dif: +S/ 220), con nombres comerciales y sin falsos "Sin cambio"', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([]);
    fixture.detectChanges();

    // Evento 1 tiene 1 Cochera original de S/ 40
    app.alSeleccionarEvento(EVENTO_PRUEBA);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Agregar Pantalla LED 5×4 (1 un x 1 h = S/ 200)
    const selAdic = compiled.querySelector('#selAdicionalCliente') as HTMLSelectElement;
    const inpCant = compiled.querySelector('#numAdicionalCantidadCliente') as HTMLInputElement;
    const inpHrs = compiled.querySelector('#numAdicionalHorasCliente') as HTMLInputElement;
    const btnAgregar = compiled.querySelector('#btnAgregarAdicionalCliente') as HTMLButtonElement;

    selAdic.value = 'pantalla_led_5x4';
    selAdic.dispatchEvent(new Event('change'));
    inpCant.value = '1';
    inpCant.dispatchEvent(new Event('input'));
    inpHrs.value = '1';
    inpHrs.dispatchEvent(new Event('input'));
    btnAgregar.click();
    fixture.detectChanges();

    // Agregar 2 Micrófonos inalámbricos (2 un x 1 h = S/ 10)
    selAdic.value = 'microfono';
    selAdic.dispatchEvent(new Event('change'));
    inpCant.value = '2';
    inpCant.dispatchEvent(new Event('input'));
    inpHrs.value = '1';
    inpHrs.dispatchEvent(new Event('input'));
    btnAgregar.click();
    fixture.detectChanges();

    // Modificar Cochera a 5 un x 1 h = S/ 50
    selAdic.value = 'cochera';
    selAdic.dispatchEvent(new Event('change'));
    inpCant.value = '5';
    inpCant.dispatchEvent(new Event('input'));
    inpHrs.value = '1';
    inpHrs.dispatchEvent(new Event('input'));
    btnAgregar.click();
    fixture.detectChanges();

    // Ingresar motivo
    const txtMotivo = compiled.querySelector('#requestReason') as HTMLTextAreaElement;
    txtMotivo.value = 'Ampliación audiovisual y estacionamientos para evento';
    txtMotivo.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // Continuar a Paso 3
    const btnAvanzar = compiled.querySelector('#btnAvanzarPaso3Cliente') as HTMLButtonElement;
    btnAvanzar.click();
    fixture.detectChanges();

    expect(app.pasoActual()).toBe(3);

    // Verificar nombres comerciales (NUNCA identificadores técnicos como pantalla_led_5x4)
    const textoPaso3 = compiled.querySelector('#cs3')?.textContent || '';
    expect(textoPaso3).toContain('Pantalla LED 5×4');
    expect(textoPaso3).toContain('Micrófono inalámbrico');
    expect(textoPaso3).toContain('Cochera');
    expect(textoPaso3).not.toContain('pantalla_led_5x4');

    // Verificar métricas comerciales exactas:
    // Total actual: S/ 40.00
    // Total propuesto: S/ 260.00
    // Diferencia: +S/ 220.00
    const resumen = app.resumenComparativoAdicionalesPaso3();
    expect(resumen.totalActual).toBe(40.0);
    expect(resumen.totalActualTexto).toBe('S/ 40.00');
    expect(resumen.totalPropuesto).toBe(260.0);
    expect(resumen.totalPropuestoTexto).toBe('S/ 260.00');
    expect(resumen.diferencia).toBe(220.0);
    expect(resumen.diferenciaTexto).toBe('+S/ 220.00');

    // Comprobar filas en la tabla del comparativo
    const filas = resumen.filas;
    const filaPantalla = filas.find((f) => f.id === 'pantalla_led_5x4');
    const filaMicrofono = filas.find((f) => f.id === 'microfono');
    const filaCochera = filas.find((f) => f.id === 'cochera');

    expect(filaPantalla).toBeTruthy();
    expect(filaPantalla?.estado).toBe('alta');
    expect(filaPantalla?.datosActualesTexto).toBe('No contratado');
    expect(filaPantalla?.subtotalPropuestoTexto).toBe('S/ 200.00');
    expect(filaPantalla?.variacionTexto).toBe('+S/ 200.00');
    expect(filaPantalla?.variacionTexto).not.toBe('Sin cambio');

    expect(filaMicrofono).toBeTruthy();
    expect(filaMicrofono?.estado).toBe('alta');
    expect(filaMicrofono?.datosActualesTexto).toBe('No contratado');
    expect(filaMicrofono?.subtotalPropuestoTexto).toBe('S/ 10.00');
    expect(filaMicrofono?.variacionTexto).toBe('+S/ 10.00');
    expect(filaMicrofono?.variacionTexto).not.toBe('Sin cambio');

    expect(filaCochera).toBeTruthy();
    expect(filaCochera?.estado).toBe('modificado');
    expect(filaCochera?.datosActualesTexto).toContain('1 un. × 4 h (S/ 40.00)');
    expect(filaCochera?.cambiosPropuestosTexto).toContain('5 un. × 1 h (S/ 50.00)');
    expect(filaCochera?.variacionTexto).toBe('+S/ 10.00');
  });

  it('debe manejar error de carga del catálogo con reintento y bloquear envío si faltan tarifas', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    // Simular error al cargar el catálogo
    httpMock.expectOne('/api/adicionales').error(new ProgressEvent('Network error'));
    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([]);
    fixture.detectChanges();

    expect(app.errorCatalogoAdicionales()).toContain('No se pudo cargar el catálogo');
    const compiled = fixture.nativeElement as HTMLElement;
    const bannerError = compiled.querySelector('#alertaErrorCatalogoGlobal');
    expect(bannerError).toBeTruthy();
    expect(bannerError?.textContent).toContain('No se pudo cargar el catálogo');

    // Pulsar reintentar catálogo
    const btnReintentar = compiled.querySelector('#btnReintentarCatalogoGlobal') as HTMLButtonElement;
    btnReintentar.click();
    fixture.detectChanges();

    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    fixture.detectChanges();

    expect(app.errorCatalogoAdicionales()).toBe('');
    expect(app.catalogoAdicionales().length).toBe(5);
    expect(compiled.querySelector('#alertaErrorCatalogoGlobal')).toBeNull();
  });

  it('debe no convertir a cero un adicional no identificado y bloquear el envío correspondiente', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([]);
    fixture.detectChanges();

    app.alSeleccionarEvento(EVENTO_PRUEBA);

    // Borrador con un ID inexistente en el catálogo
    const borradorInvalido = {
      evento_id: 1,
      motivo: 'Solicitud con item desconocido',
      fecha_propuesta: EVENTO_PRUEBA.fecha,
      hora_inicio_propuesta: EVENTO_PRUEBA.hora_inicio,
      hora_fin_propuesta: EVENTO_PRUEBA.hora_fin,
      adicionales_propuestos: [{ id: 'recurso_inexistente_xyz', cantidad: 1, horas: 1 }],
    };

    app.alContinuarARevision(borradorInvalido);
    fixture.detectChanges();

    expect(app.pasoActual()).toBe(3);

    const resumen = app.resumenComparativoAdicionalesPaso3();
    expect(resumen.errorCatalogoIncompleto).toBe(true);

    const compiled = fixture.nativeElement as HTMLElement;
    const btnEnviar = compiled.querySelector('#btnEnviarSolicitud') as HTMLButtonElement;
    expect(btnEnviar.disabled).toBe(true);
  });

  it('debe distinguir modificación con variación monetaria cero de "Sin cambio", retiros y datos ausentes', () => {
    // 1) Modificación con saldo S/ 0.00: era 2 un x 2 h = 4h un; ahora 1 un x 4 h = 4h un. Subtotal S/ 40 en ambos casos
    const origItem: AdicionalItem = {
      id: 'cochera',
      nombre: 'Cochera',
      unidad: 'unidad',
      cantidad: 2,
      horas: 2,
      tarifa_hora: 10,
      subtotal: 40,
    };
    const propItemMod: AdicionalItem = {
      id: 'cochera',
      nombre: 'Cochera',
      unidad: 'unidad',
      cantidad: 1,
      horas: 4,
      tarifa_hora: 10,
      subtotal: 40,
    };

    const resMod0 = calcularComparativoAdicionales([origItem], [propItemMod], CATALOGO_PRUEBA);
    expect(resMod0.filas[0].estado).toBe('modificado');
    expect(resMod0.filas[0].modificada).toBe(true);
    expect(resMod0.filas[0].variacionTexto).toBe('S/ 0.00'); // Variación monetaria cero no significa "Sin cambio"

    // 2) Sin cambio: exactamente los mismos valores
    const propItemIgual: AdicionalItem = { ...origItem };
    const resIgual = calcularComparativoAdicionales([origItem], [propItemIgual], CATALOGO_PRUEBA);
    expect(resIgual.filas[0].estado).toBe('sin_cambio');
    expect(resIgual.filas[0].modificada).toBe(false);
    expect(resIgual.filas[0].variacionTexto).toBe('Sin cambio');

    // 3) Retiro
    const resRetiro = calcularComparativoAdicionales([origItem], [], CATALOGO_PRUEBA);
    expect(resRetiro.filas[0].estado).toBe('retiro');
    expect(resRetiro.filas[0].modificada).toBe(true);
    expect(resRetiro.filas[0].variacionTexto).toBe('-S/ 40.00');
    expect(resRetiro.filas[0].cambiosPropuestosTexto).toBe('(Retirado)');

    // 4) Datos originales ausentes (undefined, como en solicitudes antiguas):
    // No debe reemplazarse por lista vacía ni total cero
    const resAusente = calcularComparativoAdicionales(undefined, [propItemMod], CATALOGO_PRUEBA);
    expect(resAusente.totalActualDisponible).toBe(false);
    expect(resAusente.totalActualTexto).toBe('Dato no disponible en este registro');
    expect(resAusente.filas[0].datosActualesTexto).toBe('Dato no disponible en este registro');
  });

  it('formatearFechaHoraEnvio procesa fechas legacy, RFC3339 con offset, UTC con Z, cambios de día e inválidas', () => {
    // Casos faltantes o inválidos -> "Fecha no disponible"
    expect(formatearFechaHoraEnvio(null)).toBe('Fecha no disponible');
    expect(formatearFechaHoraEnvio(undefined)).toBe('Fecha no disponible');
    expect(formatearFechaHoraEnvio('')).toBe('Fecha no disponible');
    expect(formatearFechaHoraEnvio('   ')).toBe('Fecha no disponible');
    expect(formatearFechaHoraEnvio('invalido')).toBe('Fecha no disponible');
    expect(formatearFechaHoraEnvio('2026-99-99 12:00:00')).toBe('Fecha no disponible');

    // Casos legacy sin zona horaria: preserva valores locales en formato DD/MM/YYYY, HH:mm:ss
    expect(formatearFechaHoraEnvio('2026-11-06 15:05:32')).toBe('06/11/2026, 15:05:32');
    expect(formatearFechaHoraEnvio('2026-11-02 12:10:00')).toBe('02/11/2026, 12:10:00');
    expect(formatearFechaHoraEnvio('2026-01-05 08:00:09')).toBe('05/01/2026, 08:00:09');

    // Casos RFC 3339 con offset explícito:
    // Offset local de Lima (-05:00)
    expect(formatearFechaHoraEnvio('2026-11-06T15:05:32-05:00')).toBe('06/11/2026, 15:05:32');

    // Casos RFC 3339 en UTC (Z): debe convertirse a America/Lima (-5 horas)
    expect(formatearFechaHoraEnvio('2026-11-06T20:05:32Z')).toBe('06/11/2026, 15:05:32');

    // Caso con cambio de día UTC vs America/Lima:
    // 07 de Noviembre a las 02:05:32 UTC corresponde a las 21:05:32 del 06 de Noviembre en Lima (-5 horas)
    expect(formatearFechaHoraEnvio('2026-11-07T02:05:32Z')).toBe('06/11/2026, 21:05:32');
  });

  it('muestra fecha y hora de envío de forma uniforme en Paso 4, Modal Ver Detalle y Listado de solicitudes', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    const solicitudConFechaZ: Solicitud = {
      ...SOLICITUD_PRUEBA,
      id: 88,
      evento_id: 1,
      fecha_creacion: '2026-11-06T20:05:32Z',
    };

    // Responder llamadas HTTP iniciales
    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([solicitudConFechaZ]);
    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    fixture.detectChanges();

    const textoFechaEsperado = '06/11/2026, 15:05:32';

    // 1. Listado de solicitudes - Tabla escritorio y tarjeta móvil
    const el: HTMLElement = fixture.nativeElement;
    const thFecha = el.querySelector('.tabla-solicitudes th:nth-child(3)');
    expect(thFecha?.textContent?.trim()).toBe('Fecha de envío');

    const celdaFecha = el.querySelector('.celda-fecha-envio .fecha-envio-texto');
    expect(celdaFecha?.textContent?.trim()).toBe(textoFechaEsperado);

    const tarjetaMovilFecha = el.querySelector('.tarjeta-solicitud-movil__item');
    expect(tarjetaMovilFecha?.textContent).toContain('Fecha de envío:');
    expect(tarjetaMovilFecha?.textContent).toContain(textoFechaEsperado);

    // 2. Modal "Ver detalle"
    app.abrirModalDetalle(solicitudConFechaZ);
    fixture.detectChanges();

    const modalSubtitulo = el.querySelector('.modal-subtitulo');
    expect(modalSubtitulo?.textContent).toContain('Solicitud SOL-2026-088');
    expect(modalSubtitulo?.textContent).toContain(`Fecha y hora de envío: ${textoFechaEsperado}`);

    // No debe haber duplicación bajo Espacio
    const modalDatos = el.querySelectorAll('.modal-dato');
    let textoBajoEspacio = '';
    modalDatos.forEach((md) => {
      if (md.querySelector('.modal-dato__label')?.textContent?.includes('Espacio')) {
        textoBajoEspacio = md.textContent ?? '';
      }
    });
    expect(textoBajoEspacio).not.toContain('Registrada:');
    expect(textoBajoEspacio).not.toContain('Fecha y hora de envío');

    // Reabrir modal no altera la fecha
    app.cerrarModalDetalle();
    fixture.detectChanges();
    app.abrirModalDetalle(solicitudConFechaZ);
    fixture.detectChanges();
    const modalSubtituloReabierto = el.querySelector('.modal-subtitulo');
    expect(modalSubtituloReabierto?.textContent).toContain(`Fecha y hora de envío: ${textoFechaEsperado}`);

    // 3. Paso 4 "Solicitud enviada"
    app.solicitudConfirmada.set(solicitudConFechaZ);
    app.pasoActual.set(4);
    fixture.detectChanges();

    const metaItems = el.querySelectorAll('.confirmacion-meta-item');
    let encontradoPaso4 = false;
    metaItems.forEach((item) => {
      const label = item.querySelector('small')?.textContent?.trim();
      if (label === 'Fecha y hora de envío') {
        encontradoPaso4 = true;
        expect(item.querySelector('strong')?.textContent?.trim()).toBe(textoFechaEsperado);
      }
    });
    expect(encontradoPaso4).toBe(true);
  });

  it('el listado en escritorio tiene exactamente las seis columnas compactas del prototipo y en el orden solicitado', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const solicitudFila: Solicitud = {
      ...SOLICITUD_PRUEBA,
      id: 7,
      evento_id: 1,
      fecha_creacion: '2026-11-06T15:05:32-05:00',
    };

    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([solicitudFila]);
    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const encabezados = Array.from(el.querySelectorAll('.tabla-solicitudes th')).map((th) =>
      th.textContent?.trim()
    );

    // Exactamente 6 columnas en el orden estricto del prototipo
    expect(encabezados).toEqual([
      'Código',
      'Evento',
      'Fecha de envío',
      'Cambios solicitados',
      'Estado',
      'Acción',
    ]);

    // Verificar que las columnas verbose no están en la tabla
    expect(encabezados).not.toContain('Datos originales');
    expect(encabezados).not.toContain('Datos propuestos');
    expect(encabezados).not.toContain('Motivo');

    // Verificar contenido de las celdas en la fila
    const fila = el.querySelector('.tabla-solicitudes tbody tr');
    expect(fila).toBeTruthy();

    const celdaCodigo = fila?.querySelector('.celda-codigo')?.textContent?.trim();
    expect(celdaCodigo).toBe('SOL-2026-007');

    const celdaEvento = fila?.querySelector('.celda-evento');
    expect(celdaEvento?.textContent).toContain('Lanzamiento Corporativo Showtech 2026');
    expect(celdaEvento?.textContent).toContain('Evento ID: 1');

    const celdaFecha = fila?.querySelector('.celda-fecha-envio')?.textContent?.trim();
    expect(celdaFecha).toBe('06/11/2026, 15:05:32');

    const celdaCambios = fila?.querySelector('.celda-cambios')?.textContent?.trim();
    expect(celdaCambios).toBe('5 campos modificados');

    const celdaEstado = fila?.querySelector('.celda-estado')?.textContent?.trim();
    expect(celdaEstado).toBe('Pendiente de revisión');

    const btnAccion = fila?.querySelector('.celda-accion button');
    expect(btnAccion?.textContent?.trim()).toBe('Ver detalle');
  });

  it('calcularResumenCambiosSolicitud cuenta con precisión campos generales, horarios, tiempos técnicos y adicionales', () => {
    // 1. Cambio únicamente en un campo de contacto -> 1 campo modificado (singular)
    const sol1: Solicitud = {
      ...SOLICITUD_PRUEBA,
      datos_originales: { ...EVENTO_PRUEBA, contacto: 'María Rodríguez' },
      datos_propuestos: { ...EVENTO_PRUEBA, contacto: 'Lucía Fernández' },
    };
    expect(contarCambiosSolicitud(sol1, CATALOGO_PRUEBA)).toBe(1);
    expect(obtenerResumenCambiosSolicitud(sol1, CATALOGO_PRUEBA)).toBe('1 campo modificado');

    // 2. Horario principal cambia tanto hora_inicio como hora_fin -> cuenta como 1 solo bloque
    const solHorario: Solicitud = {
      ...SOLICITUD_PRUEBA,
      datos_originales: { ...EVENTO_PRUEBA, hora_inicio: '09:00', hora_fin: '13:00' },
      datos_propuestos: { ...EVENTO_PRUEBA, hora_inicio: '10:00', hora_fin: '15:00' },
    };
    expect(contarCambiosSolicitud(solHorario, CATALOGO_PRUEBA)).toBe(1);
    expect(obtenerResumenCambiosSolicitud(solHorario, CATALOGO_PRUEBA)).toBe('1 campo modificado');

    // 3. Fecha + Horario (inicio y fin) -> 2 campos modificados
    const solFechaYHorario: Solicitud = {
      ...SOLICITUD_PRUEBA,
      datos_originales: { ...EVENTO_PRUEBA, fecha: '2026-11-15', hora_inicio: '09:00', hora_fin: '13:00' },
      datos_propuestos: { ...EVENTO_PRUEBA, fecha: '2026-11-20', hora_inicio: '10:00', hora_fin: '15:00' },
    };
    expect(contarCambiosSolicitud(solFechaYHorario, CATALOGO_PRUEBA)).toBe(2);
    expect(obtenerResumenCambiosSolicitud(solFechaYHorario, CATALOGO_PRUEBA)).toBe('2 campos modificados');

    // 4. Tiempos técnicos: Montaje y ensayo cambian -> 2 bloques
    const solTiempos: Solicitud = {
      ...SOLICITUD_PRUEBA,
      datos_originales: { ...EVENTO_PRUEBA, has_montaje: false, has_ensayo: false },
      datos_propuestos: {
        ...EVENTO_PRUEBA,
        has_montaje: true,
        montaje_fecha: '2026-11-15',
        montaje_hora_inicio: '08:00',
        montaje_hora_fin: '09:00',
        has_ensayo: true,
        ensayo_fecha: '2026-11-14',
        ensayo_hora_inicio: '16:00',
        ensayo_hora_fin: '18:00',
      },
    };
    expect(contarCambiosSolicitud(solTiempos, CATALOGO_PRUEBA)).toBe(2);
    expect(obtenerResumenCambiosSolicitud(solTiempos, CATALOGO_PRUEBA)).toBe('2 campos modificados');

    // 5. Adicional con variación monetaria cero (2 un x 2 h = 40 vs 1 un x 4 h = 40)
    // Debe contar como 1 campo modificado aunque no haya cambio de importe monetario
    const itemOrig40: AdicionalItem = {
      id: 'cochera',
      nombre: 'Cochera',
      unidad: 'unidad',
      cantidad: 2,
      horas: 2,
      tarifa_hora: 10,
      subtotal: 40,
    };
    const itemProp40: AdicionalItem = {
      id: 'cochera',
      nombre: 'Cochera',
      unidad: 'unidad',
      cantidad: 1,
      horas: 4,
      tarifa_hora: 10,
      subtotal: 40,
    };
    const solAdicVarCero: Solicitud = {
      ...SOLICITUD_PRUEBA,
      datos_originales: { ...EVENTO_PRUEBA, adicionales: [itemOrig40] },
      datos_propuestos: { ...EVENTO_PRUEBA, adicionales: [itemProp40] },
    };
    expect(contarCambiosSolicitud(solAdicVarCero, CATALOGO_PRUEBA)).toBe(1);
    expect(obtenerResumenCambiosSolicitud(solAdicVarCero, CATALOGO_PRUEBA)).toBe('1 campo modificado');

    // 6. Combinación de 3 cambios: 1 general (nombre) + 1 fecha + 1 adicional nuevo
    const itemNuevo: AdicionalItem = {
      id: 'microfono',
      nombre: 'Micrófono inalámbrico',
      unidad: 'unidad',
      cantidad: 2,
      horas: 3,
      tarifa_hora: 5,
      subtotal: 30,
    };
    const solTresCambios: Solicitud = {
      ...SOLICITUD_PRUEBA,
      datos_originales: { ...EVENTO_PRUEBA, nombre: 'Evento A', fecha: '2026-11-15', adicionales: [] },
      datos_propuestos: { ...EVENTO_PRUEBA, nombre: 'Evento B', fecha: '2026-11-20', adicionales: [itemNuevo] },
    };
    expect(contarCambiosSolicitud(solTresCambios, CATALOGO_PRUEBA)).toBe(3);
    expect(obtenerResumenCambiosSolicitud(solTresCambios, CATALOGO_PRUEBA)).toBe('3 campos modificados');

    // 7. Registro histórico sin datos suficientes para comparar -> "Consultar detalle"
    const solHistoricaIncompleta: Solicitud = {
      ...SOLICITUD_PRUEBA,
      datos_originales: {} as any,
      datos_propuestos: {} as any,
    };
    expect(contarCambiosSolicitud(solHistoricaIncompleta, CATALOGO_PRUEBA)).toBeNull();
    expect(obtenerResumenCambiosSolicitud(solHistoricaIncompleta, CATALOGO_PRUEBA)).toBe('Consultar detalle');

    // Registro nulo o indefinido
    expect(contarCambiosSolicitud(null, CATALOGO_PRUEBA)).toBeNull();
    expect(obtenerResumenCambiosSolicitud(null, CATALOGO_PRUEBA)).toBe('Consultar detalle');
  });

  it('renderiza motivos largos de hasta 400 caracteres con saltos de línea, palabras extensas y sin interpretar HTML en el modal y pasos 3 y 4', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    const motivoCompleto400 =
      'Solicitamos reprogramación por evento institucional.\n\n' +
      'Detalle del cambio de agenda con una palabra excesivamente larga:\n' +
      'PALABRA_EXTREMADAMENTE_LARGA_SIN_ESPACIOS_PARA_VERIFICAR_OVERFLOW_WRAP_ANYWHERE_1234567890_ABCDEFGHIJKLM\n\n' +
      'Nota técnica: <script>window.hack=true</script> & requerimiento especial de energía eléctrica en sala 4.';

    expect(motivoCompleto400.length).toBeLessThanOrEqual(400);

    const solicitudMotivoLargo: Solicitud = {
      ...SOLICITUD_PRUEBA,
      id: 99,
      motivo: motivoCompleto400,
    };

    httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
    httpMock.expectOne('/api/solicitudes').flush([solicitudMotivoLargo]);
    httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;

    // 1. Abrir Modal de detalle y verificar que el motivo se muestra completo y como texto literal
    app.abrirModalDetalle(solicitudMotivoLargo);
    fixture.detectChanges();

    const modalMotivoBox = el.querySelector('.modal-motivo .motivo-box-review');
    expect(modalMotivoBox).toBeTruthy();
    expect(modalMotivoBox?.textContent).toContain('Solicitamos reprogramación por evento institucional.');
    expect(modalMotivoBox?.textContent).toContain('PALABRA_EXTREMADAMENTE_LARGA_SIN_ESPACIOS');
    expect(modalMotivoBox?.textContent).toContain('<script>window.hack=true</script>');
    // No se interpreta como script en el DOM
    expect(el.querySelector('.modal-motivo script')).toBeNull();

    // El botón de cierre del modal en la cabecera existe y cierra el modal
    const btnCloseHeader = el.querySelector('.modal-header .modal-close-btn') as HTMLElement;
    expect(btnCloseHeader).toBeTruthy();
    btnCloseHeader.click();
    fixture.detectChanges();
    expect(app.solicitudDetalleModal()).toBeNull();

    // 2. Verificar Paso 4 "Confirmación"
    app.solicitudConfirmada.set(solicitudMotivoLargo);
    app.pasoActual.set(4);
    fixture.detectChanges();

    const motivoPaso4 = el.querySelector('.confirmacion-motivo-texto');
    expect(motivoPaso4).toBeTruthy();
    expect(motivoPaso4?.textContent).toContain('Solicitamos reprogramación por evento institucional.');
    expect(motivoPaso4?.textContent).toContain('PALABRA_EXTREMADAMENTE_LARGA_SIN_ESPACIOS');
    expect(motivoPaso4?.textContent).toContain('<script>window.hack=true</script>');
    expect(el.querySelector('.confirmacion-meta-item script')).toBeNull();
  });

  describe('Portal y Flujo del Asesor Comercial', () => {
    it('un cliente ve su portal, sin acceso a la vista del asesor, con su nombre y el botón de cerrar sesión', () => {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(app.vistaActiva()).toBe('cliente');
      expect(el.querySelector('app-login')).toBeNull();
      expect(el.querySelector('app-asesor-portal')).toBeNull();
      expect(el.querySelector('.btn-switch-vista')).toBeNull();
      expect(el.querySelector('.usuario-cabecera')?.textContent).toContain('Promoción Horizonte 2026');
      expect(el.querySelector('.btn-cerrar-sesion')).toBeTruthy();
    });

    it('un asesor ve directamente su portal (sin botón para ir a la vista del cliente) y no se piden datos del cliente', () => {
      TestBed.inject(AuthService).limpiarSesion();
      iniciarSesionDePrueba(USUARIO_ASESOR);
      TestBed.resetTestingModule();
      return TestBed.configureTestingModule({
        imports: [App],
        providers: [provideHttpClient(), provideHttpClientTesting()],
      })
        .compileComponents()
        .then(() => {
          const http = TestBed.inject(HttpTestingController);
          const fixture = TestBed.createComponent(App);
          fixture.detectChanges();

          // Solo el portal del asesor carga datos (una vez cada recurso)
          http.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
          http.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
          http.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
          fixture.detectChanges();

          const el: HTMLElement = fixture.nativeElement;
          expect(fixture.componentInstance.vistaActiva()).toBe('asesor');
          expect(el.querySelector('app-asesor-portal')).toBeTruthy();
          expect(el.querySelector('.btn-volver-cliente')).toBeNull();
          expect(el.querySelector('.usuario-cabecera')?.textContent).toContain('Asesor(a) comercial');
          http.verify();
        });
    });

    it('sin sesión muestra el login y no consulta datos del portal', () => {
      TestBed.inject(AuthService).limpiarSesion();
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('app-login')).toBeTruthy();
      expect(el.querySelector('.layout-portal')).toBeNull();
      httpMock.expectNone('/api/eventos');
    });

    it('Paso 1: muestra la razón social del cliente en la tabla y las tarjetas cuando la API la envía', () => {
      const fixture = TestBed.createComponent(AsesorPortalComponent);
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([{ ...EVENTO_PRUEBA, cliente_nombre: 'Promoción Horizonte 2026' }]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('#s1 tbody tr .col-cliente')?.textContent?.trim()).toBe('Promoción Horizonte 2026');
      expect(el.querySelector('.tarjeta-evento-cliente')?.textContent).toContain('Promoción Horizonte 2026');
    });

    it('Paso 1: muestra la tabla de eventos con sus columnas y la bandeja de solicitudes de 6 columnas', () => {
      const fixture = TestBed.createComponent(AsesorPortalComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;

      // 1. Títulos y composición exacta del prototipo
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Modificar datos del evento');
      expect(el.querySelector('.sub')?.textContent?.trim()).toBe(
        'Actualice la información del evento, verifique la disponibilidad del auditorio y confirme los cambios en el sistema.'
      );
      expect(el.querySelector('#s1 h2')?.textContent?.trim()).toBe('1. Seleccionar evento registrado');
      expect(el.textContent).not.toContain('Seleccione un evento de la lista para cargar sus datos y preparar una propuesta');

      // 2. Tabla de eventos de 8 columnas con estilos y anchos del prototipo
      const tablaEventos = el.querySelector('#s1 table');
      expect(tablaEventos).toBeTruthy();
      const thsEventos = Array.from(tablaEventos!.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
      expect(thsEventos).toEqual([
        'ID',
        'Cliente',
        'Evento',
        'Fecha',
        'Horario',
        'Tiempos técnicos',
        'Estado',
        'Acción',
      ]);

      const filaActiva = tablaEventos!.querySelector('tbody tr');
      expect(filaActiva?.classList.contains('fila-activa')).toBe(true);
      expect(filaActiva?.querySelector('.col-codigo')?.textContent).toContain('ID: 1');
      expect(el.textContent).not.toContain('EVT-');
      expect(filaActiva?.querySelector('.col-cliente')?.textContent?.trim()).toBe('No disponible');
      expect(filaActiva?.querySelector('.col-evento')?.textContent).toContain('Lanzamiento Corporativo Showtech 2026');
      expect(filaActiva?.querySelector('.col-fecha')?.textContent).toBe('15/11/2026');
      expect(filaActiva?.querySelector('.col-horario')?.textContent).toBe('09:00 - 13:00');

      // 3. Tiempos técnicos completos sin abreviaturas técnicas
      const tecCompacto = filaActiva?.querySelector('.tecnicos-compacto');
      expect(tecCompacto).toBeTruthy();
      expect(tecCompacto?.textContent).toContain('Montaje: 15/11/2026 (08:00 - 09:00)');
      expect(tecCompacto?.textContent).toContain('Desmontaje: 15/11/2026 (13:00 - 14:00)');

      // Estado Confirmado con etiqueta verde suave
      const badgeEstado = filaActiva?.querySelector('.et-confirmado');
      expect(badgeEstado).toBeTruthy();
      expect(badgeEstado?.textContent?.trim()).toBe('Confirmado');

      // Botón Editando con estilo neutro btn-sec (no botón verde)
      const btnAccion = filaActiva?.querySelector('.col-accion button') as HTMLButtonElement;
      expect(btnAccion).toBeTruthy();
      expect(btnAccion.textContent?.trim()).toBe('Editando');
      expect(btnAccion.classList.contains('btn-sec')).toBe(true);
      expect(btnAccion.classList.contains('btn-ok')).toBe(false);

      // 4. Contador y Banner del evento seleccionado
      expect(el.querySelector('.contador-eventos')?.textContent?.trim()).toBe('1 evento registrado');
      const banner = el.querySelector('#bannerSeleccionado');
      expect(banner).toBeTruthy();
      expect(banner?.querySelector('strong')?.textContent?.trim()).toBe(
        'ID: 1 • Lanzamiento Corporativo Showtech 2026'
      );
      expect(banner?.querySelector('button')?.textContent?.trim()).toContain('Continuar con este evento');
      expect(el.querySelector('.nota-ejemplo')?.textContent?.trim()).toBe(
        '* Haga clic en "Seleccionar" en la tabla para cargar cualquier evento en el formulario.'
      );

      // 5. Tres tarjetas independientes en Paso 1 (Selección, Historial, Bandeja)
      const cardSeleccion = el.querySelector('section.tarjeta#s1');
      const cardHistorial = el.querySelector('details.tarjeta#secHistorial');
      const cardBandeja = el.querySelector('section.tarjeta.seccion-solicitudes-asesor');
      expect(cardSeleccion).toBeTruthy();
      expect(cardHistorial).toBeTruthy();
      expect(cardBandeja).toBeTruthy();

      // Historial independiente sin afirmar "0 modificaciones registradas"
      expect(cardHistorial?.textContent).toContain('Historial de auditoría no disponible en la API para este registro');

      // 6. Bandeja de solicitudes de clientes (6 columnas obligatorias)
      const tablaSolicitudes = cardBandeja!.querySelector('.tabla-solicitudes');
      expect(tablaSolicitudes).toBeTruthy();
      const ths = Array.from(tablaSolicitudes!.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
      expect(ths).toEqual(['Código', 'Evento', 'Fecha de envío', 'Cambios solicitados', 'Estado', 'Acción']);

      // Código con numeral (#1)
      const filaSol = tablaSolicitudes!.querySelector('tbody tr');
      expect(filaSol?.querySelector('.th-codigo')?.textContent).toContain('SOL-2026-001');
      expect(filaSol?.querySelector('.th-accion button')?.textContent).toContain('Revisar solicitud');
    });

    it('Paso 1: permite abrir el modal de revisión de solicitud con snapshots en solo lectura y motivo completo', () => {
      const fixture = TestBed.createComponent(AsesorPortalComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const btnRevisar = el.querySelector('.seccion-solicitudes-asesor .btn-revisar') as HTMLButtonElement;
      expect(btnRevisar).toBeTruthy();
      btnRevisar.click();
      fixture.detectChanges();

      // Modal abierto
      expect(el.querySelector('#modalRevisionTitulo')?.textContent).toContain('Revisión de solicitud SOL-2026-001');
      expect(el.querySelector('.motivo-texto-completo')?.textContent).toContain(
        'Cambio de persona de contacto y retiro de opcionales'
      );
      expect(el.textContent).toContain('Esta vista es de solo lectura');

      // Cerrar modal
      const btnCerrar = el.querySelector('.modal-footer .btn-primario') as HTMLButtonElement;
      btnCerrar.click();
      fixture.detectChanges();
      expect(el.querySelector('#modalRevisionTitulo')).toBeNull();
    });

    it('Paso 2, 3 y 4: permite editar borrador del asesor, valida disponibilidad con estado pendiente y restringe guardado definitivo', async () => {
      const fixture = TestBed.createComponent(AsesorPortalComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
      fixture.detectChanges();
      await fixture.whenStable();

      const el: HTMLElement = fixture.nativeElement;

      // Paso 1: clic en el botón de la tabla navega directamente al paso 2 (Modificar datos)
      const btnTablaSeleccionar = el.querySelector('#tablaEventos tr .col-accion button') as HTMLButtonElement;
      expect(btnTablaSeleccionar).toBeTruthy();
      btnTablaSeleccionar.click();
      fixture.detectChanges();
      await fixture.whenStable();

      // En Paso 2: verificar formulario de edición
      expect(el.querySelector('#s2')).toBeTruthy();
      expect(comp.pasoActual()).toBe(2);
      expect(comp.borrador()?.nombre).toBe(EVENTO_PRUEBA.nombre);
      const inputNombre = el.querySelector('#eventName') as HTMLInputElement;
      expect(inputNombre).toBeTruthy();
      expect(inputNombre.value).toBe(EVENTO_PRUEBA.nombre);

      // "Cambio solicitado por": no atribuye "Cliente" falsamente a la API ni genera falsa modificación
      expect(comp.borrador()?.solicitado_por).toBe('');
      expect(comp.cambioSolicitadoPor()).toBe(false);
      const labelRequestedBy = el.querySelector('label[for="requestedBy"]');
      expect(labelRequestedBy?.querySelector('.mod-pill')).toBeNull();

      // Al seleccionar canal como dato local explícito, no genera modificación falsa sobre la reserva
      comp.actualizarCampoBorrador('solicitado_por', 'Asesor comercial');
      fixture.detectChanges();
      expect(comp.cambioSolicitadoPor()).toBe(false);
      expect(labelRequestedBy?.querySelector('.mod-pill')).toBeNull();

      // Al activar ensayo técnico nuevo (no existía en el evento):
      // Muestra "Ensayo añadido" en la cabecera y NO marca los inputs internos como modificados
      comp.alternarEnsayo(true);
      fixture.detectChanges();
      expect(comp.ensayoRecienAnadido()).toBe(true);
      expect(el.querySelector('#modBadgeEnsayoAdded')?.textContent).toContain('Ensayo añadido');
      expect(comp.cambioEnsayoFecha()).toBe(false);
      expect(comp.cambioEnsayoInicio()).toBe(false);
      expect(comp.cambioEnsayoFin()).toBe(false);
      expect(el.querySelector('#ensayoStartTime')?.classList.contains('campo-modificado')).toBe(false);
      expect(el.querySelector('#ensayoEndTime')?.classList.contains('campo-modificado')).toBe(false);

      // Si el asesor cambia el horario del ensayo (ej. a 07:00 y fin a 08:00 para franja contigua sin solaparse con montaje 08:00-09:00), sí se marca ese campo como modificado
      comp.actualizarCampoBorrador('ensayo_hora_inicio', '07:00');
      comp.actualizarCampoBorrador('ensayo_hora_fin', '08:00');
      fixture.detectChanges();
      expect(comp.cambioEnsayoInicio()).toBe(true);
      expect(el.querySelector('#ensayoStartTime')?.classList.contains('campo-modificado')).toBe(true);
      expect(el.querySelector('label[for="ensayoStartTime"] .mod-pill')?.textContent).toContain('Modificado');

      // Avanzar al Paso 3
      const btnValidar = Array.from(el.querySelectorAll('#s2 .acciones button')).find(
        (b) => b.textContent?.includes('Validar disponibilidad')
      ) as HTMLButtonElement;
      expect(btnValidar).toBeTruthy();
      btnValidar.click();
      fixture.detectChanges();

      // En Paso 3: comprobación local de coherencia de horarios
      expect(el.querySelector('#s3')).toBeTruthy();
      const btnCheck = el.querySelector('#btnCheckAvailability') as HTMLButtonElement;
      expect(btnCheck).toBeTruthy();
      btnCheck.click();
      fixture.detectChanges();

      // Validación local: NO se presenta como disponibilidad física confirmada ni aviso verde
      expect(el.querySelector('#s3 .aviso-ok')).toBeNull();
      const feedbackAviso = el.querySelector('#s3 #availabilityFeedback');
      expect(feedbackAviso).toBeTruthy();
      expect(feedbackAviso?.classList.contains('aviso-alerta')).toBe(true);
      expect(feedbackAviso?.textContent).toContain('Horarios coherentes. Disponibilidad pendiente de comprobar');
      expect(feedbackAviso?.textContent).not.toContain('Sin conflictos');

      // Se puede avanzar a revisar el borrador sin que signifique disponibilidad confirmada
      const btnContinuarPaso4 = Array.from(el.querySelectorAll('#s3 .acciones button')).find(
        (b) => b.textContent?.includes('Continuar a revisión del borrador')
      ) as HTMLButtonElement;
      expect(btnContinuarPaso4).toBeTruthy();
      expect(btnContinuarPaso4.disabled).toBe(false);
      btnContinuarPaso4.click();
      fixture.detectChanges();
      expect(btnContinuarPaso4).toBeTruthy();
      btnContinuarPaso4.click();
      fixture.detectChanges();

      // En Paso 4: Revisión
      expect(el.querySelector('#s4')).toBeTruthy();
      expect(el.querySelector('#s4 .comparativo-tabla')).toBeTruthy();
      expect(el.querySelector('.resumen-duracion-box')).toBeTruthy();

      // Ficha completa desplegable con marca de agua "BORRADOR PRELIMINAR"
      const btnFicha = el.querySelector('.btn-ficha-toggle') as HTMLButtonElement;
      expect(btnFicha).toBeTruthy();
      btnFicha.click();
      fixture.detectChanges();

      const comprobante = el.querySelector('.contenedor-ficha-completa .comprobante');
      expect(comprobante).toBeTruthy();
      expect(comprobante?.querySelector('.marca-agua')?.textContent).toContain('BORRADOR PRELIMINAR');

      // Botón de guardado definitivo debe estar deshabilitado
      const btnGuardarDefinitivo = Array.from(el.querySelectorAll('#s4 .acciones button')).find(
        (b) => b.textContent?.includes('Confirmar y guardar cambios')
      ) as HTMLButtonElement;
      expect(btnGuardarDefinitivo).toBeTruthy();
      expect(btnGuardarDefinitivo.disabled).toBe(true);
    });

    it('conserva el borrador del asesor al retroceder y solicita confirmación antes de descartar cambios', async () => {
      const fixture = TestBed.createComponent(AsesorPortalComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
      fixture.detectChanges();
      await fixture.whenStable();

      // Ir a Paso 2
      comp.irPaso(2);
      fixture.detectChanges();
      await fixture.whenStable();

      // Modificar el nombre en el borrador
      comp.borrador.set({ ...comp.borrador()!, nombre: 'Nombre Modificado por Asesor' });
      fixture.detectChanges();
      expect(comp.tieneCambiosSinGuardar()).toBe(true);
      expect(comp.cambioNombre()).toBe(true);

      // Retroceder al Paso 1
      comp.irPaso(1);
      fixture.detectChanges();
      expect(comp.pasoActual()).toBe(1);

      // Volver al Paso 2: el borrador modificado debe conservarse
      comp.irPaso(2);
      fixture.detectChanges();
      expect(comp.borrador()?.nombre).toBe('Nombre Modificado por Asesor');

      // Solicitar descarte de cambios: debe abrir el modal de confirmación
      comp.solicitarDescarte();
      fixture.detectChanges();
      expect(comp.modalDescartarAbierto()).toBe(true);
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('#modalDiscardTitle')?.textContent).toContain('¿Descartar modificaciones?');

      // Confirmar descarte: restaura los valores del evento original
      comp.ejecutarDescarte();
      fixture.detectChanges();
      expect(comp.modalDescartarAbierto()).toBe(false);
      expect(comp.borrador()?.nombre).toBe(EVENTO_PRUEBA.nombre);
      expect(comp.tieneCambiosSinGuardar()).toBe(false);
      expect(comp.pasoActual()).toBe(1);
    });

    it('integra correctamente la estructura de estilos del prototipo: pasos numerados, responsive tables/cards y cabecera', () => {
      const fixture = TestBed.createComponent(AsesorPortalComponent);
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;

      // 1. Contenedor y cabecera
      expect(el.querySelector('.layout-portal')).toBeTruthy();
      expect(el.querySelector('.cabecera.cabecera-asesor')).toBeTruthy();
      expect(el.querySelector('.marca span')?.textContent).toBe('SOLUTIONS');
      expect(el.querySelector('.badge-rol-asesor')).toBeNull();
      expect(el.querySelector('.marca')?.textContent).not.toContain('Portal del Asesor');
      expect(el.querySelector('.contenedor-portal')).toBeTruthy();

      // 2. Barra de 4 pasos con círculos numerados
      const pasos = el.querySelectorAll('.pasos .paso');
      expect(pasos.length).toBe(4);
      pasos.forEach((p, idx) => {
        expect(p.querySelector('.num')?.textContent?.trim()).toBe(String(idx + 1));
      });

      // 3. Tablas de escritorio vs tarjetas móviles estructuradas para responsive
      const tablaDesktopEventos = el.querySelector('#s1 .tabla-wrap.tabla-desktop');
      expect(tablaDesktopEventos).toBeTruthy();
      const tarjetasMovilEventos = el.querySelector('#s1 .tarjetas-eventos-movil');
      expect(tarjetasMovilEventos).toBeTruthy();

      const tablaDesktopSolicitudes = el.querySelector('.seccion-solicitudes-asesor .tabla-wrap.tabla-desktop');
      expect(tablaDesktopSolicitudes).toBeTruthy();
      const tarjetasMovilSolicitudes = el.querySelector('.tarjetas-solicitudes-movil');
      expect(tarjetasMovilSolicitudes).toBeTruthy();

      // 4. Separación de identificador y estado en tarjetas móviles
      const cabTarjeta = el.querySelector('.tarjeta-evento-cab');
      expect(cabTarjeta).toBeTruthy();
      const codSpan = cabTarjeta?.querySelector('.tarjeta-evento-codigo');
      const estSpan = cabTarjeta?.querySelector('.insignia-estado');
      expect(codSpan).toBeTruthy();
      expect(estSpan).toBeTruthy();
      expect(codSpan?.textContent).toContain('ID: 1');
      expect(estSpan?.textContent).toContain('Confirmado');
    });

    it('Paso 1 a 4: identificación consistente del evento (ID: 1) sin EVT- artificial y búsqueda por ID, nombre y espacio', async () => {
      const fixture = TestBed.createComponent(AsesorPortalComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
      fixture.detectChanges();
      await fixture.whenStable();

      const el: HTMLElement = fixture.nativeElement;

      // 1. Verificación en Paso 1: Sin prefijo EVT-, con formato "ID: 1"
      expect(el.textContent).not.toContain('EVT-');
      expect(el.querySelector('.tarjeta-evento-codigo')?.textContent?.trim()).toBe('ID: 1');
      expect(el.querySelector('#bannerTextoEvento')?.textContent).toContain('ID: 1');

      // 2. Búsqueda por ID numérico ("1")
      comp.filtroBuscador.set('1');
      expect(comp.eventosFiltrados().length).toBe(1);

      // Búsqueda por etiqueta ("id: 1")
      comp.filtroBuscador.set('id: 1');
      expect(comp.eventosFiltrados().length).toBe(1);

      // Búsqueda por nombre
      comp.filtroBuscador.set('Lanzamiento');
      expect(comp.eventosFiltrados().length).toBe(1);

      // Búsqueda por espacio ("Auditorio Principal A")
      comp.filtroBuscador.set('Principal A');
      expect(comp.eventosFiltrados().length).toBe(1);

      // Búsqueda sin coincidencias
      comp.filtroBuscador.set('Inexistente');
      expect(comp.eventosFiltrados().length).toBe(0);

      // Limpiar búsqueda
      comp.filtroBuscador.set('');
      expect(comp.eventosFiltrados().length).toBe(1);

      // 3. Verificación en Paso 2: Input de solo lectura y badge
      comp.irPaso(2);
      fixture.detectChanges();
      await fixture.whenStable();

      const badgePaso2 = el.querySelector('#s2 .et-evento-activo');
      expect(badgePaso2?.textContent).toContain('ID: 1');
      expect(badgePaso2?.textContent).not.toContain('EVT-');

      const inputCodigo = el.querySelector('#eventCode') as HTMLInputElement;
      expect(inputCodigo.value).toBe('ID: 1');
      expect(el.querySelector('label[for="eventCode"]')?.textContent).toContain('Identificador del evento');

      // 4. Verificación en Paso 3: Horarios propuestos sin EVT-
      comp.irPaso(3);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(el.textContent).not.toContain('EVT-');

      // 5. Verificación en Paso 4: Ficha completa del evento (requiere comprobación previa de horarios)
      comp.comprobarDisponibilidad();
      fixture.detectChanges();
      comp.irPaso(4);
      fixture.detectChanges();
      await fixture.whenStable();

      // Abrir ficha completa
      comp.toggleFicha();
      fixture.detectChanges();

      expect(el.querySelector('.comprobante')?.textContent).toContain('ID: 1');
      expect(el.querySelector('.comprobante')?.textContent).not.toContain('EVT-');
      expect(el.querySelector('.comp-etiq')?.textContent).toContain('Identificador');

      // 6. Verificación en Modal de revisión: Metadata con ID real
      comp.irPaso(1);
      fixture.detectChanges();
      comp.abrirModalSolicitud(SOLICITUD_PRUEBA);
      fixture.detectChanges();

      const modal = el.querySelector('.modal-dialog');
      expect(modal).toBeTruthy();
      expect(modal?.textContent).toContain('ID: 1');
      expect(modal?.textContent).not.toContain('EVT-');
      expect(modal?.textContent).toContain('SOL-2026-001'); // Solicitud #1
    });

    it('Paso 2: estructura fiel del prototipo (grilla de 4 columnas, tiempos técnicos apilados, cronograma con timeline-pills y tabla de adicionales)', async () => {
      const fixture = TestBed.createComponent(AsesorPortalComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);

      // Cargar Paso 2
      comp.irPaso(2);
      fixture.detectChanges();
      await fixture.whenStable();

      const el: HTMLElement = fixture.nativeElement;
      const sec2 = el.querySelector('#s2');
      expect(sec2).toBeTruthy();

      // 1. Título y badge activo del Paso 2
      expect(sec2?.querySelector('h2')?.textContent).toContain('2. Modificar datos del evento');
      const badgePaso2 = sec2?.querySelector('#badgeEventoPaso2');
      expect(badgePaso2?.textContent).toContain('ID: 1');
      expect(badgePaso2?.textContent).toContain('Confirmado');

      // 2. Grilla de 4 columnas e inputs generales
      const formGeneral = sec2?.querySelector('.form');
      expect(formGeneral).toBeTruthy();
      const inputCode = sec2?.querySelector('#eventCode') as HTMLInputElement;
      const inputSpace = sec2?.querySelector('#eventSpace') as HTMLInputElement;
      const inputName = sec2?.querySelector('#eventName') as HTMLInputElement;
      const inputClient = sec2?.querySelector('#eventClient') as HTMLInputElement;
      const inputContact = sec2?.querySelector('#eventContact') as HTMLInputElement;
      const inputPhone = sec2?.querySelector('#eventPhone') as HTMLInputElement;
      const inputEmail = sec2?.querySelector('#eventEmail') as HTMLInputElement;
      const selRequestedBy = sec2?.querySelector('#requestedBy') as HTMLSelectElement;
      const txtNotes = sec2?.querySelector('#eventNotes') as HTMLTextAreaElement;

      expect(inputCode).toBeTruthy();
      expect(inputCode.readOnly).toBe(true);
      expect(inputSpace).toBeTruthy();
      expect(inputSpace.readOnly).toBe(true);
      expect(inputName).toBeTruthy();
      expect(inputClient).toBeTruthy();
      expect(inputClient.readOnly).toBe(true);
      expect(inputContact).toBeTruthy();
      expect(inputPhone).toBeTruthy();
      expect(inputEmail).toBeTruthy();
      expect(selRequestedBy).toBeTruthy();
      expect(txtNotes).toBeTruthy();

      // Filas completas con .completo
      expect(inputName.closest('.completo')).toBeTruthy();
      expect(selRequestedBy.closest('.completo')).toBeTruthy();
      expect(txtNotes.closest('.completo')).toBeTruthy();

      // Cliente no tiene asterisco de requerido
      const labelCliente = sec2?.querySelector('label[for="eventClient"]');
      expect(labelCliente?.textContent).toContain('Cliente (nombre o razón social)');
      expect(labelCliente?.querySelector('.req')).toBeNull();

      // 3. Bloque Fecha y horario principal
      const bloqueFecha = sec2?.querySelector('.bloque-fecha-evento');
      expect(bloqueFecha).toBeTruthy();
      const badgeEvento = bloqueFecha?.querySelector('.badge-evento');
      expect(badgeEvento?.textContent?.trim()).toBe('EVENTO PRINCIPAL');
      expect(bloqueFecha?.querySelector('.campo-fecha-wrap .icono-calendario')).toBeTruthy();
      expect(bloqueFecha?.querySelectorAll('.campo-hora-wrap .icono-reloj').length).toBe(2);

      // 4. Bloque Tiempos técnicos apilados
      const panelMontaje = sec2?.querySelector('#panelMontaje');
      const panelDesmontaje = sec2?.querySelector('#panelDesmontaje');
      const panelEnsayo = sec2?.querySelector('#panelEnsayo');
      expect(panelMontaje).toBeTruthy();
      expect(panelDesmontaje).toBeTruthy();
      expect(panelEnsayo).toBeTruthy();

      // Badges técnicos en mayúsculas
      expect(panelMontaje?.querySelector('.badge-montaje')?.textContent?.trim()).toBe('MONTAJE TÉCNICO');
      expect(panelDesmontaje?.querySelector('.badge-desmontaje')?.textContent?.trim()).toBe('DESMONTAJE TÉCNICO');
      expect(panelEnsayo?.querySelector('.badge-ensayo')?.textContent?.trim()).toBe('ENSAYO TÉCNICO');

      // Ensayo inicialmente inactivo está compacto (.desactivada)
      expect(panelEnsayo?.classList.contains('desactivada')).toBe(true);
      expect(panelEnsayo?.querySelector('#fieldsEnsayo')).toBeNull();

      // Activar ensayo técnico
      comp.alternarEnsayo(true);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(panelEnsayo?.classList.contains('desactivada')).toBe(false);
      expect(panelEnsayo?.querySelector('#fieldsEnsayo')).toBeTruthy();

      // 5. Cronograma propuesto con timeline-pills
      const cronoBox = sec2?.querySelector('.resumen-horario-box');
      expect(cronoBox).toBeTruthy();
      expect(cronoBox?.querySelector('.resumen-horario-titulo')?.textContent).toContain('CRONOGRAMA PROPUESTO:');
      const pills = cronoBox?.querySelectorAll('.timeline-pill');
      expect(pills?.length).toBeGreaterThan(0);
      const pillClasses = Array.from(pills || []).map((p) => p.className);
      expect(pillClasses.some((c) => c.includes('montaje'))).toBe(true);
      expect(pillClasses.some((c) => c.includes('evento'))).toBe(true);
      expect(pillClasses.some((c) => c.includes('desmontaje'))).toBe(true);
      expect(pillClasses.some((c) => c.includes('ensayo'))).toBe(true);

      // 6. Bloque de adicionales y tabla
      const secAdic = sec2?.querySelector('.seccion-adicionales-evento');
      expect(secAdic).toBeTruthy();
      expect(secAdic?.querySelector('.nota-referencial-prototipo')?.textContent).toContain('Importes referenciales');
      expect(secAdic?.querySelector('.adicionales-form-card')).toBeTruthy();
      expect(secAdic?.querySelector('#btnAgregarAdicional')).toBeTruthy();

      const tablaAdic = secAdic?.querySelector('.tabla-adicionales');
      expect(tablaAdic).toBeTruthy();
      expect(tablaAdic?.querySelectorAll('th').length).toBe(6);
      expect(tablaAdic?.querySelector('.fila-total-adicionales')).toBeTruthy();

      // 7. Acciones del Paso 2
      const accionesPaso2 = sec2?.querySelector('.acciones');
      expect(accionesPaso2?.textContent).toContain('Volver a la lista');
      expect(accionesPaso2?.textContent).toContain('Descartar cambios');
      expect(accionesPaso2?.textContent).toContain('Validar disponibilidad');

      // 8. Historial de auditoría independiente visible al pie
      const secHistorial = el.querySelector('details.tarjeta#secHistorial');
      expect(secHistorial).toBeTruthy();
      expect(secHistorial?.textContent).toContain('Historial de auditoría de este evento');
    });

    it('reproduce el caso real 00:00–13:00 con montaje 08:00–09:00: entrada en estado pendiente sin recuadro rojo, y tras pulsar Comprobar lista errores y bloquea Paso 4', async () => {
      const fixture = TestBed.createComponent(AsesorPortalComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;

      // Cargar evento base
      comp.cargarEvento(EVENTO_PRUEBA);
      comp.irPaso(2);
      fixture.detectChanges();

      // Reproducir caso real:
      // Evento: 00:00–13:00. Montaje: 08:00–09:00. Desmontaje: 13:00–14:00.
      comp.actualizarCampoBorrador('hora_inicio', '00:00');
      comp.actualizarCampoBorrador('hora_fin', '13:00');
      comp.actualizarCampoBorrador('montaje_hora_inicio', '08:00');
      comp.actualizarCampoBorrador('montaje_hora_fin', '09:00');
      comp.actualizarCampoBorrador('desmontaje_hora_inicio', '13:00');
      comp.actualizarCampoBorrador('desmontaje_hora_fin', '14:00');
      fixture.detectChanges();

      // 1. Al entrar al Paso 3 antes de pulsar Comprobar:
      // Debe mostrar estado neutro "Pendiente de comprobar", NUNCA el recuadro rojo ni errores
      comp.irPaso(3);
      fixture.detectChanges();

      expect(comp.estadoPresentacionComprobacion()).toBe('pendiente');
      const feedbackInicial = el.querySelector('#s3 #availabilityFeedback');
      expect(feedbackInicial).toBeNull();
      expect(el.querySelector('#s3 .aviso-error')).toBeNull();
      expect(el.querySelector('#s3 .aviso-alerta')).toBeNull();
      expect(el.querySelector('.lista-errores-horario')).toBeNull();

      // Paso 4 bloqueado antes de comprobar
      const btnContinuarPaso4 = el.querySelector('#btnContinuarPaso4') as HTMLButtonElement;
      expect(btnContinuarPaso4).toBeTruthy();
      expect(btnContinuarPaso4.disabled).toBe(true);

      const stepBtn4 = el.querySelector('#stepBtn4') as HTMLButtonElement;
      expect(stepBtn4).toBeTruthy();
      expect(stepBtn4.disabled).toBe(true);

      // Intento de saltar al Paso 4 es bloqueado y no ejecuta automáticamente la comprobación ni revela su resultado
      comp.irPaso(4);
      fixture.detectChanges();
      expect(comp.pasoActual()).toBe(3);
      expect(comp.estadoPresentacionComprobacion()).toBe('pendiente');
      expect(el.querySelector('#s3 #availabilityFeedback')).toBeNull();

      // 2. Al pulsar «Comprobar disponibilidad en auditorio»:
      // Ahora sí se ejecuta y se presenta el recuadro rojo con errores específicos
      const btnCheck = el.querySelector('#btnCheckAvailability') as HTMLButtonElement;
      expect(btnCheck).toBeTruthy();
      btnCheck.click();
      fixture.detectChanges();

      expect(comp.estadoPresentacionComprobacion()).toBe('invalido');
      const feedback = el.querySelector('#s3 #availabilityFeedback');
      expect(feedback).toBeTruthy();
      expect(feedback?.classList.contains('aviso-error')).toBe(true);
      expect(feedback?.classList.contains('aviso-alerta')).toBe(false);
      expect(el.querySelector('#s3 .aviso-ok')).toBeNull();
      expect(feedback?.textContent).not.toContain('Horarios coherentes');
      expect(feedback?.textContent).toContain('Inconsistencias detectadas en los horarios propuestos');

      // Errores concretos identificados:
      expect(feedback?.textContent).toContain('La hora de inicio del evento debe estar entre las 06:00 y las 22:00');
      expect(feedback?.textContent).toContain('El montaje debe finalizar antes o al comenzar el evento');

      // Botón Continuar a Paso 4 y botón superior siguen bloqueados
      expect(btnContinuarPaso4.disabled).toBe(true);
      expect(stepBtn4.disabled).toBe(true);

      // Comprobar que los errores están vinculados al formulario de Paso 2 con enlaces interactivos
      const errorBtns = el.querySelectorAll('.btn-enlace-error');
      expect(errorBtns.length).toBeGreaterThanOrEqual(2);
      (errorBtns[0] as HTMLButtonElement).click();
      fixture.detectChanges();

      // Navegó a Paso 2 para corregir, conservando los datos escritos y resaltando el campo
      expect(comp.pasoActual()).toBe(2);
      expect(comp.borrador()?.hora_inicio).toBe('00:00');
      expect(comp.errorCampoHorario('eventStartTime')).toBeTruthy();
      expect(el.querySelector('#eventStartTime')?.classList.contains('input-error')).toBe(true);
    });

    it('valida límites de horario (< 06:00, > 22:00), orden cronológico, franjas técnicas faltantes y no solapamiento', async () => {
      const fixture = TestBed.createComponent(AsesorPortalComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
      fixture.detectChanges();

      comp.cargarEvento(EVENTO_PRUEBA);
      comp.irPaso(2);
      fixture.detectChanges();

      // 1. Hora anterior a 06:00 (ej. 05:30) y posterior a 22:00 (ej. 22:30)
      comp.actualizarCampoBorrador('hora_inicio', '05:30');
      comp.actualizarCampoBorrador('hora_fin', '22:30');
      comp.irPaso(3);
      comp.comprobarDisponibilidad();
      fixture.detectChanges();

      expect(comp.comprobacionValidaVigente()).toBe(false);
      expect(comp.estadoPresentacionComprobacion()).toBe('invalido');
      expect(comp.validacionHorariosActual().erroresPorCampo['eventStartTime']).toContain('entre las 06:00 y las 22:00');
      expect(comp.validacionHorariosActual().erroresPorCampo['eventEndTime']).toContain('entre las 06:00 y las 22:00');

      // 2. Inicio igual o posterior al fin
      comp.actualizarCampoBorrador('hora_inicio', '14:00');
      comp.actualizarCampoBorrador('hora_fin', '12:00');
      comp.comprobarDisponibilidad();
      fixture.detectChanges();

      expect(comp.validacionHorariosActual().erroresPorCampo['eventStartTime']).toContain('anterior a la hora de fin');

      // 3. Desmontaje anterior al fin del evento
      comp.actualizarCampoBorrador('hora_inicio', '09:00');
      comp.actualizarCampoBorrador('hora_fin', '13:00');
      comp.actualizarCampoBorrador('montaje_hora_inicio', '08:00');
      comp.actualizarCampoBorrador('montaje_hora_fin', '09:00');
      comp.actualizarCampoBorrador('desmontaje_hora_inicio', '12:00'); // inicia antes de que termine el evento a las 13:00
      comp.actualizarCampoBorrador('desmontaje_hora_fin', '14:00');
      comp.comprobarDisponibilidad();
      fixture.detectChanges();

      expect(comp.validacionHorariosActual().erroresPorCampo['desmontajeStartTime']).toContain('concluir o después de finalizar el evento');

      // 4. Ensayo solapado con montaje
      comp.alternarEnsayo(true);
      comp.actualizarCampoBorrador('ensayo_hora_inicio', '08:30'); // montaje es 08:00 a 09:00
      comp.actualizarCampoBorrador('ensayo_hora_fin', '09:00');
      comp.actualizarCampoBorrador('desmontaje_hora_inicio', '13:00');
      comp.comprobarDisponibilidad();
      fixture.detectChanges();

      expect(comp.validacionHorariosActual().erroresPorCampo['ensayoStartTime']).toContain('no debe solaparse con la franja de montaje');

      // 5. Actividad técnica con campos vacíos u obligatorios
      comp.actualizarCampoBorrador('ensayo_hora_fin', '');
      comp.comprobarDisponibilidad();
      fixture.detectChanges();

      expect(comp.validacionHorariosActual().erroresPorCampo['ensayoEndTime']).toContain('obligatoria');
    });

    it('horarios válidos antes del clic mantienen Paso 4 bloqueado en estado pendiente; tras pulsar Comprobar habilitan Paso 4', async () => {
      const fixture = TestBed.createComponent(AsesorPortalComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;

      comp.cargarEvento(EVENTO_PRUEBA);
      comp.irPaso(2);

      // Franjas contiguas exactas válidas:
      // Ensayo: 07:00–08:00, Montaje: 08:00–09:00, Evento: 09:00–13:00, Desmontaje: 13:00–14:00
      comp.alternarEnsayo(true);
      comp.actualizarCampoBorrador('ensayo_hora_inicio', '07:00');
      comp.actualizarCampoBorrador('ensayo_hora_fin', '08:00');
      comp.actualizarCampoBorrador('montaje_hora_inicio', '08:00');
      comp.actualizarCampoBorrador('montaje_hora_fin', '09:00');
      comp.actualizarCampoBorrador('hora_inicio', '09:00');
      comp.actualizarCampoBorrador('hora_fin', '13:00');
      comp.actualizarCampoBorrador('desmontaje_hora_inicio', '13:00');
      comp.actualizarCampoBorrador('desmontaje_hora_fin', '14:00');
      fixture.detectChanges();

      expect(comp.validacionHorariosActual().esValido).toBe(true);

      // Entrar al Paso 3: AÚN NO se ha pulsado Comprobar
      comp.irPaso(3);
      fixture.detectChanges();

      // Debe estar en "Pendiente de comprobar" (sin cuadro de feedback aún) y con Paso 4 bloqueado
      expect(comp.estadoPresentacionComprobacion()).toBe('pendiente');
      expect(comp.comprobacionValidaVigente()).toBe(false);
      const feedbackAntes = el.querySelector('#s3 #availabilityFeedback');
      expect(feedbackAntes).toBeNull();
      expect((el.querySelector('#btnContinuarPaso4') as HTMLButtonElement).disabled).toBe(true);
      expect((el.querySelector('#stepBtn4') as HTMLButtonElement).disabled).toBe(true);

      // Pulsar Comprobar
      comp.comprobarDisponibilidad();
      fixture.detectChanges();

      // Ahora sí se muestra "Horarios coherentes. Disponibilidad pendiente de comprobar"
      expect(comp.estadoPresentacionComprobacion()).toBe('valido');
      expect(comp.comprobacionValidaVigente()).toBe(true);
      const feedbackDespues = el.querySelector('#s3 #availabilityFeedback');
      expect(feedbackDespues?.classList.contains('aviso-alerta')).toBe(true);
      expect(feedbackDespues?.textContent).toContain('Horarios coherentes. Disponibilidad pendiente de comprobar');
      expect(feedbackDespues?.textContent).not.toContain('Sin conflictos');

      // Habilita avanzar a revisión del borrador
      const btnContinuarPaso4 = el.querySelector('#btnContinuarPaso4') as HTMLButtonElement;
      expect(btnContinuarPaso4.disabled).toBe(false);
      btnContinuarPaso4.click();
      fixture.detectChanges();

      expect(comp.pasoActual()).toBe(4);
      expect(el.querySelector('#s4')).toBeTruthy();

      // Guardado definitivo permanece bloqueado
      const btnGuardar = el.querySelector('#btnGuardarDefinitivo') as HTMLButtonElement;
      expect(btnGuardar).toBeTruthy();
      expect(btnGuardar.disabled).toBe(true);
    });

    it('editar después de comprobar borra el resultado anterior, regresa a pendiente y exige otra comprobación', async () => {
      const fixture = TestBed.createComponent(AsesorPortalComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;

      comp.cargarEvento(EVENTO_PRUEBA);
      comp.irPaso(3);
      comp.comprobarDisponibilidad();
      fixture.detectChanges();
      expect(comp.estadoPresentacionComprobacion()).toBe('valido');
      expect(comp.comprobacionValidaVigente()).toBe(true);

      // Avanzar al Paso 4
      comp.irPaso(4);
      fixture.detectChanges();
      expect(comp.pasoActual()).toBe(4);

      // Al modificar cualquier horario, se descarta el resultado anterior y se revierte al Paso 3
      comp.actualizarCampoBorrador('hora_inicio', '10:00');
      fixture.detectChanges();

      expect(comp.comprobacionValidaVigente()).toBe(false);
      expect(comp.estadoPresentacionComprobacion()).toBe('pendiente');
      expect(comp.pasoActual()).toBe(3);

      // En Paso 3 el estado es neutro sin recuadro de resultados en el DOM
      const feedback = el.querySelector('#s3 #availabilityFeedback');
      expect(feedback).toBeNull();
      expect(el.querySelector('#s3 .aviso-error')).toBeNull();
      expect(el.querySelector('#s3 .aviso-alerta')).toBeNull();

      // El avance a Paso 4 queda bloqueado hasta una nueva comprobación
      const btnContinuar = el.querySelector('#btnContinuarPaso4') as HTMLButtonElement;
      expect(btnContinuar.disabled).toBe(true);

      // Al volver entre pasos sin modificar horario, se preserva el estado pendiente
      comp.irPaso(2);
      fixture.detectChanges();
      comp.irPaso(3);
      fixture.detectChanges();
      expect(comp.estadoPresentacionComprobacion()).toBe('pendiente');

      // Al cambiar de evento o descartar, se reinicia el estado
      comp.ejecutarDescarte();
      fixture.detectChanges();
      expect(comp.pasoActual()).toBe(1);
      expect(comp.estadoPresentacionComprobacion()).toBe('pendiente');
      expect(comp.comprobacionValidaVigente()).toBe(false);
    });

    it('integración: navegación real con botón de Paso 2 (#btnIrValidarPaso3) a Paso 3 con 00:00-13:00 y montaje 08:00-09:00', async () => {
      const fixture = TestBed.createComponent(AsesorPortalComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      httpMock.expectOne('/api/eventos').flush([EVENTO_PRUEBA]);
      httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
      httpMock.expectOne('/api/adicionales').flush(CATALOGO_PRUEBA);
      fixture.detectChanges();
      await fixture.whenStable();

      const el = fixture.nativeElement as HTMLElement;

      // 1. En Paso 1, hacer clic real en el botón Seleccionar de la tabla para entrar al Paso 2
      const btnSeleccionar = el.querySelector('#tablaEventos tr .col-accion button') as HTMLButtonElement;
      expect(btnSeleccionar).toBeTruthy();
      btnSeleccionar.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(comp.pasoActual()).toBe(2);
      expect(el.querySelector('#s2')).toBeTruthy();

      // 2. Establecer en los controles reales del formulario:
      // Evento: 00:00–13:00, Montaje: 08:00–09:00
      const inputHoraInicio = el.querySelector('#eventStartTime') as HTMLInputElement;
      expect(inputHoraInicio).toBeTruthy();
      inputHoraInicio.value = '00:00';
      inputHoraInicio.dispatchEvent(new Event('input'));

      const inputHoraFin = el.querySelector('#eventEndTime') as HTMLInputElement;
      expect(inputHoraFin).toBeTruthy();
      inputHoraFin.value = '13:00';
      inputHoraFin.dispatchEvent(new Event('input'));

      const inputMontajeInicio = el.querySelector('#montajeStartTime') as HTMLInputElement;
      expect(inputMontajeInicio).toBeTruthy();
      inputMontajeInicio.value = '08:00';
      inputMontajeInicio.dispatchEvent(new Event('input'));

      const inputMontajeFin = el.querySelector('#montajeEndTime') as HTMLInputElement;
      expect(inputMontajeFin).toBeTruthy();
      inputMontajeFin.value = '09:00';
      inputMontajeFin.dispatchEvent(new Event('input'));

      fixture.detectChanges();

      expect(comp.borrador()?.hora_inicio).toBe('00:00');
      expect(comp.borrador()?.hora_fin).toBe('13:00');
      expect(comp.borrador()?.montaje_hora_inicio).toBe('08:00');
      expect(comp.borrador()?.montaje_hora_fin).toBe('09:00');

      // 3. Hacer clic en el botón REAL del Paso 2 para entrar al Paso 3
      const btnIrValidar = el.querySelector('#btnIrValidarPaso3') as HTMLButtonElement;
      expect(btnIrValidar).toBeTruthy();
      btnIrValidar.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(comp.pasoActual()).toBe(3);
      expect(el.querySelector('#s3')).toBeTruthy();

      // ANTES del clic en Comprobar:
      // - El recuadro rojo NO existe en el DOM
      // - Ningún recuadro de resultados (#availabilityFeedback) existe en el DOM
      expect(comp.estadoPresentacionComprobacion()).toBe('pendiente');
      expect(el.querySelector('#s3 #availabilityFeedback')).toBeNull();
      expect(el.querySelector('#s3 .aviso-error')).toBeNull();
      expect(el.querySelector('#s3 .aviso-alerta')).toBeNull();
      expect(el.querySelector('.lista-errores-horario')).toBeNull();

      // - El Paso 4 permanece bloqueado tanto en el botón Continuar como en el stepper superior
      const btnContinuarPaso4 = el.querySelector('#btnContinuarPaso4') as HTMLButtonElement;
      expect(btnContinuarPaso4).toBeTruthy();
      expect(btnContinuarPaso4.disabled).toBe(true);

      const stepBtn4 = el.querySelector('#stepBtn4') as HTMLButtonElement;
      expect(stepBtn4).toBeTruthy();
      expect(stepBtn4.disabled).toBe(true);

      // Intentar navegar al Paso 4 mediante irPaso(4) tampoco lo permite ni ejecuta automáticamente la comprobación
      comp.irPaso(4);
      fixture.detectChanges();
      expect(comp.pasoActual()).toBe(3);
      expect(comp.estadoPresentacionComprobacion()).toBe('pendiente');
      expect(el.querySelector('#s3 #availabilityFeedback')).toBeNull();

      // 4. Hacer clic en el botón «Comprobar disponibilidad en auditorio»
      const btnCheck = el.querySelector('#btnCheckAvailability') as HTMLButtonElement;
      expect(btnCheck).toBeTruthy();
      btnCheck.click();
      fixture.detectChanges();

      // DESPUÉS del clic en Comprobar:
      // - Aparece el recuadro rojo con los errores específicos identificados
      expect(comp.estadoPresentacionComprobacion()).toBe('invalido');
      const feedbackError = el.querySelector('#s3 #availabilityFeedback');
      expect(feedbackError).toBeTruthy();
      expect(feedbackError?.classList.contains('aviso-error')).toBe(true);
      expect(feedbackError?.textContent).toContain('Inconsistencias detectadas en los horarios propuestos');
      expect(feedbackError?.textContent).toContain('La hora de inicio del evento debe estar entre las 06:00 y las 22:00');
      expect(feedbackError?.textContent).toContain('El montaje debe finalizar antes o al comenzar el evento');

      // - El Paso 4 PERMANECE bloqueado en ambos controles
      expect(btnContinuarPaso4.disabled).toBe(true);
      expect(stepBtn4.disabled).toBe(true);

      comp.irPaso(4);
      fixture.detectChanges();
      expect(comp.pasoActual()).toBe(3);
    });
  });
});
