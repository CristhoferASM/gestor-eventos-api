package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"gestor-eventos-api/googleauth"
	"gestor-eventos-api/handlers"
	"gestor-eventos-api/notificaciones"
	"gestor-eventos-api/repositories"
	"gestor-eventos-api/services"
	"gestor-eventos-api/storage"

	_ "github.com/joho/godotenv/autoload" // carga el archivo .env (DATABASE_URL, etc.) si existe; no pisa variables ya definidas
)

// proyectoFirebase devuelve el ID del proyecto de Firebase del prototipo (configuración web pública);
// puede sobrescribirse con la variable de entorno FIREBASE_PROJECT_ID.
func proyectoFirebase() string {
	if id := os.Getenv("FIREBASE_PROJECT_ID"); id != "" {
		return id
	}
	return "showtech-prototipo"
}

// listaDeEntorno lee una variable de entorno con valores separados por comas (vacía = sin valores).
func listaDeEntorno(nombre string) []string {
	var valores []string
	for _, v := range strings.Split(os.Getenv(nombre), ",") {
		if v = strings.TrimSpace(v); v != "" {
			valores = append(valores, v)
		}
	}
	return valores
}

// almacen reúne todos los repositorios que necesita la aplicación; lo cumplen tanto el almacén en memoria como PostgreSQL.
type almacen interface {
	repositories.EventoRepository
	repositories.SolicitudRepository
	repositories.UsuarioRepository
	repositories.SesionRepository
	repositories.BloqueoRepository
	repositories.ClienteRepository
	repositories.AdicionalRepository
}

// almacenEmpresa combina la base de datos de la empresa (eventos, solicitudes, clientes, bloqueos y catálogo) con un
// almacén en memoria solo para usuarios y sesiones: la autenticación contra las tablas de acceso de la empresa está
// pendiente.
type almacenEmpresa struct {
	repositories.EventoRepository
	repositories.SolicitudRepository
	repositories.BloqueoRepository
	repositories.ClienteRepository
	repositories.AdicionalRepository
	repositories.UsuarioRepository
	repositories.SesionRepository
}

// abrirAlmacenEmpresa conecta con la base de datos de la empresa en Neon (esquema `showtech`, rama dev-backend, usuario
// backend_showtech). Nunca migra ni siembra datos: solo lee y escribe datos del módulo.
func abrirAlmacenEmpresa(url string) (almacen, func()) {
	ctx, cancelar := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancelar()
	bd, err := storage.NewEmpresaStore(ctx, url)
	if err != nil {
		log.Fatalf("No se pudo conectar con la base de datos de la empresa: %v", err)
	}

	// Usuarios y sesiones en memoria. Las cuentas salen de la tabla `usuario` (asesor comercial y clientes) y comparten
	// la contraseña CLAVE_DEMO, que solo existe en memoria: nunca se escribe en la base de datos.
	auth := storage.NewEmptyMemoryStore()
	if clave := os.Getenv("CLAVE_DEMO"); clave != "" {
		usuarios, err := bd.UsuariosDemo(ctx, clave)
		if err != nil {
			log.Fatalf("No se pudieron cargar las cuentas de demostración: %v", err)
		}
		for _, u := range usuarios {
			auth.AgregarUsuario(u)
		}
		fmt.Printf(" Cuentas de demostración: %d (contraseña = CLAVE_DEMO)\n", len(usuarios))
	} else {
		fmt.Println(" AVISO: CLAVE_DEMO no está definida: no hay cuentas para iniciar sesión (defínela en .env)")
	}
	fmt.Println(" Almacenamiento: base de datos de la empresa en Neon (esquema showtech; solo datos, sin migraciones)")
	return almacenEmpresa{bd, bd, bd, bd, bd, auth, auth}, bd.Close
}

