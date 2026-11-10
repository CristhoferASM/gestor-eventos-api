package handlers_test

import (
	"net/http"
	"strings"
	"testing"
)

func TestSolicitudSinDisponibilidadResponde409ConMensajeSeguro(t *testing.T) {
	r, _ := setupTestRouter()

	cuerpo := map[string]any{
		"evento_id": 2, "motivo": "Cambio de agenda",
		"fecha_propuesta": "2026-11-15", "hora_inicio_propuesta": "13:30", "hora_fin_propuesta": "14:30",
	}
	w := llamar(r.Engine, http.MethodPost, "/solicitudes", r.token, cuerpo)
	if w.Code != http.StatusConflict {
		t.Fatalf("esperaba 409, obtuvo %d: %s", w.Code, w.Body)
	}
	if !strings.Contains(w.Body.String(), "ya cuenta con una reserva programada") {
		t.Errorf("mensaje inesperado: %s", w.Body)
	}
	for _, prohibido := range []string{"Ceremonia", "graduación", "Horizonte", "CLI-001"} {
		if strings.Contains(w.Body.String(), prohibido) {
			t.Errorf("la respuesta no debe revelar datos de otro evento (%q): %s", prohibido, w.Body)
		}
	}

	// Una propuesta que no choca sigue funcionando
	cuerpo["hora_inicio_propuesta"], cuerpo["hora_fin_propuesta"] = "14:00", "15:00"
	if w := llamar(r.Engine, http.MethodPost, "/solicitudes", r.token, cuerpo); w.Code != http.StatusCreated {
		t.Errorf("borde con borde debe permitirse (201), obtuvo %d: %s", w.Code, w.Body)
	}
}

func TestConsultarDisponibilidadResponde200SinRegistrarNada(t *testing.T) {
	r, _ := setupTestRouter()

	cuerpo := map[string]any{ // sin motivo a propósito
		"evento_id": 2, "fecha_propuesta": "2026-11-15", "hora_inicio_propuesta": "13:30", "hora_fin_propuesta": "14:30",
	}
	w := llamar(r.Engine, http.MethodPost, "/disponibilidad", r.token, cuerpo)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"disponible":false`) || !strings.Contains(w.Body.String(), "ya cuenta con una reserva programada") {
		t.Fatalf("choque: esperaba 200 con disponible=false y mensaje, obtuvo %d: %s", w.Code, w.Body)
	}
	for _, prohibido := range []string{"Ceremonia", "graduación", "Horizonte", "CLI-001"} {
		if strings.Contains(w.Body.String(), prohibido) {
			t.Errorf("la respuesta no debe revelar datos de otro evento (%q): %s", prohibido, w.Body)
		}
	}

	cuerpo["hora_inicio_propuesta"], cuerpo["hora_fin_propuesta"] = "14:00", "15:00"
	if w := llamar(r.Engine, http.MethodPost, "/disponibilidad", r.token, cuerpo); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"disponible":true`) {
		t.Errorf("borde con borde: esperaba 200 con disponible=true, obtuvo %d: %s", w.Code, w.Body)
	}

	// Consultar no crea solicitudes: la lista sigue vacía
	if w := llamar(r.Engine, http.MethodGet, "/solicitudes", r.token, nil); strings.TrimSpace(w.Body.String()) != "[]" {
		t.Errorf("la consulta no debe registrar solicitudes: %s", w.Body)
	}
}

func TestConsultarDisponibilidadErroresYPermisos(t *testing.T) {
	r, tokCli001, tokSinCliente, _ := setupRolesRouter(t)
	valida := map[string]any{"evento_id": 2, "fecha_propuesta": "2026-11-16", "hora_inicio_propuesta": "09:00", "hora_fin_propuesta": "10:00"}

	if w := llamar(r, http.MethodPost, "/disponibilidad", "", valida); w.Code != http.StatusUnauthorized {
		t.Errorf("sin sesión esperaba 401, obtuvo %d", w.Code)
	}
	// El evento 2 es de CLI-002: para un cliente de CLI-001 (o sin cliente) es como si no existiera
	for _, tok := range []string{tokCli001, tokSinCliente} {
		if w := llamar(r, http.MethodPost, "/disponibilidad", tok, valida); w.Code != http.StatusNotFound {
			t.Errorf("evento ajeno esperaba 404, obtuvo %d: %s", w.Code, w.Body)
		}
	}
	// El cliente dueño (evento 1) sí puede consultar; datos mal formados responden 400
	propia := map[string]any{"evento_id": 1, "fecha_propuesta": "2026-11-16", "hora_inicio_propuesta": "09:00", "hora_fin_propuesta": "10:00"}
	if w := llamar(r, http.MethodPost, "/disponibilidad", tokCli001, propia); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"disponible":true`) {
		t.Errorf("cliente dueño: esperaba 200 disponible, obtuvo %d: %s", w.Code, w.Body)
	}
	propia["hora_inicio_propuesta"] = "9h"
	if w := llamar(r, http.MethodPost, "/disponibilidad", tokCli001, propia); w.Code != http.StatusBadRequest {
		t.Errorf("hora mal formada esperaba 400, obtuvo %d: %s", w.Code, w.Body)
	}
}
