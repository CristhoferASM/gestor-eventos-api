# SHOWTECH SOLUTIONS - API Gestor de Eventos (Backend Go en Desarrollo)

Este repositorio contiene el backend en desarrollo para el **Gestor de Eventos de SHOWTECH SOLUTIONS**, construido en **Go** con el framework HTTP **Gin**.

Actualmente el proyecto opera con almacenamiento en memoria protegido por exclusión mutua (`sync.RWMutex`) y estructura sus responsabilidades en capas (`handlers`, `services`, `repositories` y `storage`) y puede guardar los datos en **PostgreSQL** (variable `DATABASE_URL`) o, si no se define, en memoria.

El repositorio tiene dos partes: el **backend en Go** (raíz) y el **frontend en Angular + TypeScript** (carpeta `frontend/`).

---

## Requisitos previos

| Herramienta | Versión | Para qué sirve | ¿Obligatoria? |
|---|---|---|---|
| **Git** | cualquiera reciente | clonar el repositorio | sí |
| **Go** | **1.27** (la fija `go.mod`) | compilar y ejecutar el backend y sus pruebas | sí |
| **Node.js** y **npm** | Node **22** o superior (el CI usa 22) y npm 11 | frontend Angular 22 (TypeScript, SCSS), sus pruebas y la compilación | sí, para el frontend |
| **Google Chrome** | reciente | pruebas de extremo a extremo (`npm run e2e`); Playwright usa el Chrome instalado y no descarga navegadores | solo para las pruebas E2E |
| **Docker** | reciente | levantar PostgreSQL local (ver sección B) | opcional |
| **PostgreSQL** | **16** | guardar los datos de forma permanente; puede ser el contenedor local o uno gestionado, indicado en `DATABASE_URL` | opcional: sin `DATABASE_URL` el backend usa memoria y pierde los datos al reiniciar |
| **sqlc** | 1.31.1 | regenerar `storage/db/` si cambias `storage/queries/*.sql` o las migraciones: `go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1` | solo si tocas esas consultas (el CI comprueba que el código generado esté al día) |

Sistema probado: Windows 11 con PowerShell (los ejemplos de este documento usan PowerShell). Si `go` no está en el `PATH`, usa la ruta completa: `& "C:\Program Files\Go\bin\go.exe"`.

### Inicio rápido

```powershell
# 1. Backend (en la raíz del repositorio; escucha en 127.0.0.1:8081, datos en memoria)
go run .

# 2. Frontend (en otra terminal)
cd frontend
npm install
npm start          # http://localhost:4200
```

Cuentas de demostración, datos persistentes con PostgreSQL y las pruebas se explican más abajo.

---

## 1. Estructura del Proyecto y Función de Cada Paquete

```text
gestor-eventos-api/
│
├── go.mod                        # Definición del módulo y dependencias
├── go.sum                        # Sumas de verificación de dependencias
├── main.go                       # Punto de entrada: ensambla almacenamiento, servicios y enrutador HTTP
│
├── models/
│   ├── cliente.go                # Cliente (código y razón social; tabla `clientes`)
│   ├── evento.go                 # Estructura de datos Evento (incluye cliente_id, el dueño, y cliente_nombre, su razón social)
│   ├── solicitud.go              # Estructuras Solicitud, SolicitudCreacionDTO y DatosHorario
│   └── usuario.go                # Usuario, desafío de verificación, sesión y DTOs de autenticación
│
├── repositories/
│   └── repositories.go           # Interfaces EventoRepository y SolicitudRepository + errores de dominio/datos
│
├── storage/
│   ├── memory.go                 # Implementación en memoria de los repositorios (protegida con sync.RWMutex)
│   └── auth_memory.go            # Usuarios, desafíos y sesiones en memoria + cuentas demo
│
├── services/
│   ├── errors.go                 # Errores de validación e identificación de fallos de negocio
│   ├── evento_service.go         # Lógica de negocio para consulta de eventos
│   ├── solicitud_service.go      # Validaciones, construcción de snapshots y coordinación de solicitudes
│   ├── auth_service.go           # Acceso en dos pasos, sesiones, acceso con Google y filtrado por rol
│   ├── services_test.go          # Pruebas unitarias de servicios (sin servidor HTTP)
│   └── auth_service_test.go      # Pruebas del acceso en dos pasos y las sesiones
│
├── notificaciones/
│   └── consola.go                # Notificador de desarrollo: imprime el código de verificación en el registro del servidor
│
├── googleauth/
│   └── verificador.go            # Valida ID tokens de Firebase (firma RS256 + claims) con la biblioteca estándar
│
├── handlers/
│   ├── routes.go                 # Configuración de rutas de Gin, CORS y proxies confiables
│   ├── health.go                 # Handler para GET /health
│   ├── eventos.go                # Handlers HTTP para GET /eventos y GET /eventos/:id
│   ├── solicitudes.go            # Handlers HTTP para POST /solicitudes y GET /solicitudes
│   ├── auth.go                   # Handlers /auth/* y middleware RequiereSesion
│   ├── handlers_test.go          # Pruebas de integración HTTP sobre los endpoints
│   └── auth_test.go              # Pruebas HTTP de autenticación, roles y acceso con Google
│
├── frontend/                     # Aplicación web Angular (standalone + SCSS)
│   ├── proxy.conf.json           # Proxy de desarrollo (/api -> http://127.0.0.1:8081)
│   ├── package.json              # Scripts y dependencias de Angular
│   └── src/app/
│       ├── models/               # Interfaces TypeScript alineadas con el JSON del backend
│       ├── services/             # EventosApiService, AuthService (sesión) y GoogleAuthService (Firebase)
│       ├── directives/           # SelectorFechaHoraDirective: fecha y hora con Flatpickr (formularios reactivos y ngModel)
│       ├── interceptors/         # authInterceptor: adjunta el token Bearer y gestiona el 401
│       ├── validators/           # Validadores de formulario reactivo (HH:mm, rango, Unicode)
│       └── components/           # Login, listado de eventos, formulario, solicitudes y portal del asesor
│
└── README.md                     # Documentación técnica del proyecto
```

