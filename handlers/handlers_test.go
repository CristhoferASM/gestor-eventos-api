package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"gestor-eventos-api/handlers"
	"gestor-eventos-api/models"
	"gestor-eventos-api/services"
	"gestor-eventos-api/storage"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// routerConSesion agrega automáticamente un token de asesor a las peticiones que no traen Authorization,
// para que las pruebas de negocio no repitan el login en cada llamada.
type routerConSesion struct {
	*gin.Engine
	token string
}

func (r routerConSesion) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	if req.Header.Get("Authorization") == "" {
		req.Header.Set("Authorization", "Bearer "+r.token)
	}
	r.Engine.ServeHTTP(w, req)
}

// sesionPara registra al usuario y una sesión vigente en el almacén y devuelve su token.
func sesionPara(store *storage.Store, u models.Usuario) string {
	store.AgregarUsuario(u)
	token := "token-" + u.Correo
	_ = store.GuardarSesion(context.Background(), models.Sesion{
		Token: token, Correo: u.Correo, ExpiraEn: time.Now().Add(time.Hour),
	})
	return token
}

var usuarioAsesorPrueba = models.Usuario{ID: 100, Correo: "asesor@prueba.test", Nombre: "Asesor", Rol: models.RolAsesor}

func setupTestRouter() (routerConSesion, *storage.Store) {
	store := storage.NewMemoryStore()
	token := sesionPara(store, usuarioAsesorPrueba)
	eventoService := services.NewEventoService(store)
	solicitudService := services.NewSolicitudService(store, store)
	authService := services.NewAuthService(store, store)
	r := handlers.SetupRouter(eventoService, solicitudService, authService)
	return routerConSesion{Engine: r, token: token}, store
}

type repoFalloHTTP struct {
	errEventos        error
	errEventoPorID    error
	errSolicitudes    error
	errCrearSolicitud error
	base              *storage.Store
}

func (r *repoFalloHTTP) RetirarSolicitud(ctx context.Context, id uint, fecha string) (models.Solicitud, error) {
	return r.base.RetirarSolicitud(ctx, id, fecha)
}

func (r *repoFalloHTTP) ObtenerEventos(ctx context.Context) ([]models.Evento, error) {
	if r.errEventos != nil {
		return nil, r.errEventos
	}
	return r.base.ObtenerEventos(ctx)
}

func (r *repoFalloHTTP) ObtenerEventoPorID(ctx context.Context, id uint) (models.Evento, error) {
	if r.errEventoPorID != nil {
		return models.Evento{}, r.errEventoPorID
	}
	return r.base.ObtenerEventoPorID(ctx, id)
}

func (r *repoFalloHTTP) ObtenerSolicitudes(ctx context.Context) ([]models.Solicitud, error) {
	if r.errSolicitudes != nil {
		return nil, r.errSolicitudes
	}
	return r.base.ObtenerSolicitudes(ctx)
}

func (r *repoFalloHTTP) CrearSolicitud(ctx context.Context, sol models.Solicitud) (models.Solicitud, error) {
	if r.errCrearSolicitud != nil {
		return models.Solicitud{}, r.errCrearSolicitud
	}
	return r.base.CrearSolicitud(ctx, sol)
}

// 1. Prueba de GET /health
func TestHealth(t *testing.T) {
	r, _ := setupTestRouter()
	req, _ := http.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("se esperaba código 200, se obtuvo %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("error al deserializar respuesta: %v", err)
	}

	if resp["status"] != "UP" {
		t.Errorf("se esperaba status UP, se obtuvo %v", resp["status"])
	}
}

// 2. Prueba de GET /eventos
func TestListarEventos(t *testing.T) {
	r, _ := setupTestRouter()
	req, _ := http.NewRequest(http.MethodGet, "/eventos", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("se esperaba código 200, se obtuvo %d", w.Code)
	}

	var eventos []models.Evento
	if err := json.Unmarshal(w.Body.Bytes(), &eventos); err != nil {
		t.Fatalf("error al parsear eventos: %v", err)
	}

	if len(eventos) != 2 {
		t.Errorf("se esperaban 2 eventos iniciales, se obtuvieron %d", len(eventos))
	}
}

// 3. Prueba de GET /eventos/:id (existente, inexistente, inválido y cero)
func TestDetalleEvento(t *testing.T) {
	r, _ := setupTestRouter()

	// Caso existente
	reqEx, _ := http.NewRequest(http.MethodGet, "/eventos/1", nil)
	wEx := httptest.NewRecorder()
	r.ServeHTTP(wEx, reqEx)

	if wEx.Code != http.StatusOK {
		t.Fatalf("se esperaba 200 para evento 1, se obtuvo %d", wEx.Code)
	}

	// Caso inexistente
	reqInex, _ := http.NewRequest(http.MethodGet, "/eventos/999", nil)
	wInex := httptest.NewRecorder()
	r.ServeHTTP(wInex, reqInex)

	if wInex.Code != http.StatusNotFound {
		t.Fatalf("se esperaba 404 para evento 999, se obtuvo %d", wInex.Code)
	}

	// Casos de ID inválido y cero (400 Bad Request)
	for _, idInvalido := range []string{"0", "abc", "-5"} {
		reqInv, _ := http.NewRequest(http.MethodGet, "/eventos/"+idInvalido, nil)
		wInv := httptest.NewRecorder()
		r.ServeHTTP(wInv, reqInv)

		if wInv.Code != http.StatusBadRequest {
			t.Errorf("para /eventos/%s se esperaba 400, se obtuvo %d", idInvalido, wInv.Code)
		}
	}
}

