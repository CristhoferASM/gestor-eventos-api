import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ESTADO_PENDIENTE_REVISION,
  Evento,
  Solicitud,
  SolicitudCreacionPayload,
} from './models/gestor-eventos.models';
import { EventosApiService } from './services/eventos-api.service';
import { EventosListaComponent } from './components/eventos-lista/eventos-lista.component';
import { SolicitudFormularioComponent } from './components/solicitud-formulario/solicitud-formulario.component';
import { SolicitudesListaComponent } from './components/solicitudes-lista/solicitudes-lista.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    EventosListaComponent,
    SolicitudFormularioComponent,
    SolicitudesListaComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly api = inject(EventosApiService);

  readonly eventos = signal<Evento[]>([]);
  readonly solicitudes = signal<Solicitud[]>([]);
  readonly eventoSeleccionado = signal<Evento | null>(null);

  readonly cargandoEventos = signal<boolean>(false);
  readonly errorEventos = signal<string>('');

  readonly cargandoSolicitudes = signal<boolean>(false);
  readonly errorSolicitudes = signal<string>('');

  readonly enviandoSolicitud = signal<boolean>(false);
  readonly mensajeExito = signal<string>('');
  readonly avisoRefrescoPosterior = signal<string>('');
  readonly errorEnvio = signal<string>('');

  readonly eventosConPendienteIds = computed<ReadonlySet<number>>(() => {
    const ids = new Set<number>();
    for (const sol of this.solicitudes()) {
      if (sol.estado === ESTADO_PENDIENTE_REVISION) {
        ids.add(sol.evento_id);
      }
    }
    return ids;
  });

  readonly eventoSeleccionadoTienePendiente = computed<boolean>(() => {
    const ev = this.eventoSeleccionado();
    if (!ev) {
      return false;
    }
    return this.eventosConPendienteIds().has(ev.id);
  });

  ngOnInit(): void {
    this.cargarDatosIniciales();
  }

  cargarDatosIniciales(): void {
    this.cargarEventos();
    this.cargarSolicitudes();
  }

  cargarEventos(): void {
    this.cargandoEventos.set(true);
    this.errorEventos.set('');

    this.api.obtenerEventos().subscribe({
      next: (lista) => {
        const eventosSeguros = Array.isArray(lista) ? lista : [];
        this.eventos.set(eventosSeguros);
        this.cargandoEventos.set(false);

        const actual = this.eventoSeleccionado();
        if (actual) {
          const actualizado = eventosSeguros.find((e) => e.id === actual.id) ?? null;
          this.eventoSeleccionado.set(actualizado);
        } else if (eventosSeguros.length > 0) {
          this.eventoSeleccionado.set(eventosSeguros[0]);
        }
      },
      error: (err: unknown) => {
        this.cargandoEventos.set(false);
        this.errorEventos.set(this.api.obtenerMensajeError(err, 'carga'));
      },
    });
  }

  cargarSolicitudes(): void {
    this.cargandoSolicitudes.set(true);
    this.errorSolicitudes.set('');
    this.avisoRefrescoPosterior.set('');

    this.api.obtenerSolicitudes().subscribe({
      next: (lista) => {
        this.solicitudes.set(Array.isArray(lista) ? lista : []);
        this.cargandoSolicitudes.set(false);
      },
      error: (err: unknown) => {
        this.cargandoSolicitudes.set(false);
        this.errorSolicitudes.set(this.api.obtenerMensajeError(err, 'carga'));
      },
    });
  }

  alSeleccionarEvento(evento: Evento): void {
    this.mensajeExito.set('');
    this.avisoRefrescoPosterior.set('');
    this.errorEnvio.set('');
    this.eventoSeleccionado.set(evento);
  }

  alEnviarSolicitud(payload: SolicitudCreacionPayload): void {
    if (this.enviandoSolicitud()) {
      return;
    }

    this.enviandoSolicitud.set(true);
    this.mensajeExito.set('');
    this.avisoRefrescoPosterior.set('');
    this.errorEnvio.set('');

    this.api.crearSolicitud(payload).subscribe({
      next: (respuesta) => {
        this.enviandoSolicitud.set(false);
        this.mensajeExito.set(
          respuesta.mensaje || 'Solicitud registrada exitosamente.'
        );

        if (respuesta.solicitud) {
          this.solicitudes.update((actuales) => {
            const yaExiste = actuales.some((s) => s.id === respuesta.solicitud.id);
            return yaExiste ? actuales : [...actuales, respuesta.solicitud];
          });
        }

        this.refrescarSolicitudesTrasRegistro(respuesta.solicitud);
      },
      error: (err: unknown) => {
        this.enviandoSolicitud.set(false);
        this.errorEnvio.set(this.api.obtenerMensajeError(err, 'envio'));

        if (err instanceof HttpErrorResponse && err.status === 409) {
          this.cargarSolicitudes();
        }
      },
    });
  }

  private refrescarSolicitudesTrasRegistro(solicitudRecienCreada?: Solicitud): void {
    this.api.obtenerSolicitudes().subscribe({
      next: (lista) => {
        this.solicitudes.set(Array.isArray(lista) ? lista : []);
        this.errorSolicitudes.set('');
        this.avisoRefrescoPosterior.set('');
      },
      error: () => {
        if (solicitudRecienCreada) {
          this.solicitudes.update((actuales) => {
            const yaExiste = actuales.some((s) => s.id === solicitudRecienCreada.id);
            return yaExiste ? actuales : [...actuales, solicitudRecienCreada];
          });
        }
        this.avisoRefrescoPosterior.set(
          'Tu solicitud quedó registrada en el servidor, pero falló la actualización automática del listado. Puedes pulsar "Recargar listado" sin volver a enviar el formulario.'
        );
      },
    });
  }
}