### Función de cada paquete
- **`models`**: Define las estructuras de datos compartidas entre capas (`Evento`, `Solicitud`, `SolicitudCreacionDTO`, `DatosHorario`). Son estructuras utilizadas transversalmente por las capas y no un paso secuencial dentro de la petición.
- **`repositories`**: Define contratos pequeños (`EventoRepository`, `SolicitudRepository`) con soporte para `context.Context` y errores identificables (`ErrEventoNoEncontrado`, `ErrSolicitudPendienteDuplicada`).
- **`storage`**: Implementa en memoria las interfaces de `repositories` usando `sync.RWMutex`, conservando los datos iniciales de prueba y garantizando de forma atómica que no se registren dos solicitudes pendientes para el mismo evento.
- **`services`**: Contiene las reglas de negocio y validaciones (formato estricto de horas `HH:MM`, rango horario `06:00`–`22:00`, longitud Unicode del motivo, existencia de cambios reales y creación de snapshots). No importa Gin ni conoce códigos de estado HTTP.
- **`handlers`**: Recibe las peticiones HTTP de Gin, lee parámetros y cuerpos JSON, invoca a los servicios y traduce los resultados o errores a códigos HTTP (`200`, `201`, `400`, `404`, `409`, `500`). No importa `storage`.

---

## 2. Diferencia entre Handler, Servicio y Repositorio

| Capa | Responsabilidad Principal | Qué conoce | Qué NO debe hacer |
| :--- | :--- | :--- | :--- |
| **Handler (`handlers/`)** | Transporte HTTP: leer parámetros de ruta y JSON, invocar al servicio y devolver respuestas JSON con el código HTTP adecuado. | `gin.Context`, códigos HTTP (`400`, `404`, `409`, `500`), DTOs y errores del servicio. | Validar reglas de negocio complejas, construir snapshots o acceder directamente a `storage`. |
| **Servicio (`services/`)** | Reglas de negocio: validar datos de entrada, comprobar existencia del evento, construir los snapshots (`datos_originales` y `datos_propuestos`) y coordinar el guardado. | Modelos de dominio, interfaces de `repositories`, reloj inyectable (`ClockFunc`). | Importar `gin`, devolver códigos HTTP o ejecutar consultas directas a estructuras de almacenamiento. |
| **Repositorio (`repositories/` + `storage/`)** | Acceso y resguardo de datos: consultar y almacenar entidades cumpliendo invariantes de consistencia (como la unicidad atómica de solicitud pendiente por evento). | `context.Context`, estructuras de `models` y primitivas de sincronización o persistencia. | Decidir códigos de respuesta HTTP o formatear mensajes de validación de interfaz. |

---

## 3. Diagramas de Arquitectura

### A. Arquitectura Implementada Actualmente (Almacenamiento en Memoria)

