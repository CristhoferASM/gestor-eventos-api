package handlers

import (
	"errors"
	"net/http"

	"gestor-eventos-api/models"
	"gestor-eventos-api/services"

	"github.com/gin-gonic/gin"
)

func responderErrorUsuarios(c *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrAccesoDenegado):
		c.JSON(http.StatusForbidden, gin.H{"error": "Solo el asesor comercial puede administrar la vinculación de cuentas."})
	case errors.Is(err, services.ErrDatosInvalidos):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error interno del servidor."})
	}
}

// CuentasPendientesHandler lista las cuentas de Google sin cliente vinculado (solo asesor).
func CuentasPendientesHandler(usuarioService *services.UsuarioService) gin.HandlerFunc {
	return func(c *gin.Context) {
		lista, err := usuarioService.CuentasPendientesDeVinculo(c.Request.Context(), usuarioActual(c))
		if err != nil {
			responderErrorUsuarios(c, err)
			return
		}
		c.JSON(http.StatusOK, lista)
	}
}

// ClientesHandler lista los clientes a los que se puede vincular una cuenta (solo asesor).
func ClientesHandler(usuarioService *services.UsuarioService) gin.HandlerFunc {
	return func(c *gin.Context) {
		lista, err := usuarioService.Clientes(c.Request.Context(), usuarioActual(c))
		if err != nil {
			responderErrorUsuarios(c, err)
			return
		}
		c.JSON(http.StatusOK, lista)
	}
}

// VincularCuentaHandler asocia una cuenta de Google con un cliente (solo asesor).
func VincularCuentaHandler(usuarioService *services.UsuarioService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var dto models.VincularCuentaDTO
		if err := c.ShouldBindJSON(&dto); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cuerpo inválido: correo y cliente_id son obligatorios."})
			return
		}
		u, err := usuarioService.VincularCuenta(c.Request.Context(), usuarioActual(c), dto)
		if err != nil {
			responderErrorUsuarios(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"mensaje": "Cuenta vinculada.", "usuario": u})
	}
}
