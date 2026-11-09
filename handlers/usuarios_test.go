package handlers_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"gestor-eventos-api/handlers"
	"gestor-eventos-api/models"
	"gestor-eventos-api/services"
	"gestor-eventos-api/storage"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// Router con: un asesor, un cliente con contraseña (CLI-001) y una cuenta de Google sin vincular.
func setupVinculoRouter(t *testing.T) (r *gin.Engine, tokAsesor, tokCliente, tokGoogle string) {
	t.Helper()
	hash, _ := bcrypt.GenerateFromPassword([]byte("x"), bcrypt.MinCost)
	store := storage.NewMemoryStore()
	tokAsesor = sesionPara(store, usuarioAsesorPrueba)
	tokCliente = sesionPara(store, models.Usuario{ID: 2, Correo: "cli1@prueba.test", Rol: models.RolCliente, ClienteID: "CLI-001", PasswordHash: string(hash)})
	tokGoogle = sesionPara(store, models.Usuario{Correo: "ana@gmail.com", Nombre: "Ana", Rol: models.RolCliente, Proveedor: "google"})
	r = handlers.SetupRouter(
		services.NewEventoService(store), services.NewSolicitudService(store, store), services.NewAuthService(store, store),
		handlers.Opciones{Usuarios: services.NewUsuarioService(store, store)},
	)
	return
}

func TestVinculoSoloElAsesorPuedeAdministrarlo(t *testing.T) {
	r, _, tokCliente, tokGoogle := setupVinculoRouter(t)
	for _, tok := range []string{tokCliente, tokGoogle} {
		for _, ruta := range []struct{ metodo, ruta string }{
			{http.MethodGet, "/clientes"},
			{http.MethodGet, "/usuarios/pendientes-de-vinculo"},
			{http.MethodPost, "/usuarios/vincular"},
		} {
			if w := llamar(r, ruta.metodo, ruta.ruta, tok, gin.H{"correo": "ana@gmail.com", "cliente_id": "CLI-002"}); w.Code != http.StatusForbidden {
				t.Errorf("%s %s como cliente esperaba 403, obtuvo %d", ruta.metodo, ruta.ruta, w.Code)
			}
		}
	}
	if w := llamar(r, http.MethodGet, "/clientes", "", nil); w.Code != http.StatusUnauthorized {
		t.Errorf("sin sesión esperaba 401, obtuvo %d", w.Code)
	}
}

func TestVincularCuentaDeGoogleFlujoCompleto(t *testing.T) {
	r, tokAsesor, _, tokGoogle := setupVinculoRouter(t)

	// La cuenta aparece como pendiente y no ve eventos
	var pendientes []models.Usuario
	_ = json.Unmarshal(llamar(r, http.MethodGet, "/usuarios/pendientes-de-vinculo", tokAsesor, nil).Body.Bytes(), &pendientes)
	if len(pendientes) != 1 || pendientes[0].Correo != "ana@gmail.com" {
		t.Fatalf("pendientes inesperados: %+v", pendientes)
	}
	if w := llamar(r, http.MethodGet, "/eventos", tokGoogle, nil); strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatalf("antes del vínculo no debe ver eventos: %s", w.Body)
	}

	// El asesor ve los clientes disponibles
	w := llamar(r, http.MethodGet, "/clientes", tokAsesor, nil)
	if !strings.Contains(w.Body.String(), "CLI-002") || !strings.Contains(w.Body.String(), "Encuentro de docentes") {
		t.Errorf("la lista de clientes debe incluir CLI-002 con sus eventos: %s", w.Body)
	}

	// Vincula con CLI-002
	w = llamar(r, http.MethodPost, "/usuarios/vincular", tokAsesor, gin.H{"correo": "Ana@Gmail.com", "cliente_id": "CLI-002"})
	if w.Code != http.StatusOK {
		t.Fatalf("vincular esperaba 200, obtuvo %d: %s", w.Code, w.Body)
	}

	// Mismo token, sin volver a iniciar sesión: ya ve SOLO el evento 2
	var eventos []models.Evento
	_ = json.Unmarshal(llamar(r, http.MethodGet, "/eventos", tokGoogle, nil).Body.Bytes(), &eventos)
	if len(eventos) != 1 || eventos[0].ID != 2 {
		t.Errorf("tras vincular debía ver solo el evento 2: %+v", eventos)
	}
	if w := llamar(r, http.MethodGet, "/eventos/1", tokGoogle, nil); w.Code != http.StatusNotFound {
		t.Errorf("el evento de otro cliente sigue siendo 404, obtuvo %d", w.Code)
	}
	// Ya no aparece como pendiente
	_ = json.Unmarshal(llamar(r, http.MethodGet, "/usuarios/pendientes-de-vinculo", tokAsesor, nil).Body.Bytes(), &pendientes)
	if len(pendientes) != 0 {
		t.Errorf("tras vincular no debe seguir pendiente: %+v", pendientes)
	}
}

func TestVincularCuentaValidaciones(t *testing.T) {
	r, tokAsesor, _, _ := setupVinculoRouter(t)
	casos := []struct {
		nombre string
		cuerpo gin.H
	}{
		{"cliente inexistente", gin.H{"correo": "ana@gmail.com", "cliente_id": "CLI-999"}},
		{"cuenta inexistente", gin.H{"correo": "nadie@gmail.com", "cliente_id": "CLI-001"}},
		{"cuenta con contraseña (no es de Google)", gin.H{"correo": "cli1@prueba.test", "cliente_id": "CLI-002"}},
		{"la cuenta del asesor", gin.H{"correo": "asesor@prueba.test", "cliente_id": "CLI-001"}},
		{"faltan datos", gin.H{"correo": "ana@gmail.com"}},
	}
	for _, c := range casos {
		if w := llamar(r, http.MethodPost, "/usuarios/vincular", tokAsesor, c.cuerpo); w.Code != http.StatusBadRequest {
			t.Errorf("%s: esperaba 400, obtuvo %d: %s", c.nombre, w.Code, w.Body)
		}
	}
}

func TestRutasDeVinculoNoExistenSinConfigurarLosUsuarios(t *testing.T) {
	r, _ := setupTestRouter() // sin Opciones.Usuarios
	if w := llamar(r.Engine, http.MethodGet, "/clientes", r.token, nil); w.Code != http.StatusNotFound {
		t.Errorf("sin el servicio de usuarios la ruta no debe existir (404), obtuvo %d", w.Code)
	}
}
