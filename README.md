# SHOWTECH SOLUTIONS - API Gestor de Eventos (Backend Go)

Este repositorio contiene la primera demostración del backend para el **Gestor de Eventos de SHOWTECH SOLUTIONS**, desarrollado en **Go** utilizando el framework web **Gin**.

---

## 1. Propósito y Arquitectura

- **Go (Golang)**: Proporciona un entorno de ejecución compilado, de altísimo rendimiento, concurrencia nativa eficiente mediante goroutines y un consumo mínimo de memoria.
- **Gin Web Framework (v1.12.0)**: Permite definir rutas HTTP de baja latencia, serialización/deserialización JSON optimizada y validación estricta de payloads con middleware estructurado.
- **Futura conexión con PostgreSQL**: En esta fase inicial, la persistencia se gestiona en memoria volátil de forma concurrente (`sync.RWMutex`). En la siguiente iteración, este almacenamiento se reemplazará por un repositorio respaldado por **PostgreSQL**, implementando migraciones, control de transacciones ACID y persistencia duradera para la integración con el frontend de Angular.

---

## 2. Estructura del Proyecto

```text
gestor-eventos-api/
│
├── go.mod                      # Definición del módulo y dependencias
├── go.sum                      # Checksums criptográficos de dependencias
├── main.go                     # Punto de entrada y arranque del servidor HTTP
│
├── models/
│   ├── evento.go               # Estructura del modelo Evento
│   └── solicitud.go            # Modelos Solicitud, DTO y datos de horario
│
├── storage/
│   └── memory.go               # Almacenamiento en memoria concurrente (RWMutex)
│
├── handlers/
│   ├── routes.go               # Configuración de rutas, CORS y proxies de Gin
│   ├── health.go               # Handler para GET /health
│   ├── eventos.go              # Handlers para GET /eventos y GET /eventos/:id
│   ├── solicitudes.go          # Handlers y validaciones para POST y GET /solicitudes
│   └── handlers_test.go        # Suite de pruebas unitarias e integración
│
└── README.md                   # Documentación y guía de presentación
```

---

## 3. Configuración de Red y Enlaces Locales

El servidor se ejecuta en el puerto **8081** y escucha estrictamente en la interfaz de bucle invertido **127.0.0.1** para no colisionar con el prototipo HTML alojado en el puerto 8080:

