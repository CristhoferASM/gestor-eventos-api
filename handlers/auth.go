package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"time"

	"gestor-eventos-api/models"
	"gestor-eventos-api/services"

	"github.com/gin-gonic/gin"
)

const (
	claveUsuarioContexto = "usuario"
	claveTokenContexto   = "token"

	// NombreCookieSesion es la cookie HttpOnly con el token de sesión: el JavaScript de la página no puede leerla,
	// así que un XSS no puede robar la sesión. La API también acepta «Authorization: Bearer» (PowerShell, pruebas).
	NombreCookieSesion = "showtech_sesion"

	// NombreCookieDispositivo identifica el navegador (HttpOnly, 30 días). Con ella el servidor recuerda
	// que el asesor ya verificó su código hoy; por sí sola no da acceso a nada.
	NombreCookieDispositivo = "showtech_dispositivo"
)

// dispositivoDe devuelve el identificador del navegador, creándolo (y guardándolo en una cookie) si no existe.
func dispositivoDe(c *gin.Context, segura bool) string {
	if v, err := c.Cookie(NombreCookieDispositivo); err == nil && len(v) >= 32 {
		return v
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	id := base64.RawURLEncoding.EncodeToString(b)
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie(NombreCookieDispositivo, id, 30*24*60*60, "/", "", segura, true)
	return id
}

// establecerCookieSesion guarda el token en una cookie HttpOnly, SameSite=Strict, con la vigencia de la sesión.
func establecerCookieSesion(c *gin.Context, token string, expira time.Time, segura bool) {
	segundos := int(time.Until(expira).Seconds())
	if segundos < 1 {
		segundos = 1
	}
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie(NombreCookieSesion, token, segundos, "/", "", segura, true)
}

func borrarCookieSesion(c *gin.Context, segura bool) {
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie(NombreCookieSesion, "", -1, "/", "", segura, true)
}

// responderErrorAuth traduce los errores de autenticación a códigos HTTP. Los errores internos devuelven un mensaje genérico.
func responderErrorAuth(c *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrDatosInvalidos):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrCredencialesInvalidas),
		errors.Is(err, services.ErrDesafioInvalido),
		errors.Is(err, services.ErrCodigoIncorrecto),
		errors.Is(err, services.ErrCodigoExpirado),
		errors.Is(err, services.ErrTokenGoogleInvalido),
		errors.Is(err, services.ErrCorreoGoogleNoVerificado),
		errors.Is(err, services.ErrSesionInvalida):
		c.JSON(http.StatusUnauthorized, gin.H{"error": capitalizar(err.Error()) + "."})
	case errors.Is(err, services.ErrCuentaConContrasena):
		c.JSON(http.StatusForbidden, gin.H{"error": capitalizar(err.Error()) + "."})
	case errors.Is(err, services.ErrGoogleNoDisponible):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": capitalizar(err.Error()) + "."})
	case errors.Is(err, services.ErrDemasiadosIntentos), errors.Is(err, services.ErrReenvioMuyPronto), errors.Is(err, services.ErrLoginBloqueado):
		c.JSON(http.StatusTooManyRequests, gin.H{"error": capitalizar(err.Error()) + "."})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error interno del servidor."})
	}
}

func capitalizar(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// LoginHandler valida correo y contraseña y devuelve el desafío de verificación (paso 1).
func LoginHandler(authService *services.AuthService, opciones Opciones) gin.HandlerFunc {
	return func(c *gin.Context) {
		var dto models.LoginDTO
		if err := c.ShouldBindJSON(&dto); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cuerpo inválido: correo y password son obligatorios."})
			return
		}
		dto.DispositivoID = dispositivoDe(c, opciones.CookieSegura)
		// ClientIP solo confía en X-Forwarded-For si la petición viene de un proxy confiable (ver SetTrustedProxies)
		dto.IP = c.ClientIP()
		resp, err := authService.IniciarLogin(c.Request.Context(), dto)
		if err != nil {
			responderErrorAuth(c, err)
			return
		}
		if resp.Sesion != nil { // el código ya se verificó hoy en este navegador: la contraseña abre la sesión
			establecerCookieSesion(c, resp.Sesion.Token, resp.Sesion.ExpiraEn, opciones.CookieSegura)
		}
		c.JSON(http.StatusOK, resp)
	}
}

