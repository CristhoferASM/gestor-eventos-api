package handlers

import (
	"gestor-eventos-api/services"

	"github.com/gin-gonic/gin"
)

// Opciones agrupa la configuración del enrutador que depende del entorno de despliegue.
type Opciones struct {
	// OrigenesCORS son los orígenes del navegador autorizados a llamar a la API. Vacío = solo el servidor de
	// desarrollo de Angular (http://localhost:4200 y http://127.0.0.1:4200). Nunca se usa «*».
	OrigenesCORS []string
	// CookieSegura marca la cookie de sesión como Secure (solo se envía por HTTPS). Debe ser true en producción.
	CookieSegura bool
	// Usuarios habilita las rutas de vinculación de cuentas con clientes (solo asesor). Si es nil, no se registran.
	Usuarios *services.UsuarioService
}

var origenesCORSPorDefecto = []string{"http://localhost:4200", "http://127.0.0.1:4200"}

// SetupRouter configura el enrutador de Gin, los proxies confiables y las rutas de la API.
// Las opciones son opcionales: sin ellas se usan los valores de desarrollo.
func SetupRouter(eventoService *services.EventoService, solicitudService *services.SolicitudService, authService *services.AuthService, opcionesEntorno ...Opciones) *gin.Engine {
	var opciones Opciones
	if len(opcionesEntorno) > 0 {
		opciones = opcionesEntorno[0]
	}
	if len(opciones.OrigenesCORS) == 0 {
		opciones.OrigenesCORS = origenesCORSPorDefecto
	}
	permitidos := make(map[string]bool, len(opciones.OrigenesCORS))
	for _, o := range opciones.OrigenesCORS {
		permitidos[o] = true
	}

	r := gin.Default()

	// Configuración de proxies para entorno local de desarrollo
	// Evita advertencias de seguridad al no confiar en proxies externos
	_ = r.SetTrustedProxies([]string{"127.0.0.1"})

	// CORS con lista de orígenes: solo se responde a navegadores de orígenes autorizados (y con credenciales,
	// para la cookie de sesión). Las llamadas sin cabecera Origin (PowerShell, curl) no se ven afectadas.
	r.Use(func(c *gin.Context) {
		origen := c.GetHeader("Origin")
		if origen != "" && permitidos[origen] {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origen)
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			c.Writer.Header().Add("Vary", "Origin")
		}

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Rutas de la API
	r.GET("/health", HealthHandler)
	// Rutas de negocio: exigen sesión; el filtrado por rol y cliente_id lo aplican los servicios
	protegidas := r.Group("", RequiereSesion(authService))
	protegidas.GET("/eventos", ListarEventosHandler(eventoService))
	protegidas.GET("/eventos/:id", DetalleEventoHandler(eventoService))
	protegidas.GET("/adicionales", ListarCatalogoAdicionalesHandler())
	protegidas.POST("/solicitudes", CrearSolicitudHandler(solicitudService))
	protegidas.GET("/solicitudes", ListarSolicitudesHandler(solicitudService))
	protegidas.POST("/solicitudes/:id/retirar", RetirarSolicitudHandler(solicitudService))

	if opciones.Usuarios != nil {
		protegidas.GET("/clientes", ClientesHandler(opciones.Usuarios))
		protegidas.GET("/usuarios/pendientes-de-vinculo", CuentasPendientesHandler(opciones.Usuarios))
		protegidas.POST("/usuarios/vincular", VincularCuentaHandler(opciones.Usuarios))
	}

	// Autenticación en dos pasos (correo y contraseña, luego código de verificación simulado)
	auth := r.Group("/auth")
	auth.POST("/login", LoginHandler(authService, opciones))
	auth.POST("/google", GoogleHandler(authService, opciones))
	auth.POST("/verificar", VerificarCodigoHandler(authService, opciones))
	auth.POST("/reenviar-codigo", ReenviarCodigoHandler(authService))
	auth.GET("/me", RequiereSesion(authService), UsuarioActualHandler())
	auth.POST("/logout", RequiereSesion(authService), LogoutHandler(authService, opciones))

	return r
}
