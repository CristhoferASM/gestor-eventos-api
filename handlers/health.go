package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// HealthHandler responde con el estado de salud y metadatos de la API
func HealthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":     "UP",
		"proyecto":   "SHOWTECH SOLUTIONS - Backend Demostración",
		"tecnologia": "Go 1.27.0 + Gin v1.12.0",
		"entorno":    "Memoria volátil (datos de prueba para demo)",
	})
}