```mermaid
flowchart LR
    Client["Cliente HTTP / PowerShell"] --> Router["Ruta de Gin (handlers/routes.go)"]
    Router --> Handler["Handler HTTP (handlers/)"]
    Handler --> Service["Servicio (services/)"]
    Service --> RepoInterface["Interfaz Repositorio (repositories/)"]
    RepoInterface --> MemoryStore["Almacenamiento en Memoria (storage.Store)"]

    Models["Modelos (models/)"] -. "Estructuras usadas por las capas" .-> Handler
    Models -.-> Service
    Models -.-> RepoInterface
    Models -.-> MemoryStore
```

### B. Conexión con PostgreSQL

Si defines `DATABASE_URL` el backend usa PostgreSQL (acceso a datos con **sqlc + pgx**, decidido con el ingeniero, sin ORM: las consultas están en `storage/queries/*.sql`, sqlc genera el código tipado en `storage/db/` y queda aislado detrás de las interfaces de `repositories/`; tras cambiar un `.sql` o una migración, ejecuta `sqlc generate` en la raíz; instalación: `go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest`). Sin ella, usa memoria como antes. Las migraciones (`storage/migraciones/`) se aplican solas al arrancar, y los datos de demostración se cargan solo si faltan.

```powershell
# Base de datos de desarrollo en un contenedor (una sola vez)
docker run -d --name showtech-postgres -e POSTGRES_USER=showtech -e POSTGRES_PASSWORD=showtech_dev -e POSTGRES_DB=gestor_eventos -p 127.0.0.1:5433:5432 -v showtech_pgdata:/var/lib/postgresql/data postgres:16-alpine

# Arrancar el backend con datos persistentes
$env:DATABASE_URL = "postgres://showtech:showtech_dev@127.0.0.1:5433/gestor_eventos?sslmode=disable"
go run .

# Pruebas de integración contra PostgreSQL (cada prueba usa un esquema propio y lo borra)
$env:TEST_DATABASE_URL = $env:DATABASE_URL
go test ./storage -count=1
```

### B2. Base de datos de la empresa en Neon (esquema `showtech`)

El backend también puede conectarse a la **base de datos de la empresa** (PostgreSQL 18 en Neon, São Paulo, esquema `showtech` con 40 tablas), decidido con el ingeniero. Es un modo aparte (`ESQUEMA_BD=empresa`) que **solo lee y escribe datos del módulo y nunca crea ni modifica tablas**: el usuario `backend_showtech` no puede, y los cambios de estructura los hace el administrador con un script versionado.

**Cómo conectarse**
1. Acepta la invitación a la organización de Neon (rol Collaborator) y pide al administrador el `.env` de la rama **`dev-backend`** (nunca `production`) con el usuario **`backend_showtech`** (no el administrador `neondb_owner`). También puedes sacarlo de Neon: rama `dev-backend` → **Connect** → rol `backend_showtech`.
2. Copia `.env.example` como `.env` en la raíz y completa `DATABASE_URL` (host con `-pooler`), `DIRECT_URL` (sin `-pooler`), `ESQUEMA_BD=empresa` y una `CLAVE_DEMO` propia. `.env` está en `.gitignore`: nunca lo subas ni lo compartas.
3. Comprueba la conexión (solo lectura; no imprime la contraseña): `go run ./cmd/probar-conexion`. Debe mostrar el usuario `backend_showtech`, 40 tablas, que **no** puede crear tablas y los datos de prueba.
4. Arranca con `go run .` (lee el `.env` solo).

**Qué hace en este modo**
- **Eventos:** el horario vive en `evento_bloque` (EVENTO, MONTAJE, DESMONTAJE y ENSAYO); los adicionales, en `evento_adicional`; el cliente sale de `solicitud_cotizacion` → `cliente`. Los estados llegan como `CON_ADELANTO`, `RESERVADO`, etc. y la interfaz los muestra legibles. Solo los eventos con primer pago (`CON_ADELANTO`, `PAGADO`, `REALIZADO`) ocupan el auditorio.
- **Solicitudes de modificación:** se guardan en `solicitud_modificacion` más dos versiones en `evento_version` (ORIGINAL y PROPUESTA) con sus bloques y adicionales, en una sola transacción. La base garantiza una sola solicitud pendiente por evento (también con peticiones simultáneas). El código `SOLM-AAAA-NNNN` lo calcula el backend. El retiro marca la solicitud como `RETIRADA` sin borrarla.
- **Disponibilidad:** las reglas de cruce de la base solo protegen a los eventos ya reservados; una propuesta vive en `evento_version_bloque` y **no tiene restricción de cruce**, así que este backend sigue comprobando la disponibilidad contra los eventos que ocupan el auditorio y los bloqueos (`bloqueo_espacio`).
- **Catálogo de adicionales:** viene de la tabla `adicional` (códigos como `COCHERA`, `LED_5X4`).
- **Cuentas de demostración:** las contraseñas de la tabla `usuario` son de ejemplo (`HASH_EJEMPLO`) y no sirven para entrar. Mientras no se integre la autenticación con las tablas de acceso de la empresa, el backend crea en **memoria** (nunca en la base) las cuentas del asesor comercial y de los clientes de `usuario`, todas con la contraseña `CLAVE_DEMO`.
- **Eventos modificables (provisional):** solo los eventos contratados (`RESERVADO`, `CON_ADELANTO`, `PAGADO`) admiten solicitudes; los cotizados, cancelados o ya realizados, no.

