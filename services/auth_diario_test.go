package services_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"gestor-eventos-api/models"
	"gestor-eventos-api/services"
	"gestor-eventos-api/storage"

	"golang.org/x/crypto/bcrypt"
)

// nuevoEntornoDiario tiene un asesor y un cliente, ambos con la contraseña «Secreta2026!».
func nuevoEntornoDiario(t *testing.T, ahora time.Time) (*services.AuthService, *time.Time) {
	t.Helper()
	hash, _ := bcrypt.GenerateFromPassword([]byte("Secreta2026!"), bcrypt.MinCost)
	store := storage.NewEmptyMemoryStore()
	store.AgregarUsuario(models.Usuario{ID: 1, Correo: "asesor@showtech.com", Rol: models.RolAsesor, PasswordHash: string(hash)})
	store.AgregarUsuario(models.Usuario{ID: 2, Correo: "cliente@horizonte.com", Rol: models.RolCliente, ClienteID: "CLI-001", PasswordHash: string(hash)})
	reloj := ahora
	n := 0
	svc := services.NewAuthServiceCompleto(store, store,
		func() time.Time { return reloj },
		func() (string, error) { return "123456", nil },
		func() (string, error) { n++; return "tok-" + string(rune('a'+n)), nil },
	)
	return svc, &reloj
}

func entrar(t *testing.T, svc *services.AuthService, correo, dispositivo string) models.RespuestaDesafio {
	t.Helper()
	r, err := svc.IniciarLogin(context.Background(), models.LoginDTO{Correo: correo, Password: "Secreta2026!", DispositivoID: dispositivo})
	if err != nil {
		t.Fatalf("login de %s falló: %v", correo, err)
	}
	return r
}

func verificar(t *testing.T, svc *services.AuthService, d models.RespuestaDesafio, dispositivo string) {
	t.Helper()
	if _, err := svc.VerificarCodigo(context.Background(), models.VerificarCodigoDTO{DesafioID: d.DesafioID, Codigo: "123456", DispositivoID: dispositivo}); err != nil {
		t.Fatalf("verificar falló: %v", err)
	}
}

const navegador = "navegador-uno-aaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func TestAsesorSoloVerificaElCodigoUnaVezPorDia(t *testing.T) {
	svc, _ := nuevoEntornoDiario(t, time.Date(2026, 11, 9, 15, 0, 0, 0, time.UTC)) // 10:00 en Lima

	primero := entrar(t, svc, "asesor@showtech.com", navegador)
	if primero.Sesion != nil || primero.DesafioID == "" || !primero.RecordatorioDiario {
		t.Fatalf("el primer ingreso del día pide código y avisa de la regla diaria: %+v", primero)
	}
	verificar(t, svc, primero, navegador)

	// Segundo ingreso del mismo día en el mismo navegador: con la contraseña basta
	segundo := entrar(t, svc, "asesor@showtech.com", navegador)
	if segundo.Sesion == nil || segundo.Sesion.Token == "" || segundo.DesafioID != "" {
		t.Fatalf("el segundo ingreso del día debía abrir sesión directa: %+v", segundo)
	}
	if segundo.Sesion.Usuario.Rol != models.RolAsesor {
		t.Errorf("la sesión debe ser del asesor: %+v", segundo.Sesion.Usuario)
	}
}

func TestAtajoDiarioNuncaOmiteLaContrasena(t *testing.T) {
	svc, _ := nuevoEntornoDiario(t, time.Date(2026, 11, 9, 15, 0, 0, 0, time.UTC))
	verificar(t, svc, entrar(t, svc, "asesor@showtech.com", navegador), navegador)

	_, err := svc.IniciarLogin(context.Background(), models.LoginDTO{Correo: "asesor@showtech.com", Password: "incorrecta", DispositivoID: navegador})
	if !errors.Is(err, services.ErrCredencialesInvalidas) {
		t.Errorf("con el recordatorio vigente una contraseña incorrecta debe rechazarse, se obtuvo %v", err)
	}
}

func TestAtajoDiarioEsPorNavegadorYSoloParaElAsesor(t *testing.T) {
	svc, _ := nuevoEntornoDiario(t, time.Date(2026, 11, 9, 15, 0, 0, 0, time.UTC))
	verificar(t, svc, entrar(t, svc, "asesor@showtech.com", navegador), navegador)

	// Otro navegador (otra cookie) o sin cookie: vuelve a pedir el código
	for _, otro := range []string{"navegador-dos-bbbbbbbbbbbbbbbbbbbbbbbbbbbb", ""} {
		if r := entrar(t, svc, "asesor@showtech.com", otro); r.Sesion != nil || r.DesafioID == "" {
			t.Errorf("otro navegador (%q) debe pedir el código: %+v", otro, r)
		}
	}

	// El cliente verifica el código en cada ingreso, incluso en el mismo navegador
	verificar(t, svc, entrar(t, svc, "cliente@horizonte.com", navegador), navegador)
	cliente := entrar(t, svc, "cliente@horizonte.com", navegador)
	if cliente.Sesion != nil || cliente.DesafioID == "" || cliente.RecordatorioDiario {
		t.Errorf("el cliente no tiene atajo diario: %+v", cliente)
	}
}

func TestAtajoDiarioVenceAMedianocheDeLimaNoDeUTC(t *testing.T) {
	// 04:59 UTC del 10/11 = 23:59 del 09/11 en Lima (UTC-5)
	svc, reloj := nuevoEntornoDiario(t, time.Date(2026, 11, 10, 4, 59, 0, 0, time.UTC))
	verificar(t, svc, entrar(t, svc, "asesor@showtech.com", navegador), navegador)

	*reloj = time.Date(2026, 11, 10, 4, 59, 59, 0, time.UTC) // todavía 09/11 en Lima
	if r := entrar(t, svc, "asesor@showtech.com", navegador); r.Sesion == nil {
		t.Error("a las 23:59:59 de Lima sigue siendo el mismo día: debía abrir sesión directa")
	}

	*reloj = time.Date(2026, 11, 10, 5, 0, 0, 0, time.UTC) // 00:00 del 10/11 en Lima
	if r := entrar(t, svc, "asesor@showtech.com", navegador); r.Sesion != nil || r.DesafioID == "" {
		t.Errorf("a medianoche de Lima el recordatorio vence y debe pedir el código: %+v", r)
	}
}

func TestAtajoDiarioNoSeActivaSiNoSeVerificaElCodigo(t *testing.T) {
	svc, _ := nuevoEntornoDiario(t, time.Date(2026, 11, 9, 15, 0, 0, 0, time.UTC))
	// Login con contraseña correcta pero sin completar el código: no se recuerda nada
	_ = entrar(t, svc, "asesor@showtech.com", navegador)
	if r := entrar(t, svc, "asesor@showtech.com", navegador); r.Sesion != nil {
		t.Error("sin código verificado no debe haber atajo")
	}
	// Un código incorrecto tampoco lo activa
	d := entrar(t, svc, "asesor@showtech.com", navegador)
	_, _ = svc.VerificarCodigo(context.Background(), models.VerificarCodigoDTO{DesafioID: d.DesafioID, Codigo: "000000", DispositivoID: navegador})
	if r := entrar(t, svc, "asesor@showtech.com", navegador); r.Sesion != nil {
		t.Error("un código incorrecto no debe activar el atajo")
	}
}
