package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gestor-eventos-api/handlers"
	"gestor-eventos-api/models"
	"gestor-eventos-api/services"
	"gestor-eventos-api/storage"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func setupAuthRouter(t *testing.T) *gin.Engine {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte("Secreta2026!"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	store := storage.NewMemoryStore()
	store.AgregarUsuario(models.Usuario{
		ID: 1, Correo: "cliente@horizonte.com", Nombre: "Horizonte", Rol: models.RolCliente,
		ClienteID: "CLI-001", PasswordHash: string(hash),
	})
	return handlers.SetupRouter(
		services.NewEventoService(store),
		services.NewSolicitudService(store, store),
		services.NewAuthService(store, store),
	)
}

func llamar(r *gin.Engine, metodo, ruta, token string, cuerpo any) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if cuerpo != nil {
		_ = json.NewEncoder(&buf).Encode(cuerpo)
	}
	req, _ := http.NewRequest(metodo, ruta, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestAuthFlujoCompletoHTTP(t *testing.T) {
	r := setupAuthRouter(t)

	// Paso 1: login
	w := llamar(r, http.MethodPost, "/auth/login", "", gin.H{"correo": "cliente@horizonte.com", "password": "Secreta2026!"})
	if w.Code != http.StatusOK {
		t.Fatalf("login esperaba 200, obtuvo %d: %s", w.Code, w.Body)
	}
	var desafio models.RespuestaDesafio
	_ = json.Unmarshal(w.Body.Bytes(), &desafio)
	if desafio.DesafioID == "" || len(desafio.CodigoPrueba) != 6 {
		t.Fatalf("desafío inesperado: %+v", desafio)
	}

	// /auth/me sin sesión -> 401
	if w := llamar(r, http.MethodGet, "/auth/me", "", nil); w.Code != http.StatusUnauthorized {
		t.Errorf("me sin token esperaba 401, obtuvo %d", w.Code)
	}

	// Paso 2: verificar
	w = llamar(r, http.MethodPost, "/auth/verificar", "", gin.H{"desafio_id": desafio.DesafioID, "codigo": desafio.CodigoPrueba})
	if w.Code != http.StatusOK {
		t.Fatalf("verificar esperaba 200, obtuvo %d: %s", w.Code, w.Body)
	}
	if strings.Contains(w.Body.String(), "PasswordHash") || strings.Contains(w.Body.String(), "$2a$") {
		t.Errorf("la respuesta no debe incluir el hash de la contraseña: %s", w.Body)
	}
	var ses models.RespuestaSesion
	_ = json.Unmarshal(w.Body.Bytes(), &ses)

	// /auth/me con sesión
	w = llamar(r, http.MethodGet, "/auth/me", ses.Token, nil)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"cliente_id":"CLI-001"`) {
		t.Errorf("me esperaba 200 con cliente_id, obtuvo %d: %s", w.Code, w.Body)
	}

	// Logout y token ya inválido
	if w := llamar(r, http.MethodPost, "/auth/logout", ses.Token, nil); w.Code != http.StatusOK {
		t.Errorf("logout esperaba 200, obtuvo %d", w.Code)
	}
	if w := llamar(r, http.MethodGet, "/auth/me", ses.Token, nil); w.Code != http.StatusUnauthorized {
		t.Errorf("me tras logout esperaba 401, obtuvo %d", w.Code)
	}
}

func TestAuthLoginErroresHTTP(t *testing.T) {
	r := setupAuthRouter(t)

	casos := []struct {
		nombre   string
		cuerpo   any
		esperado int
	}{
		{"contraseña incorrecta", gin.H{"correo": "cliente@horizonte.com", "password": "mala"}, http.StatusUnauthorized},
		{"correo inexistente", gin.H{"correo": "x@y.com", "password": "mala"}, http.StatusUnauthorized},
		{"faltan campos", gin.H{"correo": "cliente@horizonte.com"}, http.StatusBadRequest},
		{"solo espacios", gin.H{"correo": "   ", "password": "x"}, http.StatusBadRequest},
	}
	for _, c := range casos {
		if w := llamar(r, http.MethodPost, "/auth/login", "", c.cuerpo); w.Code != c.esperado {
			t.Errorf("%s: esperaba %d, obtuvo %d: %s", c.nombre, c.esperado, w.Code, w.Body)
		}
	}
}

func TestAuthVerificarYReenviarErroresHTTP(t *testing.T) {
	r := setupAuthRouter(t)
	w := llamar(r, http.MethodPost, "/auth/login", "", gin.H{"correo": "cliente@horizonte.com", "password": "Secreta2026!"})
	var d models.RespuestaDesafio
	_ = json.Unmarshal(w.Body.Bytes(), &d)

	if w := llamar(r, http.MethodPost, "/auth/verificar", "", gin.H{"desafio_id": d.DesafioID, "codigo": "abcdef"}); w.Code != http.StatusUnauthorized {
		t.Errorf("código incorrecto esperaba 401, obtuvo %d", w.Code)
	}
	if w := llamar(r, http.MethodPost, "/auth/verificar", "", gin.H{"desafio_id": "inexistente", "codigo": "123456"}); w.Code != http.StatusUnauthorized {
		t.Errorf("desafío inexistente esperaba 401, obtuvo %d", w.Code)
	}
	if w := llamar(r, http.MethodPost, "/auth/reenviar-codigo", "", gin.H{"desafio_id": d.DesafioID}); w.Code != http.StatusTooManyRequests {
		t.Errorf("reenvío inmediato esperaba 429, obtuvo %d", w.Code)
	}
	if w := llamar(r, http.MethodPost, "/auth/verificar", "", gin.H{"desafio_id": d.DesafioID}); w.Code != http.StatusBadRequest {
		t.Errorf("falta código esperaba 400, obtuvo %d", w.Code)
	}
}

// setupRolesRouter devuelve un router real (sin wrapper) con un cliente de CLI-001, uno de CLI-002 sin eventos
// vinculados (cliente sin cliente_id) y un asesor, cada uno con su token.
func setupRolesRouter(t *testing.T) (r *gin.Engine, tokCli001, tokSinCliente, tokAsesor string) {
	t.Helper()
	store := storage.NewMemoryStore()
	tokCli001 = sesionPara(store, models.Usuario{ID: 1, Correo: "cli1@prueba.test", Rol: models.RolCliente, ClienteID: "CLI-001"})
	tokSinCliente = sesionPara(store, models.Usuario{ID: 2, Correo: "google@prueba.test", Rol: models.RolCliente})
	tokAsesor = sesionPara(store, usuarioAsesorPrueba)
	r = handlers.SetupRouter(
		services.NewEventoService(store),
		services.NewSolicitudService(store, store),
		services.NewAuthService(store, store),
	)
	return
}

func TestRutasDeNegocioExigenSesion(t *testing.T) {
	r, _, _, _ := setupRolesRouter(t)
	rutas := []struct{ metodo, ruta string }{
		{http.MethodGet, "/eventos"},
		{http.MethodGet, "/eventos/1"},
		{http.MethodGet, "/adicionales"},
		{http.MethodGet, "/solicitudes"},
		{http.MethodPost, "/solicitudes"},
	}
	for _, rt := range rutas {
		if w := llamar(r, rt.metodo, rt.ruta, "", gin.H{}); w.Code != http.StatusUnauthorized {
			t.Errorf("%s %s sin sesión esperaba 401, obtuvo %d", rt.metodo, rt.ruta, w.Code)
		}
		if w := llamar(r, rt.metodo, rt.ruta, "token-falso", gin.H{}); w.Code != http.StatusUnauthorized {
			t.Errorf("%s %s con token falso esperaba 401, obtuvo %d", rt.metodo, rt.ruta, w.Code)
		}
	}
	if w := llamar(r, http.MethodGet, "/health", "", nil); w.Code != http.StatusOK {
		t.Errorf("/health debe seguir siendo público, obtuvo %d", w.Code)
	}
}

func idsDeEventos(t *testing.T, cuerpo []byte) []uint {
	t.Helper()
	var eventos []models.Evento
	if err := json.Unmarshal(cuerpo, &eventos); err != nil {
		t.Fatal(err)
	}
	ids := []uint{}
	for _, e := range eventos {
		ids = append(ids, e.ID)
	}
	return ids
}

func TestEventosFiltradosPorCliente(t *testing.T) {
	r, tokCli, tokSinCliente, tokAsesor := setupRolesRouter(t)

	if ids := idsDeEventos(t, llamar(r, http.MethodGet, "/eventos", tokCli, nil).Body.Bytes()); len(ids) != 1 || ids[0] != 1 {
		t.Errorf("CLI-001 debía ver solo el evento 1, vio %v", ids)
	}
	if ids := idsDeEventos(t, llamar(r, http.MethodGet, "/eventos", tokSinCliente, nil).Body.Bytes()); len(ids) != 0 {
		t.Errorf("un cliente sin cliente_id no debía ver eventos, vio %v", ids)
	}
	if ids := idsDeEventos(t, llamar(r, http.MethodGet, "/eventos", tokAsesor, nil).Body.Bytes()); len(ids) != 2 {
		t.Errorf("el asesor debía ver los 2 eventos, vio %v", ids)
	}

	// Detalle: propio 200; ajeno 404 (igual que inexistente); asesor 200
	if w := llamar(r, http.MethodGet, "/eventos/1", tokCli, nil); w.Code != http.StatusOK {
		t.Errorf("evento propio esperaba 200, obtuvo %d", w.Code)
	}
	ajeno := llamar(r, http.MethodGet, "/eventos/2", tokCli, nil)
	inexistente := llamar(r, http.MethodGet, "/eventos/999", tokCli, nil)
	if ajeno.Code != http.StatusNotFound || ajeno.Body.String() != inexistente.Body.String() {
		t.Errorf("evento ajeno debe ser indistinguible de uno inexistente: %d %s vs %d %s",
			ajeno.Code, ajeno.Body, inexistente.Code, inexistente.Body)
	}
	if w := llamar(r, http.MethodGet, "/eventos/2", tokAsesor, nil); w.Code != http.StatusOK {
		t.Errorf("el asesor debía ver el evento 2, obtuvo %d", w.Code)
	}
}

func TestSolicitudesFiltradasYProtegidasPorCliente(t *testing.T) {
	r, tokCli, _, tokAsesor := setupRolesRouter(t)

	solicitud := func(eventoID uint, motivo string) gin.H {
		return gin.H{
			"evento_id": eventoID, "motivo": motivo,
			"fecha_propuesta": "2026-12-01", "hora_inicio_propuesta": "10:00", "hora_fin_propuesta": "12:00",
		}
	}

	// El cliente no puede solicitar cambios sobre un evento ajeno
	if w := llamar(r, http.MethodPost, "/solicitudes", tokCli, solicitud(2, "intento ajeno")); w.Code != http.StatusNotFound {
		t.Fatalf("solicitud sobre evento ajeno esperaba 404, obtuvo %d: %s", w.Code, w.Body)
	}
	// Sobre el propio sí
	if w := llamar(r, http.MethodPost, "/solicitudes", tokCli, solicitud(1, "cambio propio")); w.Code != http.StatusCreated {
		t.Fatalf("solicitud propia esperaba 201, obtuvo %d: %s", w.Code, w.Body)
	}
	// El asesor crea una sobre el evento 2
	if w := llamar(r, http.MethodPost, "/solicitudes", tokAsesor, solicitud(2, "cambio del asesor")); w.Code != http.StatusCreated {
		t.Fatalf("solicitud del asesor esperaba 201, obtuvo %d: %s", w.Code, w.Body)
	}

	contar := func(token string) []models.Solicitud {
		var lista []models.Solicitud
		_ = json.Unmarshal(llamar(r, http.MethodGet, "/solicitudes", token, nil).Body.Bytes(), &lista)
		return lista
	}
	if l := contar(tokCli); len(l) != 1 || l[0].EventoID != 1 {
		t.Errorf("el cliente CLI-001 debía ver solo su solicitud, vio %+v", l)
	}
	if l := contar(tokAsesor); len(l) != 2 {
		t.Errorf("el asesor debía ver las 2 solicitudes, vio %d", len(l))
	}
}

// verificadorFalso simula la validación del ID token de Google: el "token" es "ok:<correo>:<verificado>:<nombre>".
type verificadorFalso struct{}

func (verificadorFalso) Verificar(_ context.Context, idToken string) (services.IdentidadGoogle, error) {
	partes := strings.Split(idToken, ":")
	if len(partes) != 4 || partes[0] != "ok" {
		return services.IdentidadGoogle{}, services.ErrTokenGoogleInvalido
	}
	return services.IdentidadGoogle{UID: "uid", Correo: partes[1], CorreoVerif: partes[2] == "si", Nombre: partes[3]}, nil
}

func setupGoogleRouter(t *testing.T, conVerificador bool) *gin.Engine {
	t.Helper()
	hash, _ := bcrypt.GenerateFromPassword([]byte("Secreta2026!"), bcrypt.MinCost)
	store := storage.NewMemoryStore()
	store.AgregarUsuario(models.Usuario{ID: 1, Correo: "asesor@showtech.com", Rol: models.RolAsesor, PasswordHash: string(hash)})
	auth := services.NewAuthService(store, store)
	if conVerificador {
		auth.ConVerificadorGoogle(verificadorFalso{})
	}
	return handlers.SetupRouter(services.NewEventoService(store), services.NewSolicitudService(store, store), auth)
}

func TestGoogleCreaClienteSinEventos(t *testing.T) {
	r := setupGoogleRouter(t, true)

	w := llamar(r, http.MethodPost, "/auth/google", "", gin.H{"id_token": "ok:Ana@Gmail.com:si:Ana Pérez"})
	if w.Code != http.StatusOK {
		t.Fatalf("esperaba 200, obtuvo %d: %s", w.Code, w.Body)
	}
	var ses models.RespuestaSesion
	_ = json.Unmarshal(w.Body.Bytes(), &ses)
	if ses.Token == "" || ses.Usuario.Rol != models.RolCliente || ses.Usuario.Proveedor != "google" ||
		ses.Usuario.ClienteID != "" || ses.Usuario.Correo != "ana@gmail.com" {
		t.Fatalf("sesión inesperada: %+v", ses)
	}

	// Sin cliente vinculado: no ve eventos, pero la sesión funciona
	w = llamar(r, http.MethodGet, "/eventos", ses.Token, nil)
	if w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != "[]" {
		t.Errorf("un usuario Google sin cliente debía ver [] y obtuvo %d %s", w.Code, w.Body)
	}

	// Segundo ingreso reutiliza la cuenta
	if w := llamar(r, http.MethodPost, "/auth/google", "", gin.H{"id_token": "ok:ana@gmail.com:si:Ana"}); w.Code != http.StatusOK {
		t.Errorf("segundo ingreso esperaba 200, obtuvo %d", w.Code)
	}
}

func TestGoogleRechazos(t *testing.T) {
	r := setupGoogleRouter(t, true)
	casos := []struct {
		nombre   string
		cuerpo   any
		esperado int
	}{
		{"token inválido", gin.H{"id_token": "basura"}, http.StatusUnauthorized},
		{"correo sin verificar", gin.H{"id_token": "ok:x@gmail.com:no:X"}, http.StatusUnauthorized},
		{"correo de una cuenta con contraseña (asesor)", gin.H{"id_token": "ok:asesor@showtech.com:si:Falso"}, http.StatusForbidden},
		{"falta id_token", gin.H{}, http.StatusBadRequest},
	}
	for _, c := range casos {
		if w := llamar(r, http.MethodPost, "/auth/google", "", c.cuerpo); w.Code != c.esperado {
			t.Errorf("%s: esperaba %d, obtuvo %d: %s", c.nombre, c.esperado, w.Code, w.Body)
		}
	}
}

func TestGoogleNoConfigurado(t *testing.T) {
	r := setupGoogleRouter(t, false)
	if w := llamar(r, http.MethodPost, "/auth/google", "", gin.H{"id_token": "ok:x@gmail.com:si:X"}); w.Code != http.StatusServiceUnavailable {
		t.Errorf("sin verificador esperaba 503, obtuvo %d", w.Code)
	}
}

func TestUsuarioGoogleNoPuedeEntrarPorContrasenaVacia(t *testing.T) {
	r := setupGoogleRouter(t, true)
	llamar(r, http.MethodPost, "/auth/google", "", gin.H{"id_token": "ok:ana@gmail.com:si:Ana"})
	if w := llamar(r, http.MethodPost, "/auth/login", "", gin.H{"correo": "ana@gmail.com", "password": "cualquiera"}); w.Code != http.StatusUnauthorized {
		t.Errorf("una cuenta de Google sin contraseña no debe poder entrar por /auth/login, obtuvo %d", w.Code)
	}
}

func TestRetirarSolicitud(t *testing.T) {
	r, tokCli, tokSinCliente, tokAsesor := setupRolesRouter(t)

	cuerpo := func(eventoID uint, motivo string) gin.H {
		return gin.H{
			"evento_id": eventoID, "motivo": motivo,
			"fecha_propuesta": "2026-12-01", "hora_inicio_propuesta": "10:00", "hora_fin_propuesta": "12:00",
		}
	}
	// El cliente CLI-001 crea una solicitud sobre su evento 1; el asesor crea otra sobre el evento 2 (de CLI-002)
	if w := llamar(r, http.MethodPost, "/solicitudes", tokCli, cuerpo(1, "primera")); w.Code != http.StatusCreated {
		t.Fatalf("crear solicitud propia: %d %s", w.Code, w.Body)
	}
	if w := llamar(r, http.MethodPost, "/solicitudes", tokAsesor, cuerpo(2, "del asesor")); w.Code != http.StatusCreated {
		t.Fatalf("crear solicitud del asesor: %d %s", w.Code, w.Body)
	}

	// Permisos y errores previos al retiro
	if w := llamar(r, http.MethodPost, "/solicitudes/1/retirar", "", nil); w.Code != http.StatusUnauthorized {
		t.Errorf("sin sesión esperaba 401, obtuvo %d", w.Code)
	}
	if w := llamar(r, http.MethodPost, "/solicitudes/1/retirar", tokAsesor, nil); w.Code != http.StatusForbidden {
		t.Errorf("el asesor no retira: esperaba 403, obtuvo %d", w.Code)
	}
	if w := llamar(r, http.MethodPost, "/solicitudes/1/retirar", tokSinCliente, nil); w.Code != http.StatusNotFound {
		t.Errorf("cliente ajeno esperaba 404, obtuvo %d", w.Code)
	}
	ajena := llamar(r, http.MethodPost, "/solicitudes/2/retirar", tokCli, nil)
	inexistente := llamar(r, http.MethodPost, "/solicitudes/999/retirar", tokCli, nil)
	if ajena.Code != http.StatusNotFound || ajena.Body.String() != inexistente.Body.String() {
		t.Errorf("solicitud ajena debe ser indistinguible de inexistente: %d %s vs %d %s", ajena.Code, ajena.Body, inexistente.Code, inexistente.Body)
	}
	for _, id := range []string{"abc", "0", "-1"} {
		if w := llamar(r, http.MethodPost, "/solicitudes/"+id+"/retirar", tokCli, nil); w.Code != http.StatusBadRequest {
			t.Errorf("id %q esperaba 400, obtuvo %d", id, w.Code)
		}
	}

	// Retiro correcto
	w := llamar(r, http.MethodPost, "/solicitudes/1/retirar", tokCli, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("retirar esperaba 200, obtuvo %d: %s", w.Code, w.Body)
	}
	var resp struct {
		Solicitud models.Solicitud `json:"solicitud"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Solicitud.Estado != models.EstadoRetiradaCliente || resp.Solicitud.FechaRetiro == "" {
		t.Errorf("estado/fecha de retiro inesperados: %+v", resp.Solicitud)
	}

	// Segundo retiro -> 409
	if w := llamar(r, http.MethodPost, "/solicitudes/1/retirar", tokCli, nil); w.Code != http.StatusConflict {
		t.Errorf("retirar dos veces esperaba 409, obtuvo %d", w.Code)
	}

	// La solicitud NO se elimina: sigue en el historial con su motivo y snapshots
	var lista []models.Solicitud
	_ = json.Unmarshal(llamar(r, http.MethodGet, "/solicitudes", tokCli, nil).Body.Bytes(), &lista)
	if len(lista) != 1 || lista[0].Motivo != "primera" || lista[0].DatosOriginales.Nombre == "" || lista[0].Estado != models.EstadoRetiradaCliente {
		t.Errorf("la solicitud retirada debía conservarse íntegra: %+v", lista)
	}

	// El evento queda libre: se puede registrar una nueva solicitud pendiente
	if w := llamar(r, http.MethodPost, "/solicitudes", tokCli, cuerpo(1, "segunda")); w.Code != http.StatusCreated {
		t.Errorf("tras retirar debía poder crear otra solicitud: %d %s", w.Code, w.Body)
	}
	// La reserva no cambió
	w = llamar(r, http.MethodGet, "/eventos/1", tokCli, nil)
	if !strings.Contains(w.Body.String(), `"hora_inicio":"09:00"`) {
		t.Errorf("retirar no debe modificar la reserva: %s", w.Body)
	}
}
