# CLAUDE.md

Este archivo proporciona orientación a Claude Code (claude.ai/code) al trabajar con el código de este repositorio.

Responde siempre en español (conversación, comentarios de código, mensajes de commit y documentación).

## Descripción general

Gestor de eventos de SHOWTECH SOLUTIONS, desarrollado durante unas prácticas junto con un ingeniero y otros compañeros. El módulo de este repositorio permite que el cliente solicite modificaciones de un evento contratado. Consta de un backend en Go (Gin) en la raíz del repositorio y un frontend Angular standalone en `frontend/` (TypeScript, SCSS, formularios reactivos, Signals y `HttpClient`). La documentación y los textos de la interfaz están en español; mantén identificadores, mensajes de error y comentarios coherentes con ello. `README.md` contiene el contrato completo de los endpoints y ejemplos con `Invoke-RestMethod` de PowerShell.

Repositorios: este proyecto es `CristhoferASM/gestor-eventos-api`; el prototipo original en HTML/CSS/JavaScript es `CristhoferASM/gestor-eventos` y es la **referencia de diseño y comportamiento**.

## Comandos

Backend (raíz del repositorio; módulo Go `gestor-eventos-api`):
- Ejecutar: `go run main.go` (escucha solo en `127.0.0.1:8081`). En Windows PowerShell, si `go` no está en el PATH: `& "C:\Program Files\Go\bin\go.exe" run .`
- Todas las pruebas: `go test ./...`
- Una sola prueba: `go test ./services -run NombrePrueba` (o `./handlers`)
- PostgreSQL (opcional): contenedor de desarrollo `docker run -d --name showtech-postgres -e POSTGRES_USER=showtech -e POSTGRES_PASSWORD=showtech_dev -e POSTGRES_DB=gestor_eventos -p 127.0.0.1:5433:5432 -v showtech_pgdata:/var/lib/postgresql/data postgres:16-alpine`. Arrancar con datos persistentes: PowerShell `$env:DATABASE_URL="postgres://showtech:showtech_dev@127.0.0.1:5433/gestor_eventos?sslmode=disable"; go run .`. Pruebas de integración: definir `TEST_DATABASE_URL` con esa misma URL (cada prueba usa un esquema propio y lo borra; sin la variable se omiten). E2E sobre PostgreSQL: crear un esquema vacío y pasar `E2E_DATABASE_URL` con `&search_path=<esquema>`.
- Variables de entorno opcionales: `DATABASE_URL` (si existe, se usa PostgreSQL en vez de memoria), `CARGAR_DEMO=false` (no sembrar datos demo en PostgreSQL), `API_ADDR` (dirección, por defecto `127.0.0.1:8081`; la usan las pruebas E2E), `CORS_ORIGINS` (orígenes del navegador permitidos separados por comas; por defecto solo `http://localhost:4200` y `http://127.0.0.1:4200`), `COOKIE_SECURE=true` (cookie de sesión solo por HTTPS; obligatorio en producción), `MODO_DEMO=false` (el código de verificación deja de viajar en `codigo_prueba` y solo se imprime en el registro del servidor, que es el único «envío» que existe hoy), `FIREBASE_PROJECT_ID`.

