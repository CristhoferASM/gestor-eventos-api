package services_test

import (
	"context"
	"errors"
	"fmt"
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

func loginDesdeIP(e *entornoAuth, correo, password, ip string) error {
	_, err := e.svc.IniciarLogin(context.Background(), models.LoginDTO{Correo: correo, Password: password, IP: ip})
	return err
}

// fallosVariosCorreos hace n logins con contraseña errónea desde una IP, cada uno con un correo distinto
// (así ningún correo llega a su propio límite: solo cuenta el de la IP).
func fallosVariosCorreos(t *testing.T, e *entornoAuth, ip string, desde, n int) {
	t.Helper()
	for i := desde; i < desde+n; i++ {
		correo := fmt.Sprintf("fantasma%d@showtech.com", i)
		if err := loginDesdeIP(e, correo, "incorrecta", ip); !errors.Is(err, services.ErrCredencialesInvalidas) {
			t.Fatalf("intento %d: se esperaba ErrCredencialesInvalidas, se obtuvo %v", i, err)
		}
	}
}

func TestAuthBloqueoPorIPAunqueCambieElCorreo(t *testing.T) {
	e := nuevoEntornoAuth(t)
	fallosVariosCorreos(t, e, "198.51.100.7", 0, services.MaxFallosLoginPorIP)

	// La IP está bloqueada: ni siquiera unas credenciales correctas entran desde ella
	if err := loginDesdeIP(e, "asesor@showtech.com", "Secreta2026!", "198.51.100.7"); !errors.Is(err, services.ErrLoginBloqueado) {
		t.Fatalf("se esperaba ErrLoginBloqueado desde la IP bloqueada, se obtuvo %v", err)
	}
	// Otra IP no se ve afectada
	if err := loginDesdeIP(e, "asesor@showtech.com", "Secreta2026!", "198.51.100.8"); err != nil {
		t.Errorf("otra IP debía poder entrar: %v", err)
	}
	// Pasado el bloqueo, la IP vuelve a funcionar
	e.ahora = e.ahora.Add(services.BloqueoIP + time.Second)
	if err := loginDesdeIP(e, "asesor@showtech.com", "Secreta2026!", "198.51.100.7"); err != nil {
		t.Errorf("tras el bloqueo la IP debía poder entrar: %v", err)
	}
}

func TestAuthLimiteDeIPYDeCorreoSonIndependientes(t *testing.T) {
	e := nuevoEntornoAuth(t)
	// El correo se bloquea con pocos fallos aunque la IP esté lejos de su límite…
	for i := 0; i < services.MaxFallosLogin; i++ {
		_ = loginDesdeIP(e, "asesor@showtech.com", "incorrecta", "198.51.100.7")
	}
	if err := loginDesdeIP(e, "asesor@showtech.com", "Secreta2026!", "198.51.100.8"); !errors.Is(err, services.ErrLoginBloqueado) {
		t.Errorf("el correo bloqueado debe rechazarse también desde otra IP, se obtuvo %v", err)
	}
	// …y desde la IP «limpia» otro correo sigue funcionando
	if err := loginDesdeIP(e, "otro@showtech.com", "incorrecta", "198.51.100.7"); errors.Is(err, services.ErrLoginBloqueado) {
		t.Error("otro correo desde una IP con pocos fallos no debía estar bloqueado")
	}
}

func TestAuthLoginCorrectoNoReiniciaElContadorDeLaIP(t *testing.T) {
	e := nuevoEntornoAuth(t)
	fallosVariosCorreos(t, e, "198.51.100.7", 0, services.MaxFallosLoginPorIP-1)
	// Un login correcto desde esa IP no «limpia» los intentos de ataque
	if err := loginDesdeIP(e, "asesor@showtech.com", "Secreta2026!", "198.51.100.7"); err != nil {
		t.Fatalf("el login correcto debía funcionar mientras la IP no esté bloqueada: %v", err)
	}
	_ = loginDesdeIP(e, "fantasma-extra@showtech.com", "incorrecta", "198.51.100.7")
	if err := loginDesdeIP(e, "asesor@showtech.com", "Secreta2026!", "198.51.100.7"); !errors.Is(err, services.ErrLoginBloqueado) {
		t.Errorf("el fallo número %d de la IP debía bloquearla aunque hubo un login correcto en medio: %v", services.MaxFallosLoginPorIP, err)
	}
}

func TestAuthFallosAntiguosDeIPNoSeAcumulan(t *testing.T) {
	e := nuevoEntornoAuth(t)
	fallosVariosCorreos(t, e, "198.51.100.7", 0, services.MaxFallosLoginPorIP-1)
	e.ahora = e.ahora.Add(services.VentanaFallosIP + time.Second)
	if err := loginDesdeIP(e, "fantasma-nuevo@showtech.com", "incorrecta", "198.51.100.7"); errors.Is(err, services.ErrLoginBloqueado) {
		t.Error("los fallos fuera de la ventana no deben contar para el bloqueo de la IP")
	}
	if err := loginDesdeIP(e, "asesor@showtech.com", "Secreta2026!", "198.51.100.7"); err != nil {
		t.Errorf("la IP no debía estar bloqueada: %v", err)
	}
}

func TestAuthSinIPNoSeLimitaPorIP(t *testing.T) {
	e := nuevoEntornoAuth(t)
	// Sin IP disponible (cadena vacía) solo rige el límite por correo
	fallosVariosCorreos(t, e, "", 0, services.MaxFallosLoginPorIP+5)
	if err := loginDesdeIP(e, "asesor@showtech.com", "Secreta2026!", ""); err != nil {
		t.Errorf("sin IP no debía haber límite por IP: %v", err)
	}
}
