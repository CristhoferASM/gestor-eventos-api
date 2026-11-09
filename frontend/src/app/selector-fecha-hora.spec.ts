import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SelectorFechaHoraDirective } from './directives/selector-fecha-hora.directive';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, SelectorFechaHoraDirective],
  template: `
    <input id="fecha" type="text" appSelector="fecha" [formControl]="fecha" />
    <input id="hora" type="text" appSelector="hora" [formControl]="hora" />
  `,
})
class AnfitrionComponent {
  fecha = new FormControl('2026-11-15', { nonNullable: true });
  hora = new FormControl('09:00', { nonNullable: true });
}

/** Flatpickr se descarga bajo demanda: se espera a que ambos campos estén listos. */
async function montar() {
  TestBed.configureTestingModule({ imports: [AnfitrionComponent] });
  const fixture = TestBed.createComponent(AnfitrionComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  for (let i = 0; i < 100; i++) {
    if (el.querySelectorAll('.flatpickr-input').length === 2) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  const fecha = el.querySelector('#fecha') as HTMLInputElement;
  const hora = el.querySelector('#hora') as HTMLInputElement;
  return { fixture, comp: fixture.componentInstance, fecha, hora };
}

function escribir(input: HTMLInputElement, valor: string): void {
  input.value = valor;
  input.dispatchEvent(new Event('input'));
}

describe('SelectorFechaHoraDirective', () => {
  afterEach(() => document.querySelectorAll('.flatpickr-calendar').forEach((n) => n.remove()));

  it('muestra la fecha como dd/mm/aaaa pero el formulario conserva el valor ISO', async () => {
    const { comp, fecha } = await montar();
    expect(fecha.type).toBe('text');
    expect(fecha.classList.contains('flatpickr-input')).toBe(true);
    expect(fecha.value).toBe('15/11/2026');
    expect(comp.fecha.value).toBe('2026-11-15');

    escribir(fecha, '20/11/2026');
    expect(comp.fecha.value).toBe('2026-11-20');
  });

  it('actualiza lo visible cuando el formulario cambia el valor por código', async () => {
    const { comp, fecha, hora } = await montar();
    comp.fecha.setValue('2026-12-01');
    comp.hora.setValue('14:30');
    expect(fecha.value).toBe('01/12/2026');
    expect(hora.value).toBe('14:30');

    comp.fecha.setValue('');
    expect(fecha.value).toBe('');
    expect(comp.fecha.value).toBe('');
  });

  it('un texto inválido llega al formulario tal cual para que lo juzgue el validador', async () => {
    const { comp, fecha, hora } = await montar();
    escribir(fecha, '31/02/2026'); // día inexistente
    expect(comp.fecha.value).toBe('31/02/2026');
    escribir(fecha, 'abc');
    expect(comp.fecha.value).toBe('abc');
    escribir(hora, '25:99');
    expect(comp.hora.value).toBe('25:99');
  });

  it('una hora fuera de 06:00–22:00 no se corrige en silencio al salir del campo', async () => {
    const { comp, hora } = await montar();
    hora.focus();
    escribir(hora, '23:30');
    hora.dispatchEvent(new Event('blur'));
    expect(hora.value).toBe('23:30');
    expect(comp.hora.value).toBe('23:30');

    escribir(hora, '5:7');
    hora.dispatchEvent(new Event('blur'));
    expect(hora.value).toBe('5:7');
    expect(comp.hora.value).toBe('5:7');
  });

  it('el panel de hora incluye «Hora», «Minutos» y el botón «Listo»', async () => {
    const { hora } = await montar();
    hora.click();
    hora.focus();
    await new Promise((r) => setTimeout(r, 50));
    const panel = document.querySelector('.flatpickr-calendar.open, .flatpickr-calendar.noCalendar');
    expect(panel?.textContent).toContain('Hora');
    expect(panel?.textContent).toContain('Minutos');
    expect(panel?.querySelector('.btn-fp-listo')?.textContent).toBe('Listo');
  });

  it('el calendario está en español y la semana empieza en lunes', async () => {
    const { fecha } = await montar();
    fecha.click();
    fecha.focus();
    await new Promise((r) => setTimeout(r, 50));
    const calendarios = Array.from(document.querySelectorAll('.flatpickr-calendar:not(.noCalendar)'));
    const texto = calendarios.map((c) => c.textContent).join(' ');
    expect(texto).toContain('Lun');
    expect(texto).toContain('Noviembre');
    const primerDia = calendarios[0]?.querySelector('.flatpickr-weekday')?.textContent?.trim();
    expect(primerDia).toBe('Lun');
  });

  it('respeta el estado deshabilitado del formulario', async () => {
    const { comp, fecha } = await montar();
    comp.fecha.disable();
    expect(fecha.disabled).toBe(true);
    comp.fecha.enable();
    expect(fecha.disabled).toBe(false);
  });
});