**Estructura del código:** `storage/empresa.go` (almacén), `storage/empresa_conversion.go` (conversiones puras), `storage/empresa/esquema.sql` (subconjunto del esquema para sqlc; la fuente de verdad es la base) y `storage/empresa/queries/*.sql`, que sqlc convierte en `storage/empresadb/` con `sqlc generate`. Los horarios del esquema son `timestamp` **sin zona horaria** (hora de Lima).

**Pruebas contra la base real** (solo `dev-backend`; crean datos sobre el evento 3 y los borran al terminar):
```powershell
$env:TEST_EMPRESA_DATABASE_URL = "<la misma cadena de DATABASE_URL>"
go test ./storage -run Empresa -count=1 -v
```
Cada consulta tarda ~0,3 s desde Perú (la base está en São Paulo y, en el plan gratis, se duerme a los 5 minutos: la primera consulta puede tardar 1–2 s más), por eso las consultas independientes se lanzan en paralelo.

Las reglas importantes las impone la propia base de datos: un índice único parcial garantiza una sola solicitud pendiente por evento (aun con peticiones simultáneas) y el retiro es un `UPDATE` condicional atómico. Los tokens de sesión, los ids de verificación y los ids de navegador se guardan solo como hash SHA-256.

Diagrama de la arquitectura prevista:

```mermaid
flowchart LR
    Client["Cliente HTTP / Frontend"] --> Router["Ruta de Gin"]
    Router --> Handler["Handler HTTP (handlers/)"]
    Handler --> Service["Servicio (services/)"]
    Service --> RepoInterface["Interfaz Repositorio (repositories/)"]
    RepoInterface --> PGImpl["Implementación PostgreSQL (futura)"]
    PGImpl --> PGDB[("Base de Datos PostgreSQL")]
```

---

## 4. Ejemplo del Recorrido de `POST /solicitudes`

1. **Petición HTTP**: El cliente envía `POST /solicitudes` con el JSON de `SolicitudCreacionDTO`.
2. **Ruta de Gin (`handlers/routes.go`)**: Dirige la petición a `CrearSolicitudHandler(solicitudService)`.
3. **Handler (`handlers/solicitudes.go`)**:
   - Deserializa el cuerpo JSON mediante `c.ShouldBindJSON(&dto)`. Si faltan campos requeridos o el JSON es inválido, responde `400 Bad Request`.
   - Llama a `solicitudService.CrearSolicitud(c.Request.Context(), dto)`.
4. **Servicio (`services/solicitud_service.go`)**:
   - Consulta `eventoRepo.ObtenerEventoPorID(ctx, dto.EventoID)`. Si no existe, retorna `ErrEventoNoEncontrado`.
   - Limpia espacios externos del motivo y verifica que no sea vacío ni supere 400 caracteres Unicode (`utf8.RuneCountInString`).
   - Valida que `fecha_propuesta` cumpla el formato `YYYY-MM-DD`.
   - Valida que `hora_inicio_propuesta` y `hora_fin_propuesta` tengan formato estricto `HH:MM` (dos dígitos, dos puntos y dos dígitos), estén entre `06:00` y `22:00` inclusive y que la hora de inicio sea anterior a la de fin.
   - Verifica que exista al menos un cambio en fecha u horario frente al evento original.
   - Construye la entidad `models.Solicitud` con estado `"Pendiente de revisión"`, `fecha_creacion` generada a partir del reloj inyectado en estándar RFC 3339 con offset de zona horaria explícito (`time.RFC3339`, p. ej. `2026-11-06T15:05:32-05:00` o `2026-11-06T20:05:32Z`) y los snapshots `datos_originales` y `datos_propuestos`.
   - Invoca a `solicitudRepo.CrearSolicitud(ctx, nuevaSolicitud)`.