Frontend (`frontend/`, inicia primero el backend):
- Servidor de desarrollo: `npm start` (http://localhost:4200, redirige `/api` → `http://127.0.0.1:8081` mediante `proxy.conf.json`, que además elimina el prefijo `/api` antes de reenviar)
- Compilar: `npm run build`
- Pruebas: `npx ng test --watch=false`
- Extremo a extremo: `npm run e2e` (Playwright con el Chrome instalado; arranca por sí solo un backend en `:8082` y el frontend en `:4300` con `proxy.e2e.conf.json`, sin tocar los servidores de desarrollo). Incluye auditoría de accesibilidad (axe-core, WCAG 2.1 A/AA) y revisión de desbordes en móvil. El workflow `.github/workflows/ci.yml` corre todo en cada push y en cada pull request (ya se ejecutó en GitHub con éxito); además comprueba que `storage/db` esté al día con `sqlc generate`.

## Arquitectura

Backend en capas con dependencias hacia adentro; el ensamblaje ocurre únicamente en `main.go`:

`handlers` → `services` → `repositories` (interfaces) ← `storage` (implementación); `models` es compartido por todas las capas.

- `handlers` (Gin): transporte HTTP y traducción de errores a códigos de estado (200/201/400/404/409/500). Recibe solo servicios (`SetupRouter(eventoService, solicitudService, authService)`); no debe importar `storage` ni contener reglas de negocio. Los errores internos devuelven un mensaje genérico (500), nunca el detalle.
- `services`: reglas de negocio y validaciones (ver sección Validaciones). Sin importar Gin ni usar códigos HTTP. Los errores de dominio están en `services/errors.go`; `SolicitudService` recibe un `ClockFunc` inyectable para que `fecha_creacion` sea determinista en las pruebas.
- `repositories`: interfaces pequeñas con `context.Context` y errores identificables (`ErrEventoNoEncontrado`, `ErrSolicitudPendienteDuplicada`).
- `storage/memory.go`: implementación en memoria protegida con `sync.RWMutex` y datos de prueba; garantiza de forma atómica una sola solicitud pendiente por evento. **Los datos se pierden al reiniciar el backend** (es lo que se usa si no hay `DATABASE_URL`).
- `storage/postgres.go` + `storage/migraciones/*.sql`: la misma interfaz sobre PostgreSQL con `pgx` (**sqlc + pgx, sin ORM, decidido con el ingeniero**: las consultas están en `storage/queries/*.sql`, `sqlc.yaml` en la raíz las compila a código tipado en `storage/db/` (generado, no editar a mano; tras cambiar un `.sql` o una migración ejecutar `sqlc generate`, instalable con `go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest`). Todo queda aislado detrás de las interfaces de `repositories`; el SQL de migraciones (`migrar`) queda fuera de sqlc). Migraciones numeradas que se aplican solas al arrancar (tabla `schema_migrations`). Eventos, solicitudes y bloqueos guardan el documento en JSONB más las columnas que se consultan; las reglas las impone la base: un índice único parcial garantiza una sola solicitud pendiente por evento y el retiro es un `UPDATE` condicional atómico. Tokens de sesión, ids de desafío y ids de navegador se guardan como hash SHA-256. `SembrarDemo` carga eventos/cuentas/clientes demo solo si faltan (nunca pisa datos existentes). **Clientes:** tabla `clientes` (`id`, `razon_social`; migración 002, sin clave foránea a propósito) y `repositories.ClienteRepository`; `EventoService.ConClientes` completa `Evento.ClienteNombre` (`cliente_nombre`, no se guarda con el evento) y `UsuarioService.ConClientes` añade `razon_social` a `GET /clientes`. Si el cliente no está registrado, la interfaz muestra «No disponible» (nunca el contacto del evento). Solo se guarda código y razón social: **los demás datos del cliente (RUC, contacto principal...) están por confirmar con el ingeniero**; `CLI-002` y su nombre son inventados para la demo. El formato y la zona horaria de `fecha_creacion` (RFC 3339) se conservan tal cual.

Rutas actuales (`handlers/routes.go`): `GET /health`, `GET /eventos`, `GET /eventos/:id`, `GET /adicionales` (catálogo simulado), `GET /solicitudes`, `POST /solicitudes`, `POST /disponibilidad` (consulta previa, ver abajo), `POST /solicitudes/:id/retirar`. El CORS es un middleware simple que solo permite GET, POST y OPTIONS.

Retiro de solicitud (`POST /solicitudes/:id/retirar`): solo el rol **cliente** dueño del evento (el asesor recibe 403; una solicitud ajena responde 404 como si no existiera) y solo si sigue «Pendiente de revisión» (si no, 409). Pasa a «Retirada por el cliente» con `fecha_retiro` (RFC 3339); la solicitud **no se elimina** (se conservan código, motivo y snapshots), no toca la reserva y libera el evento para una nueva solicitud pendiente. El cambio es atómico en `Store.RetirarSolicitud`. Sin cargos ni penalidades: es una propuesta del prototipo **pendiente de validación del ingeniero**. En la interfaz, el botón está en el modal de detalle con diálogo de confirmación.

Autenticación: acceso en dos pasos como el prototipo (`acceso.js`). La sesión viaja en la cookie **HttpOnly + SameSite=Strict** `showtech_sesion` (JavaScript no puede leerla); la API también acepta `Authorization: Bearer` para PowerShell y pruebas. El correo se bloquea 15 min tras 5 contraseñas erróneas (se cuenta también para correos inexistentes). **Atajo diario del asesor** (como el prototipo, pero en el servidor): tras verificar el código, ese navegador (cookie HttpOnly `showtech_dispositivo`, 30 días) no vuelve a pedirlo el mismo día de Lima (UTC-5); la contraseña se exige siempre y el cliente no tiene atajo (`RespuestaDesafio.sesion`/`recordatorio_diario`). `POST /auth/login` (correo y contraseña → `desafio_id`), `POST /auth/verificar` (código de 6 dígitos → token Bearer de 8 h), `POST /auth/reenviar-codigo` (espera 30 s, el código vence a los 60 s, máx. 5 intentos), `POST /auth/google` (ID token de Firebase → sesión directa), `GET /auth/me` y `POST /auth/logout` (protegidos con el middleware `RequiereSesion`). La verificación por correo es **simulada**: el código viaja en `codigo_prueba` de la respuesta y debe quitarse al integrar un servicio de correo real. Usuarios, desafíos y sesiones viven en memoria (`storage/auth_memory.go`); `main.go` carga las cuentas demo del prototipo con `CargarUsuariosDemo` (contraseñas con bcrypt). Vínculo de cuentas: `GET /clientes`, `GET /usuarios/pendientes-de-vinculo` y `POST /usuarios/vincular` (solo asesor; solo cuentas de Google con rol cliente; el cliente debe tener al menos un evento). El cliente ve sus eventos de inmediato (los permisos se leen en cada petición) y su pantalla tiene el botón «Ya me vincularon: actualizar». Disponibilidad (`services/disponibilidad.go`, regla del prototipo): al crear una solicitud que cambia fecha, horario o tiempos técnicos, el bloque ocupado del día principal (desde montaje o ensayo hasta desmontaje) no puede cruzarse con otras reservas ni con bloqueos institucionales (`BLK-001`); tocarse en el borde es válido; responde 409 con mensajes que no revelan datos de otros eventos. **Consulta previa (cliente):** `POST /disponibilidad` (mismo cuerpo que `POST /solicitudes` pero sin exigir motivo) responde 200 `{disponible, mensaje?}` reutilizando `SolicitudService.armarSolicitud(..., consulta=true)` (las mismas validaciones y regla, sin guardar; no exige motivo ni cambio efectivo); un evento ajeno es 404. El formulario del cliente (`SolicitudFormularioComponent`) emite `consultarDisponibilidad` 500 ms después del último cambio de horario o tiempos técnicos cuando los campos son válidos y distintos al evento, y `App.alConsultarDisponibilidad` consulta (cancelando la anterior) y muestra el aviso `#avisoDisponibilidad` («Horario disponible» / «Horario no disponible»). Es orientativa y no bloquea el envío: si falla, no se muestra nada y el servidor vuelve a comprobar al enviar. Google: `googleauth/` valida firma RS256 y claims del token con la biblioteca estándar (proyecto `showtech-prototipo`, sobrescribible con `FIREBASE_PROJECT_ID`); la cuenta se crea como cliente sin `cliente_id` y un correo que ya tiene contraseña se rechaza con 403 (Google nunca da acceso a la cuenta del asesor).

Autorización: `/eventos`, `/eventos/:id`, `/adicionales` y `/solicitudes` (GET y POST) exigen sesión (`/health` y `/auth/login|verificar|reenviar-codigo|google` son públicos). El filtrado lo hacen los servicios (`puedeVerEvento`, métodos `...De(ctx, usuario)`): el asesor ve todo; el cliente solo eventos y solicitudes con su `cliente_id` (el `Evento` trae `cliente_id`; evento 1 = CLI-001, evento 2 = CLI-002; no hay usuario demo para CLI-002). Un evento ajeno responde 404 igual que uno inexistente. Un cliente sin `cliente_id` vinculado (p. ej. entró con Google) no ve nada. El asesor puede crear solicitudes sobre cualquier evento (comportamiento previo conservado; por confirmar con el ingeniero).

Adicionales: el catálogo con tarifas es **simulado** (`models/adicional.go`, `CatalogoAdicionalesSimulado`); `SolicitudService` (paso 8b) valida ids contra ese catálogo, rechaza duplicados y cuenta los adicionales como un cambio efectivo más (`AdicionalesPropuestos` nulo = se conservan los del evento).

Las reglas de validación están duplicadas a propósito en los validadores del formulario Angular (`frontend/src/app/validators/solicitud.validators.ts`, p. ej. la expresión regular del correo): cambia ambos lados a la vez. Las interfaces TypeScript de `frontend/src/app/models/` reflejan el JSON del backend; actualízalas al modificar `models/`. Todo el acceso HTTP pasa por `EventosApiService`. La lógica de comparación y formato compartida (`construirFilasComparativa`, `calcularComparativoAdicionales`, `formatSoles`…) vive en `frontend/src/app/models/gestor-eventos.models.ts`.

El frontend muestra `LoginComponent` (réplica de `inicio.html`/`acceso.css`/`acceso.js`; el CSS es una copia de `acceso.css` con `:root`, `*` y `body` adaptados a `:host`) mientras no haya sesión. `AuthService` solo recuerda en `sessionStorage` (clave `showtech_sesion`) el usuario y el vencimiento, **nunca el token** (está en la cookie HttpOnly); `authInterceptor` no maneja tokens y un 401 en una ruta de negocio limpia la sesión y avisa en el login. La vista la define el **rol** (`App.vistaActiva`): asesor → portal del asesor (`components/asesor-portal`, por ahora solo consulta y compara; no hay endpoints de aprobación), cliente → portal del cliente; ya no hay botón para cambiar de vista. Al cerrar sesión `App` recarga la página para descartar los datos y borradores del usuario anterior. `GoogleAuthService` carga el SDK de Firebase de forma diferida (solo al pulsar «Continuar con Google»). Las fechas y horas de los formularios (cliente y asesor) usan Flatpickr mediante la directiva `SelectorFechaHoraDirective` (`appSelector="fecha"|"hora"`, un `ControlValueAccessor` que muestra `dd/mm/aaaa` pero guarda ISO `YYYY-MM-DD`; la hora es `HH:mm`, 24 h, con panel «Hora»/«Minutos»/«Listo» y sin corregir en silencio horas fuera de 06:00–22:00). Son `input type="text"`: no vuelvas a `type="date"`/`"time"` nativos porque traen su propio ícono y duplican el de la interfaz. El CSS base de Flatpickr está en `angular.json` (`styles`) y el del panel, copiado del prototipo, al final de `src/styles.scss`; **tras cambiar `angular.json` hay que reiniciar `npm start`**. Flatpickr se descarga bajo demanda al mostrarse un selector. Se omitió a propósito el botón de Facebook (en el prototipo era una sesión simulada sin credenciales, un bypass si se llevara a un backend real) y el botón «Simular vencimiento» (el vencimiento ahora lo impone el backend).

## Flujo del cliente y decisiones de diseño

Flujo en cuatro pasos: **Eventos** (consulta de eventos y sus solicitudes) → **Proponer cambios** (datos del evento y motivo) → **Revisar solicitud** (comparación de datos actuales y propuestos antes de enviar) → **Solicitud enviada** (confirmación y acceso al detalle).

- La solicitud queda en estado "Pendiente de revisión". **Registrar una solicitud NO modifica la reserva vigente.**
- Cada solicitud guarda copias (snapshots) de los datos originales y propuestos (`datos_originales` / `datos_propuestos`) para poder consultar exactamente qué se pidió. El modal de detalle muestra esos datos guardados por la API.
- Máximo una solicitud pendiente por evento (409 si se duplica).
- Se puede proponer cambio de nombre, contacto, teléfono, correo, observaciones/requerimientos, fecha y horario principal, y tiempos técnicos (montaje, desmontaje, ensayo) con cronograma propuesto y duración de cada franja.
- El borrador se conserva al volver desde la revisión; se previene el doble envío; el diseño es adaptable a móvil.
- El código visible de una solicitud es `SOL-AAAA-NNN` (`formatearCodigoSolicitud`: año de `fecha_creacion` + `id` con 3 dígitos); el `id` numérico sigue siendo el identificador real en la API.
- El paso 3 del cliente muestra el bloque informativo de costos del prototipo (S/ 100 por modificación y S/ 500 por hora, **referenciales**, sin total ni cobros; el importe final lo confirma el asesor). Cuando las tarifas reales se aprueben, hay que cambiarlas en `App.tarifasReferenciales`.
- Una cuenta de cliente sin `cliente_id` (p. ej. entró con Google) ve el estado vacío «No tienes eventos vinculados a esta cuenta».
- Comparación en tres columnas: campo, datos actuales y propuesta, con resaltado de diferencias.

## Diseño de la interfaz

La interfaz debe reproducir **exactamente** el prototipo original, no una versión aproximada. Antes de cambiar cualquier diseño, revisa `cliente.html`, `styles.css` y `cliente.js` del prototipo. Decisiones ya tomadas que se deben mantener:

- No agregar la columna "Cambio" ni etiquetas repetidas "Sin cambios".
- Los pasos futuros del flujo deben seguir siendo legibles aunque estén bloqueados.
- Accesibilidad frente a fidelidad: para cumplir contraste WCAG AA se oscurecieron ligeramente tres colores del prototipo: el gris de texto secundario (`--gris` #6b7280 → #626a78, y el gris del pie del login #8a94a6 → #626a78) y el verde usado como **texto** sobre fondos verdes claros (#1e8e5a → #17744a; el verde de fondos y botones no cambió). La prueba `e2e/accesibilidad.spec.ts` falla si vuelve a bajar el contraste.
- No recuperar los textos explicativos retirados: "Puede proponer cambios de fecha y horario para este evento", "Este evento ya cuenta con la solicitud #..." ni el aviso introductorio largo de "Proponer cambios". Las validaciones que respaldaban esos textos se conservan aunque ya no se muestren.

## Validaciones

Aplican en el backend (`services`) y, duplicadas, en el formulario Angular:

- Motivo obligatorio, sin aceptar solo espacios, máximo 400 caracteres Unicode (se cuentan runas, no bytes).
- Debe haber al menos un cambio efectivo, incluso si solo cambia un tiempo técnico.
- Horas con formato `HH:mm` estricto y rango 06:00–22:00 (inclusive).
- Hora de inicio anterior a la de fin.
- Las franjas técnicas deben ser el mismo día del evento.
- Montaje previo al evento (no puede terminar después de su inicio) y desmontaje posterior (no puede empezar antes de su fin).
- Ensayo previo al evento y sin cruces con el montaje.
- Se permiten franjas consecutivas: una puede terminar justo cuando comienza otra.
- Códigos HTTP: 201 creación, 400 datos inválidos, 404 evento inexistente, 409 solicitud pendiente duplicada, 500 error interno con mensaje genérico.

## Advertencias y puntos por revisar

- **Sincronización automática de tiempos técnicos (por revisar):** cuando la petición omite los tiempos técnicos, `SolicitudService` conserva las franjas del evento y las recalcula según la nueva fecha o los nuevos límites del evento (`services/solicitud_service.go`, rama `else` del paso 8; puede incluso desactivar una franja si no cabe). Esto puede mover horarios que el cliente no propuso explícitamente y debe revisarse con el usuario antes de cambiarlo o depender de ello.
- El flujo de aprobación del asesor y la confirmación final del cliente **aún requieren aclaraciones del ingeniero**. No los des por implementados ni inventes sus reglas.
- Los adicionales (recursos, cantidades, horas de uso, tarifas, subtotales) están implementados con un catálogo **simulado**; las reglas de cobro reales siguen sin confirmar, no asumas valores.

## Pendientes (no implementados)

- Reglas reales de adicionales (catálogo y tarifas definitivos; hoy son simulados).
- PostgreSQL: copias de seguridad/despliegue, y que `fecha`/`hora` pasen a tipos `DATE`/`TIME` (hoy son texto, igual que el JSON de la API).
- Autenticación: recuperación de contraseña, envío real del código por correo (hoy solo existe el notificador de consola) y persistencia de usuarios y sesiones. Falta también limitar intentos por IP (hoy el límite es por correo).
- Aprobación y rechazo de solicitudes por el asesor, y retiro por parte del asesor (la vista del asesor existe solo en modo consulta/comparación). El retiro por el cliente ya existe.
- Registro de acciones e historial para el asesor.
- Notificación al cliente tras la validación del asesor y confirmación final del cliente (constancia de ambas partes).
- Disponibilidad: ya existe la regla del prototipo al crear solicitudes (ver arriba); falta ofrecer alternativas de horario para el mismo día, que el asesor administre los bloqueos y la consulta previa en el portal del asesor (la del cliente ya existe: `POST /disponibilidad`).
- Despliegue.

## Forma de trabajar

- Explica las cosas en español sencillo.
- Antes de editar, revisa el código real y conserva los cambios existentes; no confíes en reportes de implementación sin verificar el estado real del repositorio.
- Trabaja por avances concretos y pequeños.
- No hagas commit ni push sin que el usuario lo pida expresamente.
