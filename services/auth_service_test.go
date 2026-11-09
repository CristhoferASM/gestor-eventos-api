package services_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"gestor-eventos-api/models"
	"gestor-eventos-api/services"
	"gestor-eventos-api/storage"

	"golang.org/x/crypto/bcrypt"
)

type entornoAuth struct {
	svc    *services.AuthService
	store  *storage.Store
	ahora  time.Time
	codigo string
	tokens int
}

// nuevoEntornoAuth crea un servicio con reloj controlable, código fijo "123456" y tokens secuenciales.
func nuevoEntornoAuth(t *testing.T) *entornoAuth {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte("Secreta2026!"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	store := storage.NewEmptyMemoryStore()
	store.AgregarUsuario(models.Usuario{
		ID: 1, Correo: "Asesor@Showtech.com", Nombre: "Asesor", Rol: models.RolAsesor, PasswordHash: string(hash),
	})
	e := &entornoAuth{store: store, ahora: time.Date(2026, 11, 9, 10, 0, 0, 0, time.UTC), codigo: "123456"}
	e.svc = services.NewAuthServiceCompleto(store, store,
		func() time.Time { return e.ahora },
		func() (string, error) { return e.codigo, nil },
		func() (string, error) { e.tokens++; return fmt.Sprintf("tok-%d", e.tokens), nil },
	)
	return e
}

func (e *entornoAuth) login(t *testing.T) models.RespuestaDesafio {
	t.Helper()
	r, err := e.svc.IniciarLogin(context.Background(), models.LoginDTO{Correo: "  asesor@showtech.com ", Password: "Secreta2026!"})
	if err != nil {
		t.Fatalf("login falló: %v", err)
	}
	return r
}

func TestAuthLoginCredencialesInvalidas(t *testing.T) {
	e := nuevoEntornoAuth(t)
	casos := []models.LoginDTO{
		{Correo: "asesor@showtech.com", Password: "incorrecta"},
		{Correo: "nadie@showtech.com", Password: "Secreta2026!"},
	}
	for _, dto := range casos {
		if _, err := e.svc.IniciarLogin(context.Background(), dto); !errors.Is(err, services.ErrCredencialesInvalidas) {
			t.Errorf("%+v: se esperaba ErrCredencialesInvalidas, se obtuvo %v", dto, err)
		}
	}
}

func TestAuthLoginCamposVacios(t *testing.T) {
	e := nuevoEntornoAuth(t)
	_, err := e.svc.IniciarLogin(context.Background(), models.LoginDTO{Correo: "   ", Password: "x"})
	if !errors.Is(err, services.ErrDatosInvalidos) {
		t.Errorf("se esperaba ErrDatosInvalidos, se obtuvo %v", err)
	}
}

func TestAuthLoginYVerificacionExitosa(t *testing.T) {
	e := nuevoEntornoAuth(t)
	d := e.login(t)
	if d.CorreoEnmascarado != "as***@showtech.com" {
		t.Errorf("correo enmascarado inesperado: %q", d.CorreoEnmascarado)
	}
	if d.ExpiraEnSegundos != 60 || d.ReenvioEnSegundos != 30 {
		t.Errorf("tiempos inesperados: %+v", d)
	}

	ses, err := e.svc.VerificarCodigo(context.Background(), models.VerificarCodigoDTO{DesafioID: d.DesafioID, Codigo: " 123456 "})
	if err != nil {
		t.Fatalf("verificación falló: %v", err)
	}
	if ses.Token == "" || ses.Usuario.Rol != models.RolAsesor {
		t.Errorf("sesión inesperada: %+v", ses)
	}

	u, err := e.svc.UsuarioDeSesion(context.Background(), ses.Token)
	if err != nil || u.Correo != "asesor@showtech.com" {
		t.Errorf("UsuarioDeSesion = %+v, %v", u, err)
	}

	// El desafío se consume: no se puede reutilizar
	_, err = e.svc.VerificarCodigo(context.Background(), models.VerificarCodigoDTO{DesafioID: d.DesafioID, Codigo: "123456"})
	if !errors.Is(err, services.ErrDesafioInvalido) {
		t.Errorf("reutilizar el desafío debía dar ErrDesafioInvalido, se obtuvo %v", err)
	}
}

func TestAuthCodigoIncorrectoYBloqueoPorIntentos(t *testing.T) {
	e := nuevoEntornoAuth(t)
	d := e.login(t)
	mal := models.VerificarCodigoDTO{DesafioID: d.DesafioID, Codigo: "000000"}

	for i := 1; i < services.MaxIntentosCodigo; i++ {
		if _, err := e.svc.VerificarCodigo(context.Background(), mal); !errors.Is(err, services.ErrCodigoIncorrecto) {
			t.Fatalf("intento %d: se esperaba ErrCodigoIncorrecto, se obtuvo %v", i, err)
		}
	}
	if _, err := e.svc.VerificarCodigo(context.Background(), mal); !errors.Is(err, services.ErrDemasiadosIntentos) {
		t.Fatalf("se esperaba ErrDemasiadosIntentos, se obtuvo %v", err)
	}
	// Ni siquiera el código correcto sirve después del bloqueo
	_, err := e.svc.VerificarCodigo(context.Background(), models.VerificarCodigoDTO{DesafioID: d.DesafioID, Codigo: "123456"})
	if !errors.Is(err, services.ErrDesafioInvalido) {
		t.Errorf("tras el bloqueo se esperaba ErrDesafioInvalido, se obtuvo %v", err)
	}
}

func TestAuthCodigoExpiraYSePuedeReenviar(t *testing.T) {
	e := nuevoEntornoAuth(t)
	d := e.login(t)

	e.ahora = e.ahora.Add(61 * time.Second)
	_, err := e.svc.VerificarCodigo(context.Background(), models.VerificarCodigoDTO{DesafioID: d.DesafioID, Codigo: "123456"})
	if !errors.Is(err, services.ErrCodigoExpirado) {
		t.Fatalf("se esperaba ErrCodigoExpirado, se obtuvo %v", err)
	}

	e.codigo = "654321"
	nuevo, err := e.svc.ReenviarCodigo(context.Background(), models.ReenviarCodigoDTO{DesafioID: d.DesafioID})
	if err != nil {
		t.Fatalf("reenvío falló: %v", err)
	}
	if nuevo.CodigoPrueba != "654321" {
		t.Errorf("el reenvío debía generar un código nuevo, se obtuvo %q", nuevo.CodigoPrueba)
	}
	if _, err := e.svc.VerificarCodigo(context.Background(), models.VerificarCodigoDTO{DesafioID: d.DesafioID, Codigo: "654321"}); err != nil {
		t.Errorf("el código nuevo debía ser válido: %v", err)
	}
}

func TestAuthReenvioMuyPronto(t *testing.T) {
	e := nuevoEntornoAuth(t)
	d := e.login(t)

	e.ahora = e.ahora.Add(29 * time.Second)
	if _, err := e.svc.ReenviarCodigo(context.Background(), models.ReenviarCodigoDTO{DesafioID: d.DesafioID}); !errors.Is(err, services.ErrReenvioMuyPronto) {
		t.Fatalf("a los 29 s se esperaba ErrReenvioMuyPronto, se obtuvo %v", err)
	}
	e.ahora = e.ahora.Add(1 * time.Second)
	if _, err := e.svc.ReenviarCodigo(context.Background(), models.ReenviarCodigoDTO{DesafioID: d.DesafioID}); err != nil {
		t.Errorf("a los 30 s el reenvío debía permitirse: %v", err)
	}
}

func TestAuthSesionExpiraYLogout(t *testing.T) {
	e := nuevoEntornoAuth(t)
	d := e.login(t)
	ses, err := e.svc.VerificarCodigo(context.Background(), models.VerificarCodigoDTO{DesafioID: d.DesafioID, Codigo: "123456"})
	if err != nil {
		t.Fatal(err)
	}

	if err := e.svc.CerrarSesion(context.Background(), ses.Token); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.UsuarioDeSesion(context.Background(), ses.Token); !errors.Is(err, services.ErrSesionInvalida) {
		t.Errorf("tras logout se esperaba ErrSesionInvalida, se obtuvo %v", err)
	}

	// Sesión nueva que vence por tiempo
	d = e.login(t)
	ses, _ = e.svc.VerificarCodigo(context.Background(), models.VerificarCodigoDTO{DesafioID: d.DesafioID, Codigo: "123456"})
	e.ahora = e.ahora.Add(services.DuracionSesion)
	if _, err := e.svc.UsuarioDeSesion(context.Background(), ses.Token); !errors.Is(err, services.ErrSesionInvalida) {
		t.Errorf("sesión vencida: se esperaba ErrSesionInvalida, se obtuvo %v", err)
	}
	if _, err := e.svc.UsuarioDeSesion(context.Background(), ""); !errors.Is(err, services.ErrSesionInvalida) {
		t.Errorf("token vacío: se esperaba ErrSesionInvalida, se obtuvo %v", err)
	}
}
