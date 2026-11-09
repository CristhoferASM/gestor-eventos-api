import { Component, OnInit, inject, signal } from '@angular/core';
import { ClienteConEventos, Usuario } from '../../models/gestor-eventos.models';
import { EventosApiService } from '../../services/eventos-api.service';

/**
 * Panel del asesor para asociar las cuentas de Google (que entran sin eventos) con un cliente existente.
 * Hasta que el asesor lo hace, la cuenta ve «No tienes eventos vinculados a esta cuenta».
 */
@Component({
  selector: 'app-vinculo-cuentas',
  standalone: true,
  template: `
    <section class="tarjeta panel-vinculo" aria-labelledby="titulo-vinculo">
      <div class="panel-vinculo__cabecera">
        <div>
          <h2 id="titulo-vinculo">Cuentas de Google pendientes de vincular</h2>
          <p class="ayuda">
            Estas personas ya iniciaron sesión con Google, pero todavía no ven ningún evento. Asócialas con el cliente
            que corresponda para que puedan consultar y solicitar cambios.
          </p>
        </div>
        <button type="button" class="btn btn-sec btn-chico" (click)="cargar()" [disabled]="cargando()">Actualizar</button>
      </div>

      @if (error()) {
        <div class="aviso aviso-error" role="alert">{{ error() }}</div>
      }

      @if (cargando()) {
        <p class="ayuda" role="status">Consultando cuentas...</p>
      } @else if (cuentas().length === 0) {
        @if (!error()) {
          <p class="ayuda" role="status">No hay cuentas de Google pendientes de vincular.</p>
        }
      } @else {
        <ul class="lista-vinculo">
          @for (cuenta of cuentas(); track cuenta.correo) {
            <li class="fila-vinculo">
              <div class="fila-vinculo__datos">
                <strong>{{ cuenta.nombre }}</strong>
                <span class="ayuda">{{ cuenta.correo }}</span>
              </div>
              <select
                class="fila-vinculo__select"
                [attr.aria-label]="'Cliente para ' + cuenta.correo"
                (change)="elegir(cuenta.correo, $any($event.target).value)"
              >
                <option value="">Elige un cliente…</option>
                @for (cliente of clientes(); track cliente.cliente_id) {
                  <option [value]="cliente.cliente_id">{{ cliente.cliente_id }} — {{ cliente.eventos.join(', ') }}</option>
                }
              </select>
              <button
                type="button"
                class="btn btn-primario btn-chico"
                [disabled]="!seleccion()[cuenta.correo] || vinculando() === cuenta.correo"
                (click)="vincular(cuenta)"
              >
                {{ vinculando() === cuenta.correo ? 'Vinculando...' : 'Vincular' }}
              </button>
            </li>
          }
        </ul>
      }

      @if (mensaje()) {
        <div class="aviso aviso-ok" role="status">{{ mensaje() }}</div>
      }
    </section>
  `,
  styles: [
    `
      .panel-vinculo {
        margin-bottom: 16px;
      }
      .panel-vinculo__cabecera {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .lista-vinculo {
        list-style: none;
        margin: 12px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .fila-vinculo {
        display: grid;
        grid-template-columns: minmax(180px, 1fr) minmax(220px, 1.4fr) auto;
        gap: 10px;
        align-items: center;
        padding: 10px 12px;
        border: 1px solid var(--borde);
        border-radius: 8px;
        background: var(--fondo);
      }
      .fila-vinculo__datos {
        display: flex;
        flex-direction: column;
      }
      .fila-vinculo__select {
        height: 38px;
        border: 1px solid var(--borde);
        border-radius: 6px;
        padding: 0 8px;
        font-family: inherit;
        font-size: 14px;
        background: var(--blanco);
      }
      .aviso-ok {
        margin-top: 12px;
        background: #e6f7ef;
        border: 1px solid #a3e0c0;
        color: var(--ok);
        padding: 10px 12px;
        border-radius: 6px;
      }
      @media (max-width: 700px) {
        .fila-vinculo {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class VinculoCuentasComponent implements OnInit {
  private readonly api = inject(EventosApiService);

  readonly cuentas = signal<Usuario[]>([]);
  readonly clientes = signal<ClienteConEventos[]>([]);
  readonly seleccion = signal<Record<string, string>>({});
  readonly cargando = signal(false);
  readonly vinculando = signal('');
  readonly error = signal('');
  readonly mensaje = signal('');

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set('');
    this.api.obtenerClientes().subscribe({
      next: (clientes) => {
        this.clientes.set(clientes);
        this.api.obtenerCuentasPendientes().subscribe({
          next: (cuentas) => {
            this.cuentas.set(cuentas);
            this.cargando.set(false);
          },
          error: (err: unknown) => this.fallar(err),
        });
      },
      error: (err: unknown) => this.fallar(err),
    });
  }

  elegir(correo: string, clienteId: string): void {
    this.seleccion.update((s) => ({ ...s, [correo]: clienteId }));
  }

  vincular(cuenta: Usuario): void {
    const clienteId = this.seleccion()[cuenta.correo];
    if (!clienteId || this.vinculando()) {
      return;
    }
    this.vinculando.set(cuenta.correo);
    this.mensaje.set('');
    this.error.set('');
    this.api.vincularCuenta(cuenta.correo, clienteId).subscribe({
      next: () => {
        this.vinculando.set('');
        this.cuentas.update((lista) => lista.filter((c) => c.correo !== cuenta.correo));
        this.mensaje.set(`Cuenta ${cuenta.correo} vinculada con ${clienteId}. Ya puede ver sus eventos.`);
      },
      error: (err: unknown) => {
        this.vinculando.set('');
        this.error.set(this.api.obtenerMensajeError(err, 'envio'));
      },
    });
  }

  private fallar(err: unknown): void {
    this.cargando.set(false);
    this.error.set(this.api.obtenerMensajeError(err, 'carga'));
  }
}
