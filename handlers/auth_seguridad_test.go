package handlers_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"gestor-eventos-api/handlers"
	"gestor-eventos-api/models"
	"gestor-eventos-api/services"
	"gestor-eventos-api/storage"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func nuevoRouterConOpciones(t *testing.T, opciones handlers.Opciones) *gin.Engine {
	t.Helper()
	hash, _ := bcrypt.GenerateFromPassword([]byte("Secreta2026!"), bcrypt.MinCost)
	store := storage.NewMemoryStore()
	store.AgregarUsuario(models.Usuario{ID: 1, Correo: "cliente@horizonte.com", Rol: models.RolCliente, ClienteID: "CLI-001", PasswordHash: string(hash)})
	return handlers.SetupRouter(services.NewEventoService(store), services.NewSolicitudService(store, store), services.NewAuthService(store, store), opciones)
}

func iniciarSesionHTTP(t *testing.T, r *gin.Engine) *httptest.ResponseRecorder {
	t.Helper()
	w := llamar(r, http.MethodPost, "/auth/login", "", gin.H{"correo": "cliente@horizonte.com", "password": "Secreta2026!"})
	var d models.RespuestaDesafio
	_ = json.Unmarshal(w.Body.Bytes(), &d)
	return llamar(r, http.MethodPost, "/auth/verificar", "", gin.H{"desafio_id": d.DesafioID, "codigo": d.CodigoPrueba})
}

func TestSesionPorCookieHttpOnly(t *testing.T) {
	r := nuevoRouterConOpciones(t, handlers.Opciones{CookieSegura: true})
	w := iniciarSesionHTTP(t, r)
	if w.Code != http.StatusOK {
		t.Fatalf("verificar: %d %s", w.Code, w.Body)
	}

	var cookie *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == handlers.NombreCookieSesion {
			cookie = c
		}
	}
	if cookie == nil || cookie.Value == "" {
		t.Fatal("no se estableció la cookie de sesión")
	}
	if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/" || cookie.MaxAge <= 0 {
		t.Errorf("la cookie debe ser HttpOnly, Secure, SameSite=Strict y con vigencia: %+v", cookie)
	}

	// Solo con la cookie (sin cabecera Authorization) se accede
	req, _ := http.NewRequest(http.MethodGet, "/auth/me", nil)
	req.AddCookie(cookie)
	resp := httptest.NewRecorder()
	r.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK {
		t.Errorf("con la cookie /auth/me esperaba 200, obtuvo %d", resp.Code)
	}

	// Logout invalida la sesión y borra la cookie
	req, _ = http.NewRequest(http.MethodPost, "/auth/logout", nil)
	req.AddCookie(cookie)
	out := httptest.NewRecorder()
	r.ServeHTTP(out, req)
	borrada := false
	for _, c := range out.Result().Cookies() {
		if c.Name == handlers.NombreCookieSesion && c.MaxAge < 0 {
			borrada = true
		}
	}
	if out.Code != http.StatusOK || !borrada {
		t.Errorf("logout debía responder 200 y borrar la cookie: %d, borrada=%v", out.Code, borrada)
	}
	req, _ = http.NewRequest(http.MethodGet, "/auth/me", nil)
	req.AddCookie(cookie)
	tras := httptest.NewRecorder()
	r.ServeHTTP(tras, req)
	if tras.Code != http.StatusUnauthorized {
		t.Errorf("tras el logout la cookie vieja debe dar 401, obtuvo %d", tras.Code)
	}
}

func TestCookieNoEsSeguraSinOpcionYBearerSigueFuncionando(t *testing.T) {
	r := nuevoRouterConOpciones(t, handlers.Opciones{})
	w := iniciarSesionHTTP(t, r)
	for _, c := range w.Result().Cookies() {
		if c.Name == handlers.NombreCookieSesion && c.Secure {
			t.Error("sin CookieSegura la cookie no debe marcarse Secure (no funcionaría por http en desarrollo)")
		}
	}
	var s models.RespuestaSesion
	_ = json.Unmarshal(w.Body.Bytes(), &s)
	if resp := llamar(r, http.MethodGet, "/auth/me", s.Token, nil); resp.Code != http.StatusOK {
		t.Errorf("la cabecera Bearer debe seguir funcionando, obtuvo %d", resp.Code)
	}
}

func TestCORSSoloParaOrigenesAutorizados(t *testing.T) {
	r := nuevoRouterConOpciones(t, handlers.Opciones{OrigenesCORS: []string{"https://portal.showtech.test"}})

	pedir := func(metodo, origen string) *httptest.ResponseRecorder {
		req, _ := http.NewRequest(metodo, "/health", nil)
		if origen != "" {
			req.Header.Set("Origin", origen)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	ok := pedir(http.MethodGet, "https://portal.showtech.test")
	if ok.Header().Get("Access-Control-Allow-Origin") != "https://portal.showtech.test" ||
		ok.Header().Get("Access-Control-Allow-Credentials") != "true" || ok.Header().Get("Vary") != "Origin" {
		t.Errorf("origen autorizado: cabeceras CORS inesperadas: %v", ok.Header())
	}
	if mal := pedir(http.MethodGet, "https://sitio-malicioso.test"); mal.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("un origen no autorizado no debe recibir CORS: %v", mal.Header())
	}
	if sin := pedir(http.MethodGet, ""); sin.Code != http.StatusOK || sin.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("sin Origin (PowerShell o curl) debe funcionar sin cabeceras CORS: %d %v", sin.Code, sin.Header())
	}
	if pre := pedir(http.MethodOptions, "https://portal.showtech.test"); pre.Code != http.StatusNoContent {
		t.Errorf("el preflight esperaba 204, obtuvo %d", pre.Code)
	}
}

