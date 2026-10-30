package handlers

import (
	"gestor-eventos-api/services"

	"github.com/gin-gonic/gin"
)

// SetupRouter configura el enrutador de Gin, los proxies confiables y las rutas de la API
func SetupRouter(eventoService *services.EventoService, solicitudService *services.SolicitudService) *gin.Engine {
	r := gin.Default()

	// Configuración de proxies para entorno local de desarrollo
	// Evita advertencias de seguridad al no confiar en proxies externos
	_ = r.SetTrustedProxies([]string{"127.0.0.1"})

	// Middleware simple para CORS básico (útil para futuras conexiones con frontends)
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Rutas de la API
	r.GET("/health", HealthHandler)
	r.GET("/eventos", ListarEventosHandler(eventoService))
	r.GET("/eventos/:id", DetalleEventoHandler(eventoService))
	r.POST("/solicitudes", CrearSolicitudHandler(solicitudService))
	r.GET("/solicitudes", ListarSolicitudesHandler(solicitudService))

	return r
}