// 4. Prueba del registro correcto de una solicitud (201 Created)
func TestCrearSolicitudExito(t *testing.T) {
	r, _ := setupTestRouter()

	payload := map[string]interface{}{
		"evento_id":             1,
		"motivo":                "Ajuste por disponibilidad del conferencista principal",
		"fecha_propuesta":       "2026-11-18",
		"hora_inicio_propuesta": "10:00",
		"hora_fin_propuesta":    "14:00", "tiempos_tecnicos_propuestos": gin.H{},
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPost, "/solicitudes", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("se esperaba código 201, se obtuvo %d. Respuesta: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Mensaje   string           `json:"mensaje"`
		Solicitud models.Solicitud `json:"solicitud"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("error deserializando respuesta: %v", err)
	}

	if resp.Solicitud.ID == 0 {
		t.Errorf("se esperaba un ID asignado > 0, se obtuvo %d", resp.Solicitud.ID)
	}
	if resp.Solicitud.Estado != "Pendiente de revisión" {
		t.Errorf("se esperaba estado 'Pendiente de revisión', se obtuvo %s", resp.Solicitud.Estado)
	}
	if resp.Solicitud.DatosOriginales.Fecha != "2026-11-15" {
		t.Errorf("fecha original incorrecta: %s", resp.Solicitud.DatosOriginales.Fecha)
	}
	if resp.Solicitud.DatosPropuestos.Fecha != "2026-11-18" {
		t.Errorf("fecha propuesta incorrecta: %s", resp.Solicitud.DatosPropuestos.Fecha)
	}
}

// 5. Pruebas de validación: horarios inválidos, formato estricto de horas, fecha incorrecta, sin cambios, motivo vacío y límite Unicode
func TestCrearSolicitudValidaciones(t *testing.T) {
	casos := []struct {
		nombre       string
		payload      map[string]interface{}
		esperadoCode int
	}{
		{
			nombre: "Inicio posterior a Fin",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                "Horario invertido de prueba",
				"fecha_propuesta":       "2026-11-16",
				"hora_inicio_propuesta": "16:00",
				"hora_fin_propuesta":    "12:00", "tiempos_tecnicos_propuestos": gin.H{},
			},
			esperadoCode: http.StatusBadRequest,
		},
		{
			nombre: "Horario antes de 06:00",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                "Muy temprano",
				"fecha_propuesta":       "2026-11-16",
				"hora_inicio_propuesta": "05:00",
				"hora_fin_propuesta":    "09:00", "tiempos_tecnicos_propuestos": gin.H{},
			},
			esperadoCode: http.StatusBadRequest,
		},
		{
			nombre: "Horario después de 22:00",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                "Muy tarde",
				"fecha_propuesta":       "2026-11-16",
				"hora_inicio_propuesta": "20:00",
				"hora_fin_propuesta":    "23:00", "tiempos_tecnicos_propuestos": gin.H{},
			},
			esperadoCode: http.StatusBadRequest,
		},
		{
			nombre: "Hora en formato HH sin minutos (09)",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                "Hora incompleta",
				"fecha_propuesta":       "2026-11-16",
				"hora_inicio_propuesta": "09",
				"hora_fin_propuesta":    "12:00", "tiempos_tecnicos_propuestos": gin.H{},
			},
			esperadoCode: http.StatusBadRequest,
		},
		{
			nombre: "Hora con un solo dígito (9:00)",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                "Hora sin cero inicial",
				"fecha_propuesta":       "2026-11-16",
				"hora_inicio_propuesta": "9:00",
				"hora_fin_propuesta":    "12:00", "tiempos_tecnicos_propuestos": gin.H{},
			},
			esperadoCode: http.StatusBadRequest,
		},
		{
			nombre: "Minuto con un solo dígito (09:0)",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                "Minuto incompleto",
				"fecha_propuesta":       "2026-11-16",
				"hora_inicio_propuesta": "09:0",
				"hora_fin_propuesta":    "12:00", "tiempos_tecnicos_propuestos": gin.H{},
			},
			esperadoCode: http.StatusBadRequest,
		},
		{
			nombre: "Hora con segundos (09:00:00)",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                "Formato con segundos",
				"fecha_propuesta":       "2026-11-16",
				"hora_inicio_propuesta": "09:00:00",
				"hora_fin_propuesta":    "12:00", "tiempos_tecnicos_propuestos": gin.H{},
			},
			esperadoCode: http.StatusBadRequest,
		},
		{
			nombre: "Hora inexistente (25:00)",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                "Hora fuera de reloj",
				"fecha_propuesta":       "2026-11-16",
				"hora_inicio_propuesta": "09:00",
				"hora_fin_propuesta":    "25:00", "tiempos_tecnicos_propuestos": gin.H{},
			},
			esperadoCode: http.StatusBadRequest,
		},
		{
			nombre: "Límites exactos válidos 06:00 y 22:00 y 09:05",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                "Dentro de límites exactos",
				"fecha_propuesta":       "2026-11-16",
				"hora_inicio_propuesta": "06:00",
				"hora_fin_propuesta":    "22:00", "tiempos_tecnicos_propuestos": gin.H{},
			},
			esperadoCode: http.StatusCreated,
		},
		{
			nombre: "Fecha con formato inválido",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                "Fecha mal formateada",
				"fecha_propuesta":       "16-11-2026",
				"hora_inicio_propuesta": "09:00",
				"hora_fin_propuesta":    "12:00", "tiempos_tecnicos_propuestos": gin.H{},
			},
			esperadoCode: http.StatusBadRequest,
		},
		{
			nombre: "Motivo solo espacios",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                "     ",
				"fecha_propuesta":       "2026-11-16",
				"hora_inicio_propuesta": "09:00",
				"hora_fin_propuesta":    "12:00", "tiempos_tecnicos_propuestos": gin.H{},
			},
			esperadoCode: http.StatusBadRequest,
		},
		{
			nombre: "Motivo de exactamente 400 caracteres Unicode (válido)",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                strings.Repeat("ó", 400),
				"fecha_propuesta":       "2026-11-16",
				"hora_inicio_propuesta": "09:05",
				"hora_fin_propuesta":    "12:00", "tiempos_tecnicos_propuestos": gin.H{},
			},
			esperadoCode: http.StatusCreated,
		},
		{
			nombre: "Motivo superior a 400 caracteres Unicode (401)",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                strings.Repeat("ó", 401),
				"fecha_propuesta":       "2026-11-16",
				"hora_inicio_propuesta": "09:00",
				"hora_fin_propuesta":    "12:00", "tiempos_tecnicos_propuestos": gin.H{},
			},
			esperadoCode: http.StatusBadRequest,
		},
		{
			nombre: "Sin cambios respecto al evento original",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                "Repitiendo mismos datos",
				"fecha_propuesta":       "2026-11-15",
				"hora_inicio_propuesta": "09:00",
				"hora_fin_propuesta":    "13:00",
			},
			esperadoCode: http.StatusBadRequest,
		},
	}

	for _, tc := range casos {
		t.Run(tc.nombre, func(t *testing.T) {
			r, _ := setupTestRouter()
			body, _ := json.Marshal(tc.payload)
			req, _ := http.NewRequest(http.MethodPost, "/solicitudes", bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != tc.esperadoCode {
				t.Errorf("caso '%s': se esperaba código %d, se obtuvo %d. Respuesta: %s",
					tc.nombre, tc.esperadoCode, w.Code, w.Body.String())
			}
		})
	}
}

// 6. Prueba de evento inexistente (404)
func TestCrearSolicitudEventoInexistente(t *testing.T) {
	r, _ := setupTestRouter()

	payload := map[string]interface{}{
		"evento_id":             999,
		"motivo":                "Evento que no existe",
		"fecha_propuesta":       "2026-11-25",
		"hora_inicio_propuesta": "10:00",
		"hora_fin_propuesta":    "12:00",
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPost, "/solicitudes", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("se esperaba código 404 para evento inexistente, se obtuvo %d", w.Code)
	}
}

// 7. Prueba de bloqueo de segunda solicitud pendiente para un mismo evento (409 Conflict)
func TestBloquearSegundaSolicitudPendiente(t *testing.T) {
	r, _ := setupTestRouter()

	payload1 := map[string]interface{}{
		"evento_id":             2,
		"motivo":                "Primera solicitud de cambio",
		"fecha_propuesta":       "2026-11-21",
		"hora_inicio_propuesta": "15:00",
		"hora_fin_propuesta":    "19:00",
	}
	body1, _ := json.Marshal(payload1)
	req1, _ := http.NewRequest(http.MethodPost, "/solicitudes", bytes.NewBuffer(body1))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req1)

	if w1.Code != http.StatusCreated {
		t.Fatalf("la primera solicitud debió crearse (201), obtuvo %d", w1.Code)
	}

	// Segunda solicitud para el mismo evento 2
	payload2 := map[string]interface{}{
		"evento_id":             2,
		"motivo":                "Segunda solicitud concurrente o posterior",
		"fecha_propuesta":       "2026-11-22",
		"hora_inicio_propuesta": "10:00",
		"hora_fin_propuesta":    "12:00",
	}
	body2, _ := json.Marshal(payload2)
	req2, _ := http.NewRequest(http.MethodPost, "/solicitudes", bytes.NewBuffer(body2))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusConflict {
		t.Fatalf("se esperaba código 409 (Conflict) para la segunda solicitud, se obtuvo %d. Respuesta: %s",
			w2.Code, w2.Body.String())
	}
}

// 8. Prueba de conservación del evento original (no se altera al registrar solicitudes)
func TestConservacionEventoOriginal(t *testing.T) {
	r, store := setupTestRouter()
	ctx := context.Background()

	eventoOriginal, err := store.ObtenerEventoPorID(ctx, 1)
	if err != nil {
		t.Fatalf("el evento 1 debe existir: %v", err)
	}

	payload := map[string]interface{}{
		"evento_id":             1,
		"motivo":                "Solicitud para cambiar de fecha y hora",
		"fecha_propuesta":       "2026-11-28",
		"hora_inicio_propuesta": "08:00",
		"hora_fin_propuesta":    "11:00", "tiempos_tecnicos_propuestos": gin.H{},
	}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest(http.MethodPost, "/solicitudes", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("se esperaba 201 Created, se obtuvo %d", w.Code)
	}

	// Consultar el evento original tras crear la solicitud
	eventoDespues, _ := store.ObtenerEventoPorID(ctx, 1)

	if eventoDespues.Fecha != eventoOriginal.Fecha {
		t.Errorf("la fecha original fue modificada! Antes: %s, Ahora: %s",
			eventoOriginal.Fecha, eventoDespues.Fecha)
	}
	if eventoDespues.HoraInicio != eventoOriginal.HoraInicio || eventoDespues.HoraFin != eventoOriginal.HoraFin {
		t.Errorf("los horarios del evento original fueron modificados!")
	}
	if eventoDespues.Estado != eventoOriginal.Estado {
		t.Errorf("el estado del evento original fue alterado!")
	}
}

// 9. Prueba de arrays vacíos en GET /solicitudes y GET /eventos
func TestListasVaciasDevuelvenArrayJSON(t *testing.T) {
	emptyStore := storage.NewEmptyMemoryStore()
	token := sesionPara(emptyStore, usuarioAsesorPrueba)
	r := routerConSesion{Engine: handlers.SetupRouter(
		services.NewEventoService(emptyStore),
		services.NewSolicitudService(emptyStore, emptyStore),
		services.NewAuthService(emptyStore, emptyStore),
	), token: token}

	for _, endpoint := range []string{"/eventos", "/solicitudes"} {
		req, _ := http.NewRequest(http.MethodGet, endpoint, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("en %s se esperaba 200, se obtuvo %d", endpoint, w.Code)
		}
		if strings.TrimSpace(w.Body.String()) != "[]" {
			t.Errorf("en %s se esperaba '[]', se obtuvo %q", endpoint, w.Body.String())
		}
	}
}

// 10. Prueba de fallo simulado del repositorio y respuesta 500 sin exponer detalles internos
func TestFalloSimuladoRepositorioRespuesta500(t *testing.T) {
	detalleSecreto := "error crítico sql: credenciales rechazadas en host interno"
	errInterno := errors.New(detalleSecreto)

	repoFallo := &repoFalloHTTP{
		errEventos:        errInterno,
		errEventoPorID:    errInterno,
		errSolicitudes:    errInterno,
		errCrearSolicitud: errInterno,
		base:              storage.NewMemoryStore(),
	}

	storeAuth := storage.NewMemoryStore()
	token := sesionPara(storeAuth, usuarioAsesorPrueba)
	r := routerConSesion{Engine: handlers.SetupRouter(
		services.NewEventoService(repoFallo),
		services.NewSolicitudService(storage.NewMemoryStore(), repoFallo),
		services.NewAuthService(storeAuth, storeAuth),
	), token: token}

	// GET /eventos -> 500
	reqEv, _ := http.NewRequest(http.MethodGet, "/eventos", nil)
	wEv := httptest.NewRecorder()
	r.ServeHTTP(wEv, reqEv)
	if wEv.Code != http.StatusInternalServerError {
		t.Errorf("GET /eventos esperaba 500, obtuvo %d", wEv.Code)
	}
	if strings.Contains(wEv.Body.String(), detalleSecreto) {
		t.Errorf("GET /eventos filtró detalles internos en la respuesta 500: %s", wEv.Body.String())
	}

	// GET /eventos/1 -> 500
	reqDet, _ := http.NewRequest(http.MethodGet, "/eventos/1", nil)
	wDet := httptest.NewRecorder()
	r.ServeHTTP(wDet, reqDet)
	if wDet.Code != http.StatusInternalServerError {
		t.Errorf("GET /eventos/1 esperaba 500, obtuvo %d", wDet.Code)
	}
	if strings.Contains(wDet.Body.String(), detalleSecreto) {
		t.Errorf("GET /eventos/1 filtró detalles internos en la respuesta 500: %s", wDet.Body.String())
	}

	// GET /solicitudes -> 500
	reqSol, _ := http.NewRequest(http.MethodGet, "/solicitudes", nil)
	wSol := httptest.NewRecorder()
	r.ServeHTTP(wSol, reqSol)
	if wSol.Code != http.StatusInternalServerError {
		t.Errorf("GET /solicitudes esperaba 500, obtuvo %d", wSol.Code)
	}
	if strings.Contains(wSol.Body.String(), detalleSecreto) {
		t.Errorf("GET /solicitudes filtró detalles internos en la respuesta 500: %s", wSol.Body.String())
	}

	// POST /solicitudes -> 500
	payload := map[string]interface{}{
		"evento_id":             1,
		"motivo":                "Prueba fallo interno al guardar",
		"fecha_propuesta":       "2026-11-28",
		"hora_inicio_propuesta": "08:00",
		"hora_fin_propuesta":    "11:00", "tiempos_tecnicos_propuestos": gin.H{},
	}
	body, _ := json.Marshal(payload)
	reqPost, _ := http.NewRequest(http.MethodPost, "/solicitudes", bytes.NewBuffer(body))
	reqPost.Header.Set("Content-Type", "application/json")
	wPost := httptest.NewRecorder()
	r.ServeHTTP(wPost, reqPost)
	if wPost.Code != http.StatusInternalServerError {
		t.Errorf("POST /solicitudes esperaba 500, obtuvo %d", wPost.Code)
	}
	if strings.Contains(wPost.Body.String(), detalleSecreto) {
		t.Errorf("POST /solicitudes filtró detalles internos en la respuesta 500: %s", wPost.Body.String())
	}
}

// 11. Prueba de creaciones concurrentes vía HTTP para un mismo evento
func TestCreacionConcurrenteHTTP(t *testing.T) {
	r, store := setupTestRouter()

	const totalPeticiones = 15
	var wg sync.WaitGroup
	wg.Add(totalPeticiones)

	inicio := make(chan struct{})
	codigos := make(chan int, totalPeticiones)

	payload := map[string]interface{}{
		"evento_id":             1,
		"motivo":                "Solicitud concurrente vía HTTP",
		"fecha_propuesta":       "2026-11-28",
		"hora_inicio_propuesta": "09:00",
		"hora_fin_propuesta":    "12:00", "tiempos_tecnicos_propuestos": gin.H{},
	}
	bodyBytes, _ := json.Marshal(payload)

	for i := 0; i < totalPeticiones; i++ {
		go func() {
			defer wg.Done()
			<-inicio

			req, _ := http.NewRequest(http.MethodPost, "/solicitudes", bytes.NewBuffer(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			codigos <- w.Code
		}()
	}

	close(inicio)
	wg.Wait()
	close(codigos)

	creadas := 0
	conflictos := 0
	for code := range codigos {
		switch code {
		case http.StatusCreated:
			creadas++
		case http.StatusConflict:
			conflictos++
		default:
			t.Errorf("código HTTP inesperado en petición concurrente: %d", code)
		}
	}

	if creadas != 1 {
		t.Errorf("se esperaba exactamente 1 respuesta 201 Created, se obtuvieron %d", creadas)
	}
	if conflictos != totalPeticiones-1 {
		t.Errorf("se esperaban %d respuestas 409 Conflict, se obtuvieron %d", totalPeticiones-1, conflictos)
	}

	solicitudes, err := store.ObtenerSolicitudes(context.Background())
	if err != nil {
		t.Fatalf("error obteniendo solicitudes almacenadas: %v", err)
	}
	if len(solicitudes) != 1 {
		t.Errorf("se esperaba 1 única solicitud en memoria, se encontraron %d", len(solicitudes))
	}
} // 12. Prueba de integración real entre handlers, servicios y almacenamiento
// Verifica: envío con cambios de contacto, teléfono, correo y horario, validación en respuesta POST,
// consulta posterior vía GET /solicitudes con los mismos valores, e integridad del evento original.
func TestCrearYListarSolicitudConInformacionGeneralHTTP(t *testing.T) {
	r, store := setupTestRouter()
	ctx := context.Background()
	ev1, _ := store.ObtenerEventoPorID(ctx, 1)

	// 1) Enviar propuesta con cambios de contacto, teléfono, correo y horario
	payload := map[string]interface{}{
		"evento_id":             1,
		"motivo":                "Cambio integral de contacto y extensión de horario",
		"fecha_propuesta":       ev1.Fecha,
		"hora_inicio_propuesta": "10:00",
		"hora_fin_propuesta":    "14:00", "tiempos_tecnicos_propuestos": gin.H{},
		"informacion_general_propuesta": map[string]interface{}{
			"nombre":        ev1.Nombre,
			"contacto":      "Cristhofer",
			"telefono":      "999000993",
			"correo":        "prueba@gmail.com",
			"observaciones": "Requerimientos audiovisuales adicionales",
		},
	}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest(http.MethodPost, "/solicitudes", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("se esperaba 201 Created, se obtuvo %d: %s", w.Code, w.Body.String())
	}

	// 2) Comprobar esos valores directamente en la respuesta del POST
	var respPost struct {
		Mensaje   string           `json:"mensaje"`
		Solicitud models.Solicitud `json:"solicitud"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &respPost); err != nil {
		t.Fatalf("error deserializando respuesta del POST: %v", err)
	}
	postSol := respPost.Solicitud
	if postSol.DatosPropuestos.Contacto != "Cristhofer" {
		t.Errorf("POST: contacto propuesto esperado 'Cristhofer', obtenido %q", postSol.DatosPropuestos.Contacto)
	}
	if postSol.DatosPropuestos.Telefono != "999000993" {
		t.Errorf("POST: teléfono propuesto esperado '999000993', obtenido %q", postSol.DatosPropuestos.Telefono)
	}
	if postSol.DatosPropuestos.Correo != "prueba@gmail.com" {
		t.Errorf("POST: correo propuesto esperado 'prueba@gmail.com', obtenido %q", postSol.DatosPropuestos.Correo)
	}
	if postSol.DatosPropuestos.HoraInicio != "10:00" || postSol.DatosPropuestos.HoraFin != "14:00" {
		t.Errorf("POST: horario propuesto esperado 10:00-14:00, obtenido %s-%s", postSol.DatosPropuestos.HoraInicio, postSol.DatosPropuestos.HoraFin)
	}
	if postSol.DatosOriginales.Nombre != ev1.Nombre || postSol.DatosOriginales.Contacto != ev1.Contacto {
		t.Errorf("POST: datos originales en snapshot no coinciden con evento 1: %+v", postSol.DatosOriginales)
	}

	// 3) Consultar GET /solicitudes y comprobar que conserva exactamente los mismos valores
	reqGet, _ := http.NewRequest(http.MethodGet, "/solicitudes", nil)
	wGet := httptest.NewRecorder()
	r.ServeHTTP(wGet, reqGet)

	if wGet.Code != http.StatusOK {
		t.Fatalf("se esperaba 200 OK en GET /solicitudes, se obtuvo %d", wGet.Code)
	}

	var lista []models.Solicitud
	if err := json.Unmarshal(wGet.Body.Bytes(), &lista); err != nil {
		t.Fatalf("error deserializando GET /solicitudes: %v", err)
	}
	if len(lista) != 1 {
		t.Fatalf("se esperaba 1 solicitud en el listado, se obtuvieron %d", len(lista))
	}

	getSol := lista[0]
	if getSol.DatosPropuestos.Contacto != "Cristhofer" || getSol.DatosPropuestos.Telefono != "999000993" || getSol.DatosPropuestos.Correo != "prueba@gmail.com" {
		t.Errorf("GET: datos propuestos no coinciden con los registrados: %+v", getSol.DatosPropuestos)
	}
	if getSol.DatosPropuestos.HoraInicio != "10:00" || getSol.DatosPropuestos.HoraFin != "14:00" {
		t.Errorf("GET: horario propuesto no coincide: %s-%s", getSol.DatosPropuestos.HoraInicio, getSol.DatosPropuestos.HoraFin)
	}
	if getSol.DatosOriginales.Nombre != ev1.Nombre || getSol.DatosOriginales.Contacto != ev1.Contacto {
		t.Errorf("GET: snapshot original no coincide: %+v", getSol.DatosOriginales)
	}

	// 4) Verificar que el evento original sigue intacto
	evDespues, _ := store.ObtenerEventoPorID(ctx, 1)
	if !reflect.DeepEqual(evDespues, ev1) {
		t.Errorf("el evento 1 fue modificado tras registrar solicitud: %+v vs %+v", evDespues, ev1)
	}
}

// 12. Prueba de integración de tiempos técnicos (montaje, desmontaje y ensayo) end-to-end
func TestCrearYListarSolicitudConTiemposTecnicosHTTP(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r, store := setupTestRouter()
	ctx := context.Background()

	ev1, err := store.ObtenerEventoPorID(ctx, 1)
	if err != nil {
		t.Fatalf("error obteniendo evento 1: %v", err)
	}

	payload := map[string]interface{}{
		"evento_id":             1,
		"motivo":                "Añadir ensayo previo y extender montaje técnico",
		"fecha_propuesta":       ev1.Fecha,
		"hora_inicio_propuesta": "09:00",
		"hora_fin_propuesta":    "13:00",
		"tiempos_tecnicos_propuestos": map[string]interface{}{
			"has_ensayo":             true,
			"ensayo_fecha":           ev1.Fecha,
			"ensayo_hora_inicio":     "06:30",
			"ensayo_hora_fin":        "07:30",
			"has_montaje":            true,
			"montaje_fecha":          ev1.Fecha,
			"montaje_hora_inicio":    "07:30",
			"montaje_hora_fin":       "09:00",
			"has_desmontaje":         true,
			"desmontaje_fecha":       ev1.Fecha,
			"desmontaje_hora_inicio": "13:00",
			"desmontaje_hora_fin":    "14:00",
		},
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest(http.MethodPost, "/solicitudes", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("POST /solicitudes esperaba 201, obtuvo %d: %s", w.Code, w.Body.String())
	}

	// Consultar GET /solicitudes y verificar snapshots completos
	reqGet, _ := http.NewRequest(http.MethodGet, "/solicitudes", nil)
	wGet := httptest.NewRecorder()
	r.ServeHTTP(wGet, reqGet)

	if wGet.Code != http.StatusOK {
		t.Fatalf("GET /solicitudes esperaba 200, obtuvo %d", wGet.Code)
	}

	var lista []models.Solicitud
	if err := json.Unmarshal(wGet.Body.Bytes(), &lista); err != nil {
		t.Fatalf("error parseando JSON: %v", err)
	}
	if len(lista) != 1 {
		t.Fatalf("se esperaba 1 solicitud, se obtuvieron %d", len(lista))
	}

	sol := lista[0]
	// Verificar snapshot original
	if !sol.DatosOriginales.HasMontaje || sol.DatosOriginales.MontajeHoraInicio != "08:00" {
		t.Errorf("snapshot original de montaje incorrecto: %+v", sol.DatosOriginales)
	}
	if sol.DatosOriginales.HasEnsayo {
		t.Errorf("snapshot original no debería tener ensayo: %+v", sol.DatosOriginales)
	}

	// Verificar snapshot propuesto
	if !sol.DatosPropuestos.HasEnsayo || sol.DatosPropuestos.EnsayoHoraInicio != "06:30" || sol.DatosPropuestos.EnsayoHoraFin != "07:30" {
		t.Errorf("snapshot propuesto de ensayo incorrecto: %+v", sol.DatosPropuestos)
	}
	if !sol.DatosPropuestos.HasMontaje || sol.DatosPropuestos.MontajeHoraInicio != "07:30" || sol.DatosPropuestos.MontajeHoraFin != "09:00" {
		t.Errorf("snapshot propuesto de montaje incorrecto: %+v", sol.DatosPropuestos)
	}
}

// 13. Prueba de GET /adicionales
func TestListarCatalogoAdicionalesHTTP(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r, _ := setupTestRouter()

	req, _ := http.NewRequest(http.MethodGet, "/adicionales", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("se esperaba código 200 para catálogo de adicionales, se obtuvo %d", w.Code)
	}

	var catalogo []models.AdicionalCatalogo
	if err := json.Unmarshal(w.Body.Bytes(), &catalogo); err != nil {
		t.Fatalf("error al deserializar catálogo de adicionales: %v", err)
	}

	if len(catalogo) != 5 {
		t.Errorf("se esperaban 5 ítems en el catálogo de adicionales, se obtuvieron %d", len(catalogo))
	}
}

// 14. Prueba de integración de adicionales en POST y GET /solicitudes
func TestCrearYListarSolicitudConAdicionalesHTTP(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r, _ := setupTestRouter()

	propAdicionales := []models.AdicionalPropuestoDTO{
		{ID: "cochera", Cantidad: 2, Horas: 4},
		{ID: "teleprompter", Cantidad: 1, Horas: 3},
	}

	payload := map[string]interface{}{
		"evento_id":              1,
		"motivo":                 "Se requiere teleprompter para el ponente principal y 2 cocheras",
		"fecha_propuesta":        "2026-11-15",
		"hora_inicio_propuesta":  "09:00",
		"hora_fin_propuesta":     "13:00",
		"adicionales_propuestos": propAdicionales,
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest(http.MethodPost, "/solicitudes", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("se esperaba 201 Created al registrar solicitud con adicionales, se obtuvo %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Mensaje   string           `json:"mensaje"`
		Solicitud models.Solicitud `json:"solicitud"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("error al parsear respuesta: %v", err)
	}

	sol := resp.Solicitud
	if len(sol.DatosOriginales.Adicionales) != 1 {
		t.Errorf("adicionales originales esperados: 1, obtenidos: %d", len(sol.DatosOriginales.Adicionales))
	}
	if len(sol.DatosPropuestos.Adicionales) != 2 {
		t.Errorf("adicionales propuestos esperados: 2, obtenidos: %d", len(sol.DatosPropuestos.Adicionales))
	}

	// Verificar cálculo seguro en backend: Cochera 2 un * 4 h * 10 = 80; Teleprompter 1 un * 3 h * 10 = 30
	var subtotalCochera, subtotalTeleprompter float64
	for _, a := range sol.DatosPropuestos.Adicionales {
		if a.ID == "cochera" {
			subtotalCochera = a.Subtotal
		} else if a.ID == "teleprompter" {
			subtotalTeleprompter = a.Subtotal
		}
	}
	if subtotalCochera != 80.0 {
		t.Errorf("subtotal cochera esperado 80.0, obtenido %v", subtotalCochera)
	}
	if subtotalTeleprompter != 30.0 {
		t.Errorf("subtotal teleprompter esperado 30.0, obtenido %v", subtotalTeleprompter)
	}

	// Consultar GET /solicitudes y verificar que persisten los snapshots
	reqGet, _ := http.NewRequest(http.MethodGet, "/solicitudes", nil)
	wGet := httptest.NewRecorder()
	r.ServeHTTP(wGet, reqGet)

	if wGet.Code != http.StatusOK {
		t.Fatalf("se esperaba 200 en GET /solicitudes, obtenido %d", wGet.Code)
	}

	var lista []models.Solicitud
	if err := json.Unmarshal(wGet.Body.Bytes(), &lista); err != nil {
		t.Fatalf("error parseando solicitudes: %v", err)
	}

	if len(lista) == 0 {
		t.Fatalf("se esperaba al menos 1 solicitud en listado")
	}
	solGuardada := lista[len(lista)-1]
	if len(solGuardada.DatosPropuestos.Adicionales) != 2 {
		t.Errorf("adicionales propuestos en GET esperados: 2, obtenidos: %d", len(solGuardada.DatosPropuestos.Adicionales))
	}
}

func TestAdicionalesHTTPCasoConcreto(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r, store := setupTestRouter()
	ctx := context.Background()

	ev1, err := store.ObtenerEventoPorID(ctx, 1)
	if err != nil {
		t.Fatalf("error obteniendo evento 1: %v", err)
	}

	payload := map[string]interface{}{
		"evento_id":             1,
		"motivo":                "Ajuste completo de adicionales para el auditorio",
		"fecha_propuesta":       ev1.Fecha,
		"hora_inicio_propuesta": ev1.HoraInicio,
		"hora_fin_propuesta":    ev1.HoraFin,
		"adicionales_propuestos": []map[string]interface{}{
			{"id": "pantalla_led_5x4", "cantidad": 1, "horas": 1},
			{"id": "microfono", "cantidad": 2, "horas": 1},
			{"id": "cochera", "cantidad": 5, "horas": 1},
		},
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest(http.MethodPost, "/solicitudes", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("se esperaba 201 Created, obtenido %d: %s", w.Code, w.Body.String())
	}

	var res struct {
		Mensaje   string           `json:"mensaje"`
		Solicitud models.Solicitud `json:"solicitud"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("error parseando respuesta: %v", err)
	}

	// 1) Validar snapshot original: 1 Cochera S/ 40
	orig := res.Solicitud.DatosOriginales.Adicionales
	if len(orig) != 1 {
		t.Fatalf("se esperaba 1 adicional original, obtenidos %d", len(orig))
	}
	if orig[0].ID != "cochera" || orig[0].Unidad != "unidad" || orig[0].Subtotal != 40.0 {
		t.Errorf("snapshot original de cochera incorrecto: %+v", orig[0])
	}

	// 2) Validar snapshot propuesto: Pantalla (200), Microfono (10), Cochera (50) -> S/ 260
	prop := res.Solicitud.DatosPropuestos.Adicionales
	if len(prop) != 3 {
		t.Fatalf("se esperaban 3 adicionales propuestos, obtenidos %d", len(prop))
	}
	var totalPropuesto float64
	for _, a := range prop {
		totalPropuesto += a.Subtotal
		if a.Unidad != "unidad" {
			t.Errorf("adicional propuesto '%s' no tiene unidad 'unidad': %s", a.ID, a.Unidad)
		}
		if a.Nombre == "" || a.Nombre == a.ID {
			t.Errorf("adicional '%s' no tiene nombre comercial: %s", a.ID, a.Nombre)
		}
	}
	if totalPropuesto != 260.0 {
		t.Errorf("total propuesto esperado 260.0, obtenido %f", totalPropuesto)
	}

	// 3) GET /solicitudes debe persistir los mismos snapshots
	reqGet, _ := http.NewRequest(http.MethodGet, "/solicitudes", nil)
	wGet := httptest.NewRecorder()
	r.ServeHTTP(wGet, reqGet)
	if wGet.Code != http.StatusOK {
		t.Fatalf("GET /solicitudes retornó %d", wGet.Code)
	}

	var lista []models.Solicitud
	_ = json.Unmarshal(wGet.Body.Bytes(), &lista)
	solGuardada := lista[len(lista)-1]
	if len(solGuardada.DatosPropuestos.Adicionales) != 3 {
		t.Errorf("GET: se esperaban 3 adicionales propuestos, obtenidos %d", len(solGuardada.DatosPropuestos.Adicionales))
	}
}