5. **Repositorio / Almacenamiento (`storage/memory.go`)**:
   - Adquiere el bloqueo de escritura (`s.mu.Lock()`).
   - Verifica de manera atómica que el evento exista y que no tenga otra solicitud en estado `"Pendiente de revisión"`. Si ya existe una, devuelve `ErrSolicitudPendienteDuplicada`.
   - Asigna el `ID` secuencial, guarda la solicitud en memoria y la retorna.
6. **Respuesta HTTP (`handlers/solicitudes.go`)**:
   - Si el servicio retorna un error, el handler lo clasifica con `errors.Is`:
     - `ErrDatosInvalidos` → `400 Bad Request`
     - `ErrEventoNoEncontrado` → `404 Not Found`
     - `ErrSolicitudPendienteDuplicada` → `409 Conflict`
     - Cualquier otro error inesperado → `500 Internal Server Error` (sin exponer detalles internos).
   - Si tiene éxito, responde `201 Created` con `{"mensaje": "...", "solicitud": {...}}`.

---

## 5. Configuración Local, Ejecución y Pruebas

El servidor escucha en `127.0.0.1:8081`:

- **Health Check**: `http://127.0.0.1:8081/health`
- **Listar Eventos**: `http://127.0.0.1:8081/eventos`
- **Detalle de Evento**: `http://127.0.0.1:8081/eventos/1`
- **Solicitudes**: `http://127.0.0.1:8081/solicitudes`

### A. Iniciar el servidor

```powershell
# Si Go está disponible en PATH:
go run main.go

# Usando la ruta absoluta de Go en Windows:
& "C:\Program Files\Go\bin\go.exe" run main.go
```

Para detener el servidor, presiona `Ctrl + C` en la terminal.

### B. Ejecutar verificaciones y pruebas automatizadas del backend

```powershell
& "C:\Program Files\Go\bin\go.exe" vet ./...
& "C:\Program Files\Go\bin\go.exe" test -count=1 ./...
```

### B2. Pruebas de extremo a extremo (navegador real)
```powershell
cd frontend
npm run e2e
```
Arranca un backend nuevo (`:8082`) y el frontend (`:4300`) sin tocar los servidores de desarrollo, y usa el Chrome instalado. Incluye accesibilidad (axe-core) y revisión móvil. El workflow `.github/workflows/ci.yml` ejecuta backend, frontend y E2E en cada push.

### C. Iniciar y verificar el frontend Angular (`http://localhost:4200`)

El frontend implementa el recorrido del portal en **cuatro pasos** conectado a la API real (`GET /api/eventos`, `GET /api/solicitudes` y `POST /api/solicitudes`), mostrando una sección principal visible por vez:

1. **Paso 1 — Eventos**: Tarjetas horizontales con el identificador numérico real de cada evento, espacio, fecha y horario confirmado, botón `"Solicitar modificación"`, bloqueo automático cuando ya existe una solicitud en estado `"Pendiente de revisión"` y listado inferior de `"Solicitudes de modificación"` (tabla en escritorio y tarjetas en móvil) con acceso al modal accesible de detalle.
2. **Paso 2 — Proponer cambios**: Resumen en solo lectura del evento seleccionado (ID, nombre y espacio), edición de `Fecha propuesta`, `Hora de inicio propuesta`, `Hora de fin propuesta` y `Motivo de la solicitud` con validaciones reactivas (`YYYY-MM-DD`, `HH:mm` entre `06:00` y `22:00`, inicio anterior al fin, máximo 400 caracteres Unicode y al menos un cambio respecto al original), insignia `"Modificado"` por campo y modal de confirmación antes de descartar un borrador editado.
3. **Paso 3 — Revisar solicitud**: Tabla comparativa entre los valores actuales confirmados y los valores propuestos, visualización del motivo y envío mediante `POST /api/solicitudes` con bloqueo de doble envío y conservación del borrador en caso de fallo o conflicto `409`.
4. **Paso 4 — Solicitud enviada**: Pantalla accesible tras recibir `201 Created`, mostrando los datos reales devueltos por el servidor en estado `"Pendiente de revisión"`, acceso al detalle completo y retorno al listado de eventos.

