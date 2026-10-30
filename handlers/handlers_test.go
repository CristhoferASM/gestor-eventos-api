package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gestor-eventos-api/handlers"
	"gestor-eventos-api/models"
	"gestor-eventos-api/storage"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupTestRouter() (*gin.Engine, *storage.Store) {
	store := storage.NewMemoryStore()
	r := handlers.SetupRouter(store)
	return r, store
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

// 3. Prueba de GET /eventos/:id (existente e inexistente)
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
}

// 4. Prueba del registro correcto de una solicitud (201 Created)
func TestCrearSolicitudExito(t *testing.T) {
	r, _ := setupTestRouter()

	payload := map[string]interface{}{
		"evento_id":             1,
		"motivo":                "Ajuste por disponibilidad del conferencista principal",
		"fecha_propuesta":       "2026-11-18",
		"hora_inicio_propuesta": "10:00",
		"hora_fin_propuesta":    "14:00",
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

// 5. Pruebas de validación: horarios inválidos, fecha incorrecta, sin cambios, motivo vacío
func TestCrearSolicitudValidaciones(t *testing.T) {
	r, _ := setupTestRouter()

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
				"hora_fin_propuesta":    "12:00",
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
				"hora_fin_propuesta":    "09:00",
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
				"hora_fin_propuesta":    "23:00",
			},
			esperadoCode: http.StatusBadRequest,
		},
		{
			nombre: "Fecha con formato inválido",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                "Fecha mal formateada",
				"fecha_propuesta":       "16-11-2026",
				"hora_inicio_propuesta": "09:00",
				"hora_fin_propuesta":    "12:00",
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
				"hora_fin_propuesta":    "12:00",
			},
			esperadoCode: http.StatusBadRequest,
		},
		{
			nombre: "Motivo superior a 400 caracteres",
			payload: map[string]interface{}{
				"evento_id":             1,
				"motivo":                strings.Repeat("A", 401),
				"fecha_propuesta":       "2026-11-16",
				"hora_inicio_propuesta": "09:00",
				"hora_fin_propuesta":    "12:00",
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

	eventoOriginal, existe := store.ObtenerEventoPorID(1)
	if !existe {
		t.Fatalf("el evento 1 debe existir")
	}

	payload := map[string]interface{}{
		"evento_id":             1,
		"motivo":                "Solicitud para cambiar de fecha y hora",
		"fecha_propuesta":       "2026-11-28",
		"hora_inicio_propuesta": "08:00",
		"hora_fin_propuesta":    "11:00",
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
	eventoDespues, _ := store.ObtenerEventoPorID(1)

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
