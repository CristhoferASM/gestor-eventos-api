import { AfterViewInit, Directive, ElementRef, Input, OnDestroy, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import type { Instance } from 'flatpickr/dist/types/instance';
import type { CustomLocale } from 'flatpickr/dist/types/locale';

const FORMATO_ISO = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_VISIBLE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const HORA_MIN = 6 * 60;
const HORA_MAX = 22 * 60;

/** Idioma español de Flatpickr (igual que el es.js del prototipo; lunes como primer día de la semana). */
const ESPANOL: CustomLocale = {
  weekdays: {
    shorthand: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    longhand: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  },
  months: {
    shorthand: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    longhand: [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ],
  },
  ordinal: () => 'º',
  firstDayOfWeek: 1,
  rangeSeparator: ' a ',
  time_24hr: true,
};

/**
 * Selector de fecha y de hora con Flatpickr, como el prototipo (cliente.js, sección 6).
 *
 * - `appSelector="fecha"`: se muestra «dd/mm/aaaa», calendario en español con lunes como primer día.
 *   El valor del formulario sigue siendo ISO «YYYY-MM-DD».
 * - `appSelector="hora"`: formato 24 h «HH:mm», paso de 1 minuto, panel con «Hora» / «Minutos» y botón «Listo».
 *   Una hora escrita fuera de 06:00–22:00 o con mal formato NO se corrige en silencio: se deja tal cual
 *   para que el validador del formulario la marque.
 *
 * Funciona con formularios reactivos (formControlName) y de plantilla (ngModel). Al ser un `input type="text"`
 * reemplaza al control nativo, que traía su propio ícono y duplicaba el de la interfaz.
 */
@Directive({
  selector: 'input[appSelector]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectorFechaHoraDirective),
      multi: true,
    },
  ],
  host: {
    autocomplete: 'off',
    '(input)': 'alEscribir()',
    '(change)': 'alEscribir()',
    '(blur)': 'onTouched()',
  },
})
export class SelectorFechaHoraDirective implements ControlValueAccessor, AfterViewInit, OnDestroy {
  @Input('appSelector') tipo: 'fecha' | 'hora' = 'fecha';

  private readonly entrada = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private fp?: Instance;
  private destruida = false;
  private valorPendiente: string | null = null;
  private alCambiar: (valor: string) => void = () => undefined;
  onTouched: () => void = () => undefined;

  private readonly alPerderFocoEnCaptura = (evento: Event): void => {
    // Igual que el prototipo: si la hora escrita es inválida o está fuera de rango, Flatpickr no debe corregirla
    const texto = this.entrada.value.trim();
    if (texto && !this.horaValidaEnRango(texto)) {
      evento.stopImmediatePropagation();
    }
  };

  ngAfterViewInit(): void {
    void this.iniciar();
  }

  /** Descarga Flatpickr la primera vez que se muestra un selector (no pesa en la carga inicial). */
  private async iniciar(): Promise<void> {
    const { default: flatpickr } = await import('flatpickr');
    if (this.destruida) {
      return;
    }

    this.fp =
      this.tipo === 'hora'
        ? (flatpickr(this.entrada, {
            enableTime: true,
            noCalendar: true,
            dateFormat: 'H:i',
            time_24hr: true,
            minuteIncrement: 1,
            minTime: '06:00',
            maxTime: '22:00',
            disableMobile: true,
            allowInput: true,
            onReady: (_f, _s, instancia) => this.personalizarPanelHora(instancia),
            onOpen: (_f, _s, instancia) => this.personalizarPanelHora(instancia),
            onClose: () => this.onTouched(),
          }) as Instance)
        : (flatpickr(this.entrada, {
            locale: ESPANOL,
            dateFormat: 'd/m/Y',
            allowInput: true,
            disableMobile: true,
            animate: false,
            position: 'auto',
            onClose: () => this.onTouched(),
          }) as Instance);

    if (this.tipo === 'hora') {
      this.entrada.addEventListener('blur', this.alPerderFocoEnCaptura, true);
    }

    if (this.valorPendiente !== null) {
      this.aplicarValor(this.valorPendiente);
    }
  }