En otra terminal PowerShell dentro de la subcarpeta `frontend/` (con el backend Go ejecutándose en `127.0.0.1:8081`):

```powershell
cd frontend

# Iniciar servidor de desarrollo en http://localhost:4200 con proxy /api -> http://127.0.0.1:8081
npm start

# Compilar para producción
npm run build

# Ejecutar pruebas unitarias de Angular sin modo watch
npx ng test --watch=false
```

---

## 5b. Variables de entorno y seguridad

| Variable | Para qué sirve | Por defecto |
| :--- | :--- | :--- |
| `API_ADDR` | Dirección del backend | `127.0.0.1:8081` |
| `CORS_ORIGINS` | Orígenes del navegador permitidos (separados por comas) | `http://localhost:4200,http://127.0.0.1:4200` |
| `COOKIE_SECURE` | `true` = la cookie de sesión solo viaja por HTTPS (obligatorio en producción) | `false` |
| `MODO_DEMO` | `false` = el código de verificación no se devuelve en la respuesta (solo se imprime en el registro del servidor) | `true` |
| `DATABASE_URL` | Cadena de conexión de PostgreSQL; si falta, se usa memoria | (vacía) |
| `CARGAR_DEMO` | `false` = no sembrar eventos y cuentas de demostración en PostgreSQL | `true` |
| `FIREBASE_PROJECT_ID` | Proyecto de Firebase que valida el acceso con Google | `showtech-prototipo` |

- La sesión viaja en una cookie `HttpOnly` + `SameSite=Strict`: el JavaScript de la página no puede leerla.
- Tras 5 contraseñas erróneas, el correo se bloquea 15 minutos. Además, tras 20 contraseñas erróneas desde una misma IP (de cualquier correo) esa IP se bloquea 15 minutos; un login correcto no reinicia el contador de la IP. Ambos casos responden `429`. Los contadores viven en memoria.
- Al asesor se le pide el código de verificación una vez por día de Lima y por navegador; la contraseña siempre.
- Una solicitud que choca con otra reserva o con un bloqueo institucional se rechaza (409) sin revelar datos de otros clientes.

## 6. Ejemplos de Uso desde PowerShell (`Invoke-RestMethod`)

Todas las rutas de negocio (`/eventos`, `/eventos/:id`, `/adicionales`, `/solicitudes`) exigen sesión; solo `/health` y `/auth/login|verificar|reenviar-codigo|google` son públicas. Los ejemplos 2 a 7 usan la variable `$h` que se crea en el ejemplo 0.

### 0. Iniciar sesión (acceso en dos pasos) y preparar la cabecera `Authorization`
```powershell
# Paso 1: correo y contraseña (cuentas demo: asesor@showtech.com / Asesor2026!  y  cliente@horizonte.com / Cliente2026!)
$login = @{ correo = "cliente@horizonte.com"; password = "Cliente2026!" } | ConvertTo-Json
$desafio = Invoke-RestMethod -Uri "http://127.0.0.1:8081/auth/login" -Method Post -Body $login -ContentType "application/json"

# Paso 2: código de 6 dígitos. La verificación por correo es SIMULADA: el código viene en codigo_prueba.
$verif = @{ desafio_id = $desafio.desafio_id; codigo = $desafio.codigo_prueba } | ConvertTo-Json
$sesion = Invoke-RestMethod -Uri "http://127.0.0.1:8081/auth/verificar" -Method Post -Body $verif -ContentType "application/json"

$h = @{ Authorization = "Bearer $($sesion.token)" }
Invoke-RestMethod -Uri "http://127.0.0.1:8081/auth/me" -Method Get -Headers $h | ConvertTo-Json
```
Respuestas: `401` credenciales o código incorrectos (o token ausente/vencido), `429` demasiados intentos (5) o reenvío antes de 30 s, `403` si un correo de cuenta con contraseña intenta entrar por Google. El código vence a los 60 s y la sesión dura 8 h. Para cerrar sesión: `Invoke-RestMethod -Uri "http://127.0.0.1:8081/auth/logout" -Method Post -Headers $h`.

### 1. Consultar estado del servicio (`GET /health`)
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8081/health" -Method Get | ConvertTo-Json
```

### 2. Listar eventos (`GET /eventos`)
```powershell
Invoke-RestMethod -Headers $h -Uri "http://127.0.0.1:8081/eventos" -Method Get | ConvertTo-Json
```

### 3. Consultar detalle de un evento (`GET /eventos/:id`)
```powershell
# Evento existente (HTTP 200)
Invoke-RestMethod -Headers $h -Uri "http://127.0.0.1:8081/eventos/1" -Method Get | ConvertTo-Json

