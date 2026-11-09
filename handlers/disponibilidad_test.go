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