func TestCORSPorDefectoSoloPermiteElServidorDeDesarrollo(t *testing.T) {
	r := nuevoRouterConOpciones(t, handlers.Opciones{})
	for origen, esperado := range map[string]string{
		"http://localhost:4200": "http://localhost:4200",
		"http://evil.test":      "",
	} {
		req, _ := http.NewRequest(http.MethodGet, "/health", nil)
		req.Header.Set("Origin", origen)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if got := w.Header().Get("Access-Control-Allow-Origin"); got != esperado {
			t.Errorf("origen %q: esperaba %q, obtuvo %q", origen, esperado, got)
		}
	}
}

func TestLoginBloqueadoRespondeCuatroVeintinueve(t *testing.T) {
	r := nuevoRouterConOpciones(t, handlers.Opciones{})
	for i := 0; i < services.MaxFallosLogin; i++ {
		llamar(r, http.MethodPost, "/auth/login", "", gin.H{"correo": "cliente@horizonte.com", "password": "mala"})
	}
	w := llamar(r, http.MethodPost, "/auth/login", "", gin.H{"correo": "cliente@horizonte.com", "password": "Secreta2026!"})
	if w.Code != http.StatusTooManyRequests {
		t.Errorf("tras demasiados fallos esperaba 429, obtuvo %d: %s", w.Code, w.Body)
	}
}

// loginDesde envía POST /auth/login como si la petición llegara de la dirección remota indicada.
func loginDesde(r *gin.Engine, remota, correo, password string, cabeceras map[string]string) *httptest.ResponseRecorder {
	cuerpo, _ := json.Marshal(gin.H{"correo": correo, "password": password})
	req, _ := http.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(cuerpo))
	req.Header.Set("Content-Type", "application/json")
	for k, v := range cabeceras {
		req.Header.Set(k, v)
	}
	req.RemoteAddr = remota
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestLoginBloqueaLaIPDeOrigenConDemasiadosFallos(t *testing.T) {
	r := nuevoRouterConOpciones(t, handlers.Opciones{})
	for i := 0; i < services.MaxFallosLoginPorIP; i++ {
		w := loginDesde(r, "198.51.100.7:4000", fmt.Sprintf("fantasma%d@horizonte.com", i), "incorrecta", nil)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("intento %d: esperaba 401, obtuvo %d", i+1, w.Code)
		}
	}
	// Desde esa IP ya no entra nadie, ni con credenciales correctas
	if w := loginDesde(r, "198.51.100.7:4000", "cliente@horizonte.com", "Secreta2026!", nil); w.Code != http.StatusTooManyRequests {
		t.Fatalf("la IP bloqueada esperaba 429, obtuvo %d: %s", w.Code, w.Body)
	}
	// Otra IP sí entra (el puerto de origen no cuenta: es la misma IP con otro puerto)
	if w := loginDesde(r, "198.51.100.8:4000", "cliente@horizonte.com", "Secreta2026!", nil); w.Code != http.StatusOK {
		t.Errorf("otra IP esperaba 200, obtuvo %d: %s", w.Code, w.Body)
	}
	if w := loginDesde(r, "198.51.100.7:51234", "cliente@horizonte.com", "Secreta2026!", nil); w.Code != http.StatusTooManyRequests {
		t.Errorf("la misma IP con otro puerto sigue bloqueada, obtuvo %d", w.Code)
	}
}

func TestLoginNoSeLaSaltaFalsificandoXForwardedFor(t *testing.T) {
	r := nuevoRouterConOpciones(t, handlers.Opciones{})
	// La petición llega de una IP NO confiable: su cabecera X-Forwarded-For no debe cambiar el origen contado
	for i := 0; i < services.MaxFallosLoginPorIP; i++ {
		_ = loginDesde(r, "203.0.113.9:4000", fmt.Sprintf("fantasma%d@horizonte.com", i), "incorrecta",
			map[string]string{"X-Forwarded-For": fmt.Sprintf("10.0.0.%d", i+1)})
	}
	w := loginDesde(r, "203.0.113.9:4000", "cliente@horizonte.com", "Secreta2026!", map[string]string{"X-Forwarded-For": "10.9.9.9"})
	if w.Code != http.StatusTooManyRequests {
		t.Errorf("falsificar X-Forwarded-For no debe evitar el bloqueo de la IP real, obtuvo %d: %s", w.Code, w.Body)
	}
}