- **Base URL**: `http://127.0.0.1:8081` o `http://localhost:8081`
- **Estado de Salud**: [http://127.0.0.1:8081/health](http://127.0.0.1:8081/health)
- **Catálogo de Eventos**: [http://127.0.0.1:8081/eventos](http://127.0.0.1:8081/eventos)
- **Detalle de Evento 1**: [http://127.0.0.1:8081/eventos/1](http://127.0.0.1:8081/eventos/1)
- **Detalle de Evento 2**: [http://127.0.0.1:8081/eventos/2](http://127.0.0.1:8081/eventos/2)
- **Listado de Solicitudes**: [http://127.0.0.1:8081/solicitudes](http://127.0.0.1:8081/solicitudes)

---

## 4. Comandos para Ejecutar y Detener el Servidor

### A. Ejecutar el servidor

Desde una terminal PowerShell en la carpeta del proyecto:

```powershell
# Si Go está configurado en el PATH:
go run main.go

# Si la terminal no reconoce el comando 'go', usar la ruta absoluta:
& "C:\Program Files\Go\bin\go.exe" run main.go
```

### B. Detener el servidor

Presionar `Ctrl + C` en la terminal donde se está ejecutando el proceso.

### C. Ejecutar las pruebas automatizadas

```powershell
& "C:\Program Files\Go\bin\go.exe" test -v ./handlers
```

---

## 5. Ejemplos de Pruebas desde PowerShell (`Invoke-RestMethod`)

### 1. Consultar estado del servicio (Health Check)
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8081/health" -Method Get | ConvertTo-Json
```

### 2. Listar eventos iniciales
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8081/eventos" -Method Get | ConvertTo-Json
```

### 3. Consultar detalle de un evento existente y uno inexistente
```powershell
# Evento existente (HTTP 200)
Invoke-RestMethod -Uri "http://127.0.0.1:8081/eventos/1" -Method Get | ConvertTo-Json

# Evento inexistente (HTTP 404)
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:8081/eventos/99" -Method Get
} catch {
    Write-Host "Código devuelto: $($_.Exception.Response.StatusCode.value__)"
}
```

### 4. Registrar una solicitud de modificación válida (HTTP 201)
```powershell
$solicitudValida = @{
    evento_id             = 1
    motivo                = "Ajuste de agenda por disponibilidad del conferencista estelar"
    fecha_propuesta       = "2026-11-28"
    hora_inicio_propuesta = "10:00"
    hora_fin_propuesta    = "14:00"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8081/solicitudes" -Method Post -Body $solicitudValida -ContentType "application/json" | ConvertTo-Json -Depth 5
```

### 5. Consultar solicitudes creadas
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8081/solicitudes" -Method Get | ConvertTo-Json -Depth 5
```

### 6. Intentar registrar una segunda solicitud pendiente sobre el mismo evento (HTTP 409 Conflict)
```powershell
try {
    $solicitudDuplicada = @{
        evento_id             = 1
        motivo                = "Intento de registrar segunda solicitud pendiente"
        fecha_propuesta       = "2026-11-29"
        hora_inicio_propuesta = "11:00"
        hora_fin_propuesta    = "15:00"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://127.0.0.1:8081/solicitudes" -Method Post -Body $solicitudDuplicada -ContentType "application/json"
} catch {
    Write-Host "Conflicto esperado detectado: Código $($_.Exception.Response.StatusCode.value__)"
}
```

### 7. Intentar registrar un horario inválido (HTTP 400 Bad Request)
```powershell
try {
    $horarioInvalido = @{
        evento_id             = 2
        motivo                = "Horario inicio posterior a fin"
        fecha_propuesta       = "2026-11-25"
        hora_inicio_propuesta = "17:00"
        hora_fin_propuesta    = "12:00"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://127.0.0.1:8081/solicitudes" -Method Post -Body $horarioInvalido -ContentType "application/json"
} catch {
    Write-Host "Error de validación esperado: Código $($_.Exception.Response.StatusCode.value__)"
}
```

---

## 6. Limitaciones Actuales de la Demostración

1. **Persistencia en memoria volátil**: Los datos se almacenan en la memoria RAM del proceso. Al reiniciar el servidor, las solicitudes registradas se reinician y se restauran los dos eventos de prueba iniciales.
2. **Sin autenticación ni control de permisos (RBAC)**: En esta fase inicial no se incluyen tokens JWT, sesiones de usuario ni OAuth.
3. **Flujo de aprobación/rechazo pendiente**: Las solicitudes se crean en estado `Pendiente de revisión`. Los endpoints de aprobación o rechazo de solicitudes por parte de administradores se implementarán junto con el módulo de permisos.
4. **Sin notificaciones externas**: No se efectúa envío de correos electrónicos ni pasarelas de pago/cobros adicionales.

---

## 7. Guion Breve para Presentar la Demostración al Ingeniero

> **Introducción:**
> *"Buenas tardes, Ingeniero. Hoy le presento el primer prototipo funcional del backend para el Gestor de Eventos de SHOWTECH SOLUTIONS, desarrollado con Go 1.27 y el framework Gin."*
>
> **1. Arquitectura y Decisiones Técnicas:**
> *"Seleccionamos Go por su alta velocidad, bajo consumo de recursos y facilidad de concurrencia. Para esta etapa de validación, construimos una arquitectura limpia y desacoplada con modelos, almacenamiento concurrente con `sync.RWMutex` y controladores HTTP bien delimitados. El servidor escucha exclusivamente en `127.0.0.1:8081` para convivir sin conflictos con el prototipo frontend del puerto 8080."*
>
> **2. Demostración en Vivo:**
> - *"Primero, mostramos `/health` donde confirmamos el estado UP y metadatos del servicio."*
> - *"Luego, listamos los eventos activos con `GET /eventos`, donde observamos dos eventos corporativos ficticios."*
> - *"Ahora demostramos la regla de negocio principal: `POST /solicitudes`. El backend valida que el evento exista, que el motivo no esté vacío y no supere 400 caracteres, que la fecha sea YYYY-MM-DD, que el rango horario esté entre 06:00 y 22:00, que el inicio sea anterior al fin y que realmente haya una modificación."*
> - *"Al registrarse con éxito, devuelve un HTTP 201, asigna un ID único y estado 'Pendiente de revisión', y guarda una copia exacta tanto de los datos originales como de los propuestos, asegurando que el evento original permanezca intacto."*
> - *"Para probar la robustez, intentamos enviar una segunda solicitud sobre el mismo evento y el sistema devuelve inmediatamente HTTP 409 Conflict, cumpliendo la regla de máximo una solicitud pendiente por evento."*
>
> **3. Siguientes Pasos:**
> *"Contamos con una suite completa de pruebas unitarias que validan todos los casos límite y de negocio con `go test`. Una vez aprobada esta lógica base, el siguiente paso será conectar el almacenamiento a PostgreSQL y enlazar los endpoints con Angular."*