// abrirAlmacen elige dónde se guardan los datos: la base de datos de la empresa si ESQUEMA_BD=empresa; PostgreSQL propio
// si solo hay DATABASE_URL; si no, memoria (se pierde al reiniciar).
func abrirAlmacen() (almacen, func()) {
	if url := os.Getenv("DATABASE_URL"); url != "" && os.Getenv("ESQUEMA_BD") == "empresa" {
		return abrirAlmacenEmpresa(url)
	}
	if url := os.Getenv("DATABASE_URL"); url != "" {
		ctx, cancelar := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelar()
		pg, err := storage.NewPostgresStore(ctx, url)
		if err != nil {
			log.Fatalf("No se pudo iniciar PostgreSQL: %v", err)
		}
		if os.Getenv("CARGAR_DEMO") != "false" { // por defecto true: eventos y cuentas de demostración (no pisa lo existente)
			if err := pg.SembrarDemo(ctx); err != nil {
				log.Fatalf("No se pudieron cargar los datos de demostración: %v", err)
			}
		}
		fmt.Println(" Almacenamiento: PostgreSQL (los datos sobreviven a los reinicios)")
		return pg, pg.Close
	}

	// Almacenamiento en memoria con datos de prueba y las cuentas demo del prototipo; se pierden al reiniciar
	mem := storage.NewMemoryStore()
	if err := mem.CargarUsuariosDemo(); err != nil {
		log.Fatalf("No se pudieron cargar los usuarios de demostración: %v", err)
	}
	fmt.Println(" Almacenamiento: memoria (los datos se pierden al reiniciar; define DATABASE_URL para usar PostgreSQL)")
	return mem, func() {}
}

func main() {
	store, cerrarAlmacen := abrirAlmacen()
	defer cerrarAlmacen()

	// Ensamblar servicios inyectando las interfaces de repositorio
	eventoService := services.NewEventoService(store).ConClientes(store).ConCatalogo(store)
	solicitudService := services.NewSolicitudService(store, store).ConBloqueos(store).ConCatalogo(store)
	if _, esEmpresa := store.(almacenEmpresa); esEmpresa {
		// Como en la base de datos de la empresa: solo el cliente envía solicitudes de modificación
		solicitudService = solicitudService.SoloClientesEnvian()
	}
	modoDemo := os.Getenv("MODO_DEMO") != "false" // por defecto true: el código se muestra en la respuesta
	authService := services.NewAuthService(store, store).
		ConVerificadorGoogle(googleauth.NuevoVerificador(proyectoFirebase())).
		ConNotificador(notificaciones.Consola{}, modoDemo)

	// Configurar enrutador Gin y endpoints recibiendo únicamente servicios
	r := handlers.SetupRouter(eventoService, solicitudService, authService, handlers.Opciones{
		OrigenesCORS: listaDeEntorno("CORS_ORIGINS"),
		CookieSegura: os.Getenv("COOKIE_SECURE") == "true",
		Usuarios:     services.NewUsuarioService(store, store).ConClientes(store),
	})

	direccion := "127.0.0.1:8081"
	if d := os.Getenv("API_ADDR"); d != "" {
		direccion = d // solo para pruebas de extremo a extremo; debe seguir siendo una dirección local
	}
	fmt.Println("=============================================================")
	fmt.Println("   SHOWTECH SOLUTIONS - API Gestor de Eventos (Backend Go)   ")
	fmt.Println("=============================================================")
	fmt.Printf(" Servidor iniciado en http://%s\n", direccion)
	fmt.Println(" Escuchando exclusivamente en 127.0.0.1 (evita conflicto con puerto 8080)")
	fmt.Println(" Endpoints disponibles:")
	fmt.Println("   - GET  /health")
	fmt.Println("   - GET  /eventos")
	fmt.Println("   - GET  /eventos/:id")
	fmt.Println("   - POST /solicitudes")
	fmt.Println("   - GET  /solicitudes")
	fmt.Println("   - POST /solicitudes/:id/retirar")
	fmt.Println("   - GET  /clientes, /usuarios/pendientes-de-vinculo; POST /usuarios/vincular (asesor)")
	fmt.Println("   - POST /auth/login, /auth/google, /auth/verificar, /auth/reenviar-codigo, /auth/logout")
	fmt.Println("   - GET  /auth/me")
	fmt.Println("=============================================================")

	// Iniciar servidor HTTP en 127.0.0.1:8081 con manejo de errores
	if err := r.Run(direccion); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("Error crítico al iniciar el servidor en %s: %v\n", direccion, err)
	}
}