// GoogleHandler valida el ID token de Firebase y abre sesión directamente (Google ya verificó la identidad).
func GoogleHandler(authService *services.AuthService, opciones Opciones) gin.HandlerFunc {
	return func(c *gin.Context) {
		var dto models.LoginGoogleDTO
		if err := c.ShouldBindJSON(&dto); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cuerpo inválido: id_token es obligatorio."})
			return
		}
		resp, err := authService.LoginConGoogle(c.Request.Context(), dto)
		if err != nil {
			responderErrorAuth(c, err)
			return
		}
		establecerCookieSesion(c, resp.Token, resp.ExpiraEn, opciones.CookieSegura)
		c.JSON(http.StatusOK, resp)
	}
}

// VerificarCodigoHandler valida el código de 6 dígitos y devuelve el token de sesión (paso 2).
func VerificarCodigoHandler(authService *services.AuthService, opciones Opciones) gin.HandlerFunc {
	return func(c *gin.Context) {
		var dto models.VerificarCodigoDTO
		if err := c.ShouldBindJSON(&dto); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cuerpo inválido: desafio_id y codigo son obligatorios."})
			return
		}
		dto.DispositivoID = dispositivoDe(c, opciones.CookieSegura)
		resp, err := authService.VerificarCodigo(c.Request.Context(), dto)
		if err != nil {
			responderErrorAuth(c, err)
			return
		}
		establecerCookieSesion(c, resp.Token, resp.ExpiraEn, opciones.CookieSegura)
		c.JSON(http.StatusOK, resp)
	}
}

// ReenviarCodigoHandler genera un nuevo código de verificación.
func ReenviarCodigoHandler(authService *services.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var dto models.ReenviarCodigoDTO
		if err := c.ShouldBindJSON(&dto); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cuerpo inválido: desafio_id es obligatorio."})
			return
		}
		resp, err := authService.ReenviarCodigo(c.Request.Context(), dto)
		if err != nil {
			responderErrorAuth(c, err)
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

// RequiereSesion es un middleware que exige una sesión vigente (cookie HttpOnly o "Authorization: Bearer <token>") y deja
// el usuario y el token en el contexto de Gin.
func RequiereSesion(authService *services.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Primero la cookie HttpOnly (navegador); si no hay, la cabecera Bearer (herramientas de línea de comandos)
		token, _ := c.Cookie(NombreCookieSesion)
		if token == "" {
			token = tokenDeCabecera(c.GetHeader("Authorization"))
		}
		usuario, err := authService.UsuarioDeSesion(c.Request.Context(), token)
		if err != nil {
			responderErrorAuth(c, err)
			c.Abort()
			return
		}
		c.Set(claveUsuarioContexto, usuario)
		c.Set(claveTokenContexto, token)
		c.Next()
	}
}

func tokenDeCabecera(cabecera string) string {
	const prefijo = "Bearer "
	if len(cabecera) <= len(prefijo) || !strings.EqualFold(cabecera[:len(prefijo)], prefijo) {
		return ""
	}
	return strings.TrimSpace(cabecera[len(prefijo):])
}

// usuarioActual devuelve el usuario que dejó RequiereSesion en el contexto.
func usuarioActual(c *gin.Context) models.Usuario {
	v, _ := c.Get(claveUsuarioContexto)
	u, _ := v.(models.Usuario)
	return u
}

// UsuarioActualHandler devuelve el usuario de la sesión (requiere RequiereSesion).
func UsuarioActualHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, usuarioActual(c))
	}
}

// LogoutHandler invalida la sesión actual (requiere RequiereSesion).
func LogoutHandler(authService *services.AuthService, opciones Opciones) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, _ := c.Get(claveTokenContexto)
		if err := authService.CerrarSesion(c.Request.Context(), token.(string)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error interno del servidor."})
			return
		}
		borrarCookieSesion(c, opciones.CookieSegura)
		c.JSON(http.StatusOK, gin.H{"mensaje": "Sesión cerrada."})
	}
}