# Evento inexistente (HTTP 404)
try {
    Invoke-RestMethod -Headers $h -Uri "http://127.0.0.1:8081/eventos/99" -Method Get
} catch {
    Write-Host "Código devuelto: $($_.Exception.Response.StatusCode.value__)"
}

# ID inválido o cero (HTTP 400)
try {
    Invoke-RestMethod -Headers $h -Uri "http://127.0.0.1:8081/eventos/0" -Method Get
} catch {
    Write-Host "Código devuelto: $($_.Exception.Response.StatusCode.value__)"
}
```

### 4. Registrar una solicitud de modificación válida (`POST /solicitudes` -> HTTP 201)
```powershell
$solicitudValida = @{
    evento_id             = 1
    motivo                = "Ajuste de agenda por disponibilidad del conferencista principal"
    fecha_propuesta       = "2026-11-28"
    hora_inicio_propuesta = "10:00"
    hora_fin_propuesta    = "14:00"
} | ConvertTo-Json

Invoke-RestMethod -Headers $h -Uri "http://127.0.0.1:8081/solicitudes" -Method Post -Body $solicitudValida -ContentType "application/json" | ConvertTo-Json -Depth 5
```

### 4b. Consultar si un horario está libre, sin registrar nada (`POST /disponibilidad`)
Recibe el mismo cuerpo que `POST /solicitudes`, pero el motivo es opcional (el formulario lo usa mientras el cliente aún escribe). Aplica las mismas validaciones y la misma regla de disponibilidad (el bloque de montaje/ensayo a desmontaje no se cruza con otras reservas ni bloqueos; tocarse en el borde es válido), sin guardar nada.
```powershell
$consulta = @{
    evento_id             = 2
    fecha_propuesta       = "2026-11-15"
    hora_inicio_propuesta = "13:30"
    hora_fin_propuesta    = "14:30"
} | ConvertTo-Json
Invoke-RestMethod -Headers $h -Uri "http://127.0.0.1:8081/disponibilidad" -Method Post -Body $consulta -ContentType "application/json"
```
Respuestas: `200` con `{"disponible": true}` o `{"disponible": false, "mensaje": "..."}` (el mensaje nunca revela datos de otros eventos), `400` si los datos son inválidos, `401` sin sesión y `404` si el evento no existe o es de otro cliente. Es orientativa: al enviar la solicitud se vuelve a comprobar.

### 5. Consultar solicitudes registradas (`GET /solicitudes`)
```powershell
Invoke-RestMethod -Headers $h -Uri "http://127.0.0.1:8081/solicitudes" -Method Get | ConvertTo-Json -Depth 5
```

### 6. Intentar registrar una segunda solicitud pendiente para el mismo evento (HTTP 409)
```powershell
try {
    $solicitudDuplicada = @{
        evento_id             = 1
        motivo                = "Intento de registrar segunda solicitud pendiente"
        fecha_propuesta       = "2026-11-29"
        hora_inicio_propuesta = "11:00"
        hora_fin_propuesta    = "15:00"
    } | ConvertTo-Json
    Invoke-RestMethod -Headers $h -Uri "http://127.0.0.1:8081/solicitudes" -Method Post -Body $solicitudDuplicada -ContentType "application/json"
} catch {
    Write-Host "Conflicto esperado detectado: Código $($_.Exception.Response.StatusCode.value__)"
}
```

### 6b. Retirar una solicitud pendiente (`POST /solicitudes/:id/retirar`)
Solo el cliente dueño del evento puede retirarla y solo mientras siga "Pendiente de revisión". La solicitud no se elimina: pasa a "Retirada por el cliente" y el evento queda libre para una nueva solicitud.
```powershell
Invoke-RestMethod -Headers $h -Uri "http://127.0.0.1:8081/solicitudes/1/retirar" -Method Post | ConvertTo-Json -Depth 5
```
Respuestas: `200` retirada, `400` id inválido, `401` sin sesión, `403` si es el asesor, `404` si no existe o es de otro cliente, `409` si ya no estaba pendiente.

### 6c. Vincular una cuenta de Google con un cliente (solo asesor)
```powershell
# Inicia sesión como asesor (ejemplo 0) y usa su cabecera $h
Invoke-RestMethod -Headers $h -Uri "http://127.0.0.1:8081/usuarios/pendientes-de-vinculo" -Method Get | ConvertTo-Json
Invoke-RestMethod -Headers $h -Uri "http://127.0.0.1:8081/clientes" -Method Get | ConvertTo-Json
$vinculo = @{ correo = "ana@gmail.com"; cliente_id = "CLI-002" } | ConvertTo-Json
Invoke-RestMethod -Headers $h -Uri "http://127.0.0.1:8081/usuarios/vincular" -Method Post -Body $vinculo -ContentType "application/json"
```
Respuestas: `403` si no eres asesor, `400` si la cuenta no existe, no es de Google o el cliente no existe.

`GET /clientes` devuelve `cliente_id`, `razon_social` (si el cliente está registrado) y los nombres de sus eventos. Los clientes viven en la tabla `clientes` (migración `002_clientes.sql`, solo código y razón social por ahora; los demás datos del cliente están por confirmar con el ingeniero). `GET /eventos` y `GET /eventos/:id` incluyen `cliente_nombre` con esa razón social; si el cliente aún no está registrado el campo no aparece y la interfaz muestra «No disponible». Con PostgreSQL, los clientes demo (`CLI-001` «Promoción Horizonte 2026», del prototipo, y `CLI-002`, inventado para la demo) se cargan si faltan, sin pisar cambios.

### 7. Intentar registrar un horario con formato u orden inválido (HTTP 400)
```powershell
try {
    $horarioInvalido = @{
        evento_id             = 2
        motivo                = "Formato de hora incompleto o rango inválido"
        fecha_propuesta       = "2026-11-25"
        hora_inicio_propuesta = "9:00"
        hora_fin_propuesta    = "12:00"
    } | ConvertTo-Json
    Invoke-RestMethod -Headers $h -Uri "http://127.0.0.1:8081/solicitudes" -Method Post -Body $horarioInvalido -ContentType "application/json"
} catch {
    Write-Host "Error de validación esperado: Código $($_.Exception.Response.StatusCode.value__)"
}
```

---

## 7. Alcance, Compatibilidad y Trabajo Pendiente

- **Compatibilidad de snapshots y registros**:
  - Las estructuras de snapshots `datos_originales` y `datos_propuestos` contienen la información general del evento (`nombre`, `espacio`, `contacto`, `telefono`, `correo`, `observaciones`) junto con fecha y horario.
  - Para solicitudes históricas o creadas sin datos de contacto, la interfaz presenta `"Dato no disponible en este registro"`.
  - Para campos opcionales (`telefono`, `correo`, `observaciones`) que hayan sido explícitamente vaciados o no provistos en registros vigentes, la interfaz presenta `"Sin especificar"`.
- **Persistencia**: con `DATABASE_URL` los datos se guardan en PostgreSQL y sobreviven a los reinicios; sin ella siguen en memoria y se pierden al detener el proceso. El acceso a datos es sqlc + pgx; falta definir el despliegue y las copias de seguridad.
- **Formato y manejo de `fecha_creacion`**: Las nuevas solicitudes se generan en estándar RFC 3339 con offset de zona horaria explícito (`time.RFC3339`, como `2026-11-06T15:05:32-05:00`). El frontend convierte de forma consistente estos instantes a la zona horaria `America/Lima` (`DD/MM/YYYY, HH:mm:ss`), manteniendo a la vez compatibilidad retroactiva completa con registros legacy que contengan formato `"YYYY-MM-DD HH:MM:SS"`.
- **Autenticación y propiedad**: el acceso es en dos pasos (correo y contraseña, y luego un código de 6 dígitos cuyo envío por correo es **simulado**: el código viaja en `codigo_prueba`; debe retirarse al integrar un servicio de correo real). También hay acceso con Google (Firebase, proyecto `showtech-prototipo`, configurable con `FIREBASE_PROJECT_ID`): las cuentas de Google entran como cliente sin eventos vinculados y no pueden usar un correo que ya tenga contraseña. Los usuarios y sesiones están en memoria (se pierden al reiniciar). El asesor ve todos los eventos y solicitudes; el cliente solo los de su `cliente_id` (el evento ajeno responde 404). Para usar Google en local, `localhost` debe estar en los dominios autorizados de Firebase Console. Siguen pendientes la vinculación de cuentas de Google con un cliente, el atajo diario de verificación del asesor, la recuperación de contraseña, el bloqueo por intentos de contraseña y la aprobación y el rechazo de solicitudes por el asesor. El retiro por el cliente sí está implementado (sin cargos; regla pendiente de validar con el ingeniero).