  ngOnDestroy(): void {
    this.destruida = true;
    this.entrada.removeEventListener('blur', this.alPerderFocoEnCaptura, true);
    this.fp?.destroy();
  }

  // --- ControlValueAccessor ---

  writeValue(valor: string | null | undefined): void {
    const texto = valor ?? '';
    if (this.fp) {
      this.aplicarValor(texto);
    } else {
      // El formulario escribe el valor antes de que exista Flatpickr: se muestra ya y se aplica al iniciar
      this.valorPendiente = texto;
      this.entrada.value = this.tipo === 'fecha' ? this.aVisible(texto) : texto;
    }
  }

  registerOnChange(fn: (valor: string) => void): void {
    this.alCambiar = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(deshabilitado: boolean): void {
    this.entrada.disabled = deshabilitado;
  }

  // --- Interno ---

  /** Se ejecuta en cada «input»/«change», también los que dispara Flatpickr al elegir un valor. */
  alEscribir(): void {
    this.alCambiar(this.deVisible(this.entrada.value.trim()));
  }

  private aplicarValor(texto: string): void {
    if (!this.fp) {
      return;
    }
    if (this.tipo === 'fecha') {
      if (FORMATO_ISO.test(texto)) {
        this.fp.setDate(texto, false, 'Y-m-d');
      } else {
        this.fp.clear(false);
        this.entrada.value = texto;
      }
    } else if (FORMATO_HORA.test(texto)) {
      this.fp.setDate(texto, false, 'H:i');
    } else {
      this.fp.clear(false);
      this.entrada.value = texto;
    }
  }

  /** ISO → «dd/mm/aaaa» (si no es una fecha ISO, se devuelve tal cual). */
  private aVisible(texto: string): string {
    return FORMATO_ISO.test(texto) ? `${texto.slice(8, 10)}/${texto.slice(5, 7)}/${texto.slice(0, 4)}` : texto;
  }

  /** «dd/mm/aaaa» → ISO. ISO y cualquier otro texto pasan sin cambios, para que el validador los juzgue. */
  private deVisible(texto: string): string {
    if (this.tipo !== 'fecha') {
      return texto;
    }
    const m = FORMATO_VISIBLE.exec(texto);
    if (!m) {
      return texto;
    }
    const [, dia, mes, anio] = m;
    const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia));
    const coincide =
      fecha.getFullYear() === Number(anio) && fecha.getMonth() === Number(mes) - 1 && fecha.getDate() === Number(dia);
    return coincide ? `${anio}-${mes}-${dia}` : texto;
  }

  private horaValidaEnRango(texto: string): boolean {
    if (!FORMATO_HORA.test(texto)) {
      return false;
    }
    const [h, m] = texto.split(':').map(Number);
    const minutos = h * 60 + m;
    return minutos >= HORA_MIN && minutos <= HORA_MAX;
  }

  /** Agrega al panel las cabeceras «Hora» / «Minutos» y el botón «Listo» (estilos del prototipo). */
  private personalizarPanelHora(instancia: Instance): void {
    const panel = instancia.calendarContainer;
    const bloqueHora = panel.querySelector('.flatpickr-time');
    if (bloqueHora && !panel.querySelector('.flatpickr-time-header')) {
      const cabecera = document.createElement('div');
      cabecera.className = 'flatpickr-time-header';
      cabecera.innerHTML =
        '<span class="fp-col-title">Hora</span><span class="fp-col-sep"></span><span class="fp-col-title">Minutos</span>';
      bloqueHora.parentNode?.insertBefore(cabecera, bloqueHora);
    }
    if (!panel.querySelector('.flatpickr-time-footer')) {
      const pie = document.createElement('div');
      pie.className = 'flatpickr-time-footer';
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'btn-fp-listo';
      boton.textContent = 'Listo';
      boton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        instancia.close();
      });
      pie.appendChild(boton);
      panel.appendChild(pie);
    }
  }
}
