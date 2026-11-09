package handlers_test

import (
	"bytes"
	"encoding/json"
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

func TestAtajoDiarioDelAsesorPorHTTP(t *testing.T) {
	hash, _ := bcrypt.GenerateFromPassword([]byte("Secreta2026!"), bcrypt.MinCost)
	store := storage.NewMemoryStore()
	store.AgregarUsuario(models.Usuario{ID: 1, Correo: "asesor@showtech.com", Rol: models.RolAsesor, PasswordHash: string(hash)})
	r := handlers.SetupRouter(services.NewEventoService(store), services.NewSolicitudService(store, store), services.NewAuthService(store, store))

	enviar := func(ruta string, cuerpo any, cookies []*http.Cookie) *httptest.ResponseRecorder {
		buf, _ := json.Marshal(cuerpo)
		req, _ := http.NewRequest(http.MethodPost, ruta, bytes.NewReader(buf))
		req.Header.Set("Content-Type", "application/json")
		for _, c := range cookies {
			req.AddCookie(c)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	cookieDe := func(w *httptest.ResponseRecorder, nombre string) *http.Cookie {
		for _, c := range w.Result().Cookies() {
			if c.Name == nombre {
				return c
			}
		}
		return nil
	}

	credenciales := gin.H{"correo": "asesor@showtech.com", "password": "Secreta2026!"}

	// 1) Primer ingreso: se crea la cookie del navegador y se pide el código
	w1 := enviar("/auth/login", credenciales, nil)
	dispositivo := cookieDe(w1, handlers.NombreCookieDispositivo)
	if dispositivo == nil || !dispositivo.HttpOnly || dispositivo.SameSite != http.SameSiteStrictMode || dispositivo.MaxAge <= 0 {
		t.Fatalf("debe crearse la cookie HttpOnly del navegador: %+v", dispositivo)
	}
	var d models.RespuestaDesafio
	_ = json.Unmarshal(w1.Body.Bytes(), &d)
	if d.DesafioID == "" || d.Sesion != nil || !d.RecordatorioDiario {
		t.Fatalf("el primer ingreso pide código: %+v", d)
	}
	if enviar("/auth/verificar", gin.H{"desafio_id": d.DesafioID, "codigo": d.CodigoPrueba}, []*http.Cookie{dispositivo}).Code != http.StatusOK {
		t.Fatal("verificar debía funcionar")
	}

	// 2) Mismo navegador, mismo día: la contraseña abre la sesión directamente y deja la cookie de sesión
	w2 := enviar("/auth/login", credenciales, []*http.Cookie{dispositivo})
	var d2 models.RespuestaDesafio
	_ = json.Unmarshal(w2.Body.Bytes(), &d2)
	if d2.Sesion == nil || d2.DesafioID != "" {
		t.Fatalf("el segundo ingreso debía abrir sesión directa: %s", w2.Body)
	}
	sesion := cookieDe(w2, handlers.NombreCookieSesion)
	if sesion == nil || !sesion.HttpOnly {
		t.Fatal("la sesión directa debe entregarse en la cookie HttpOnly")
	}
	req, _ := http.NewRequest(http.MethodGet, "/auth/me", nil)
	req.AddCookie(sesion)
	me := httptest.NewRecorder()
	r.ServeHTTP(me, req)
	if me.Code != http.StatusOK {
		t.Errorf("la sesión directa debe permitir /auth/me: %d", me.Code)
	}

	// 3) Contraseña incorrecta con el recordatorio vigente: rechazada
	mala := enviar("/auth/login", gin.H{"correo": "asesor@showtech.com", "password": "mala"}, []*http.Cookie{dispositivo})
	if mala.Code != http.StatusUnauthorized {
		t.Errorf("contraseña incorrecta esperaba 401, obtuvo %d", mala.Code)
	}

	// 4) Navegador distinto (sin cookie): vuelve a pedir el código
	w4 := enviar("/auth/login", credenciales, nil)
	var d4 models.RespuestaDesafio
	_ = json.Unmarshal(w4.Body.Bytes(), &d4)
	if d4.DesafioID == "" || d4.Sesion != nil {
		t.Errorf("otro navegador debe pedir el código: %+v", d4)
	}
}
