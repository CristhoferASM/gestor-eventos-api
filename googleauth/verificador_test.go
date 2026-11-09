package googleauth_test

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"gestor-eventos-api/googleauth"
	"gestor-eventos-api/services"
)

const proyecto = "showtech-prototipo"

var ahoraFijo = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)

func nuevaClave(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

func verificadorCon(clave *rsa.PrivateKey, kid string) *googleauth.Verificador {
	fuente := func(context.Context) (map[string]*rsa.PublicKey, time.Duration, error) {
		return map[string]*rsa.PublicKey{kid: &clave.PublicKey}, time.Hour, nil
	}
	return googleauth.NuevoVerificadorConFuente(proyecto, fuente, func() time.Time { return ahoraFijo })
}

func claimsValidos() map[string]any {
	return map[string]any{
		"iss": "https://securetoken.google.com/" + proyecto, "aud": proyecto, "sub": "uid-123",
		"iat": ahoraFijo.Add(-time.Minute).Unix(), "auth_time": ahoraFijo.Add(-time.Minute).Unix(),
		"exp":   ahoraFijo.Add(time.Hour).Unix(),
		"email": "ana@gmail.com", "email_verified": true, "name": "Ana Pérez",
		"firebase": map[string]any{"sign_in_provider": "google.com"},
	}
}

func firmar(t *testing.T, clave *rsa.PrivateKey, kid string, claims map[string]any) string {
	t.Helper()
	codificar := func(v any) string {
		b, _ := json.Marshal(v)
		return base64.RawURLEncoding.EncodeToString(b)
	}
	cuerpo := codificar(map[string]any{"alg": "RS256", "kid": kid, "typ": "JWT"}) + "." + codificar(claims)
	resumen := sha256.Sum256([]byte(cuerpo))
	firma, err := rsa.SignPKCS1v15(rand.Reader, clave, crypto.SHA256, resumen[:])
	if err != nil {
		t.Fatal(err)
	}
	return cuerpo + "." + base64.RawURLEncoding.EncodeToString(firma)
}

func TestVerificarTokenValido(t *testing.T) {
	clave := nuevaClave(t)
	v := verificadorCon(clave, "k1")
	ident, err := v.Verificar(context.Background(), firmar(t, clave, "k1", claimsValidos()))
	if err != nil {
		t.Fatalf("token válido rechazado: %v", err)
	}
	if ident.UID != "uid-123" || ident.Correo != "ana@gmail.com" || !ident.CorreoVerif || ident.Nombre != "Ana Pérez" {
		t.Errorf("identidad inesperada: %+v", ident)
	}
}

func TestVerificarTokenInvalido(t *testing.T) {
	clave := nuevaClave(t)
	otraClave := nuevaClave(t)
	v := verificadorCon(clave, "k1")

	con := func(cambio func(m map[string]any)) string {
		m := claimsValidos()
		cambio(m)
		return firmar(t, clave, "k1", m)
	}
	casos := map[string]string{
		"firmado con otra clave":     firmar(t, otraClave, "k1", claimsValidos()),
		"kid desconocido":            firmar(t, clave, "otro", claimsValidos()),
		"vencido":                    con(func(m map[string]any) { m["exp"] = ahoraFijo.Add(-time.Second).Unix() }),
		"emitido en el futuro":       con(func(m map[string]any) { m["iat"] = ahoraFijo.Add(time.Hour).Unix() }),
		"audiencia de otro proyecto": con(func(m map[string]any) { m["aud"] = "otro-proyecto" }),
		"emisor incorrecto":          con(func(m map[string]any) { m["iss"] = "https://accounts.evil.com" }),
		"sin sub":                    con(func(m map[string]any) { m["sub"] = "" }),
		"sin correo":                 con(func(m map[string]any) { m["email"] = "" }),
		"proveedor no es google":     con(func(m map[string]any) { m["firebase"] = map[string]any{"sign_in_provider": "password"} }),
		"formato roto":               "abc.def",
		"vacío":                      "",
	}
	for nombre, token := range casos {
		if _, err := v.Verificar(context.Background(), token); !errors.Is(err, services.ErrTokenGoogleInvalido) {
			t.Errorf("%s: se esperaba ErrTokenGoogleInvalido, se obtuvo %v", nombre, err)
		}
	}
}

func TestVerificarRechazaAlgoritmoNone(t *testing.T) {
	clave := nuevaClave(t)
	v := verificadorCon(clave, "k1")
	cod := func(x any) string { b, _ := json.Marshal(x); return base64.RawURLEncoding.EncodeToString(b) }
	token := cod(map[string]any{"alg": "none", "kid": "k1"}) + "." + cod(claimsValidos()) + "."
	if _, err := v.Verificar(context.Background(), token); !errors.Is(err, services.ErrTokenGoogleInvalido) {
		t.Errorf("alg=none debía rechazarse, se obtuvo %v", err)
	}
}

func TestVerificarCacheaClaves(t *testing.T) {
	clave := nuevaClave(t)
	llamadas := 0
	fuente := func(context.Context) (map[string]*rsa.PublicKey, time.Duration, error) {
		llamadas++
		return map[string]*rsa.PublicKey{"k1": &clave.PublicKey}, time.Hour, nil
	}
	v := googleauth.NuevoVerificadorConFuente(proyecto, fuente, func() time.Time { return ahoraFijo })
	token := firmar(t, clave, "k1", claimsValidos())
	for i := 0; i < 3; i++ {
		if _, err := v.Verificar(context.Background(), token); err != nil {
			t.Fatal(err)
		}
	}
	if llamadas != 1 {
		t.Errorf("las claves debían pedirse una sola vez, se pidieron %d", llamadas)
	}
}
