package services_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"gestor-eventos-api/models"
	"gestor-eventos-api/services"
)

func loginMal(t *testing.T, e *entornoAuth, correo string) error {
	t.Helper()
	_, err := e.svc.IniciarLogin(context.Background(), models.LoginDTO{Correo: correo, Password: "incorrecta"})
	return err
}

func TestAuthBloqueoPorIntentosFallidosDeContrasena(t *testing.T) {
	e := nuevoEntornoAuth(t)
	for i := 0; i < services.MaxFallosLogin; i++ {
		if err := loginMal(t, e, "asesor@showtech.com"); !errors.Is(err, services.ErrCredencialesInvalidas) {
			t.Fatalf("intento %d: se esperaba ErrCredencialesInvalidas, se obtuvo %v", i+1, err)
		}
	}
	// Bloqueado: ni siquiera la contraseña correcta entra
	_, err := e.svc.IniciarLogin(context.Background(), models.LoginDTO{Correo: "asesor@showtech.com", Password: "Secreta2026!"})
	if !errors.Is(err, services.ErrLoginBloqueado) {
		t.Fatalf("se esperaba ErrLoginBloqueado, se obtuvo %v", err)
	}

	// Pasado el bloqueo vuelve a funcionar
	e.ahora = e.ahora.Add(services.BloqueoLogin + time.Second)
	if _, err := e.svc.IniciarLogin(context.Background(), models.LoginDTO{Correo: "asesor@showtech.com", Password: "Secreta2026!"}); err != nil {
		t.Errorf("tras el bloqueo el login correcto debía funcionar: %v", err)
	}
}

func TestAuthBloqueoNoRevelaSiElCorreoExiste(t *testing.T) {
	e := nuevoEntornoAuth(t)
	for i := 0; i < services.MaxFallosLogin; i++ {
		_ = loginMal(t, e, "fantasma@showtech.com")
	}
	if err := loginMal(t, e, "fantasma@showtech.com"); !errors.Is(err, services.ErrLoginBloqueado) {
		t.Errorf("un correo inexistente también debe bloquearse igual, se obtuvo %v", err)
	}
}

func TestAuthLoginCorrectoReiniciaElContadorDeFallos(t *testing.T) {
	e := nuevoEntornoAuth(t)
	for i := 0; i < services.MaxFallosLogin-1; i++ {
		_ = loginMal(t, e, "asesor@showtech.com")
	}
	e.login(t) // éxito: limpia los fallos
	for i := 0; i < services.MaxFallosLogin-1; i++ {
		if err := loginMal(t, e, "asesor@showtech.com"); errors.Is(err, services.ErrLoginBloqueado) {
			t.Fatalf("el contador debía haberse reiniciado (fallo %d)", i+1)
		}
	}
}

func TestAuthFallosAntiguosNoSeAcumulan(t *testing.T) {
	e := nuevoEntornoAuth(t)
	for i := 0; i < services.MaxFallosLogin-1; i++ {
		_ = loginMal(t, e, "asesor@showtech.com")
	}
	e.ahora = e.ahora.Add(services.VentanaFallosLogin + time.Second)
	if err := loginMal(t, e, "asesor@showtech.com"); errors.Is(err, services.ErrLoginBloqueado) {
		t.Error("los fallos fuera de la ventana no deben contar para el bloqueo")
	}
}

type notificadorFalso struct{ correo, codigo string }

func (n *notificadorFalso) EnviarCodigo(_ context.Context, correo, codigo string) error {
	n.correo, n.codigo = correo, codigo
	return nil
}

func TestAuthModoProduccionNoExponeElCodigoPeroLoNotifica(t *testing.T) {
	e := nuevoEntornoAuth(t)
	n := &notificadorFalso{}
	e.svc.ConNotificador(n, false)

	d := e.login(t)
	if d.CodigoPrueba != "" {
		t.Errorf("con mostrarCodigoPrueba=false la respuesta no debe incluir el código, incluyó %q", d.CodigoPrueba)
	}
	if n.codigo != "123456" || n.correo != "asesor@showtech.com" {
		t.Errorf("el notificador debía recibir el código y el correo, recibió %+v", n)
	}
	// El código notificado sí funciona
	if _, err := e.svc.VerificarCodigo(context.Background(), models.VerificarCodigoDTO{DesafioID: d.DesafioID, Codigo: n.codigo}); err != nil {
		t.Errorf("el código notificado debía ser válido: %v", err)
	}
}
