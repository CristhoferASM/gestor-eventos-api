import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { SolicitudFormularioComponent } from './components/solicitud-formulario/solicitud-formulario.component';
import { Evento, Solicitud } from './models/gestor-eventos.models';

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

describe('Portal del Cliente en 4 pasos (App y SolicitudFormularioComponent)', () => {
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

  it('debe iniciar en el paso 1 con cabecera SHOWTECH SOLUTIONS, ID numérico real, insignia Confirmado y estado vacío de solicitudes', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

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
    expect(compiled.textContent).toContain('#1');
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

    httpMock.expectOne('/api/eventos').flush([eventoModificadoEnLista]);
    httpMock.expectOne('/api/solicitudes').flush([SOLICITUD_PRUEBA]);
    fixture.detectChanges();

    app.abrirModalDetalle(SOLICITUD_PRUEBA);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const dialog = compiled.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.textContent).toContain('Solicitud #1');
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
});
