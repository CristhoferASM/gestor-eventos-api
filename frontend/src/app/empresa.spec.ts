import { TestBed } from '@angular/core/testing';
import { EventosListaComponent } from './components/eventos-lista/eventos-lista.component';
import {
  Evento,
  Solicitud,
  eventoAdmiteModificacion,
  formatearCodigoSolicitud,
  formatearEstadoEvento,
} from './models/gestor-eventos.models';

// Con la base de datos de la empresa los eventos traen sus estados (CON_ADELANTO, COTIZADO...) y las solicitudes su
// código real (SOLM-AAAA-NNNN).

const BASE: Evento = {
  id: 3,
  codigo: 'EV-0003',
  cliente_id: 'CLI-0002',
  nombre: 'Concierto Juvenil',
  espacio: 'Auditorio Showtech',
  fecha: '2026-12-06',
  hora_inicio: '18:00',
  hora_fin: '22:00',
  estado: 'CON_ADELANTO',
  contacto: 'Pedro Ejemplo',
  telefono: '900000002',
  correo: 'persona@ejemplo.pe',
  observaciones: '',
  adicionales: [],
};

describe('Modelos para la base de datos de la empresa', () => {
  it('formatearCodigoSolicitud usa el código real y, si no existe, calcula SOL-AAAA-NNN', () => {
    expect(formatearCodigoSolicitud({ id: 37, codigo: 'SOLM-2026-0003', fecha_creacion: '2026-11-11T14:02:29-05:00' })).toBe('SOLM-2026-0003');
    expect(formatearCodigoSolicitud({ id: 7, codigo: '  ', fecha_creacion: '2026-11-11T14:02:29-05:00' })).toBe('SOL-2026-007');
    expect(formatearCodigoSolicitud({ id: 7, fecha_creacion: '2026-11-11T14:02:29-05:00' })).toBe('SOL-2026-007');
  });

  it('formatearEstadoEvento traduce los estados de la base y deja pasar los demás', () => {
    expect(formatearEstadoEvento('CON_ADELANTO')).toBe('Con adelanto');
    expect(formatearEstadoEvento('EN_PROCESO_CANCELACION')).toBe('En proceso de cancelación');
    expect(formatearEstadoEvento('CON_SOLICITUD_COTIZACION')).toBe('Con solicitud de cotización');
    expect(formatearEstadoEvento('Confirmado')).toBe('Confirmado'); // datos de demostración en memoria
    expect(formatearEstadoEvento(undefined)).toBe('');
  });

  it('eventoAdmiteModificacion solo admite los eventos contratados (y los de demostración)', () => {
    for (const estado of ['RESERVADO', 'CON_ADELANTO', 'PAGADO', 'Confirmado', '']) {
      expect(eventoAdmiteModificacion({ estado })).toBe(true);
    }
    for (const estado of ['CON_SOLICITUD_COTIZACION', 'COTIZADO', 'CANCELADO', 'EN_PROCESO_CANCELACION', 'REALIZADO']) {
      expect(eventoAdmiteModificacion({ estado })).toBe(false);
    }
  });
});

describe('Lista de eventos con estados de la base de datos de la empresa', () => {
  function montar(eventos: Evento[], solicitudes: Solicitud[] = []) {
    const fixture = TestBed.createComponent(EventosListaComponent);
    fixture.componentInstance.eventos = eventos;
    fixture.componentInstance.solicitudes = solicitudes;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const tarjeta = (el: HTMLElement, id: number) => el.querySelector(`[data-evento-id="${id}"]`) as HTMLElement;

  it('muestra el estado legible y permite solicitar la modificación de un evento con adelanto', () => {
    const el = montar([BASE]);
    expect(tarjeta(el, 3).querySelector('.insignia-estado')?.textContent?.trim()).toBe('Con adelanto');
    const boton = tarjeta(el, 3).querySelector('.btn-solicitar') as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
  });

  it('deshabilita «Solicitar modificación» en los eventos no contratados y explica por qué', () => {
    const el = montar([
      { ...BASE, id: 6, estado: 'COTIZADO' },
      { ...BASE, id: 8, estado: 'CANCELADO' },
      { ...BASE, id: 1, estado: 'REALIZADO' },
    ]);
    for (const id of [6, 8, 1]) {
      const boton = tarjeta(el, id).querySelector('.btn-solicitar') as HTMLButtonElement;
      expect(boton.disabled, `evento ${id}`).toBe(true);
      expect(boton.getAttribute('title')).toContain('eventos contratados');
    }
    expect(tarjeta(el, 6).querySelector('.insignia-estado')?.textContent?.trim()).toBe('Cotizado');
  });

  it('muestra el código real de la solicitud pendiente', () => {
    const pendiente = {
      id: 37, codigo: 'SOLM-2026-0003', evento_id: 3, motivo: 'Cambio', estado: 'Pendiente de revisión',
      fecha_creacion: '2026-11-11T14:02:29-05:00',
    } as Solicitud;
    const el = montar([BASE], [pendiente]);
    expect(tarjeta(el, 3).textContent).toContain('SOLM-2026-0003');
  });
});
