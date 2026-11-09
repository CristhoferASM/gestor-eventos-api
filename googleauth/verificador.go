// Package googleauth verifica ID tokens de Firebase Authentication (inicio de sesión con Google)
// usando solo la biblioteca estándar: firma RS256 con los certificados públicos de Google y validación de claims.
package googleauth

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"gestor-eventos-api/services"
)

// URLClavesFirebase publica los certificados X.509 con que Firebase firma los ID tokens.
const URLClavesFirebase = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

const toleranciaReloj = time.Minute

// FuenteClaves entrega las claves públicas por kid y cuánto tiempo pueden reutilizarse.
type FuenteClaves func(ctx context.Context) (map[string]*rsa.PublicKey, time.Duration, error)

// Verificador implementa services.VerificadorGoogle para un proyecto de Firebase.
type Verificador struct {
	projectID string
	fuente    FuenteClaves
	ahora     func() time.Time

	mu      sync.Mutex
	claves  map[string]*rsa.PublicKey
	vigente time.Time
}

var _ services.VerificadorGoogle = (*Verificador)(nil)

// NuevoVerificador crea un verificador que descarga las claves de Google (con caché según Cache-Control).
func NuevoVerificador(projectID string) *Verificador {
	return NuevoVerificadorConFuente(projectID, fuenteHTTP(http.DefaultClient), time.Now)
}

// NuevoVerificadorConFuente permite inyectar la fuente de claves y el reloj (pruebas).
func NuevoVerificadorConFuente(projectID string, fuente FuenteClaves, ahora func() time.Time) *Verificador {
	return &Verificador{projectID: projectID, fuente: fuente, ahora: ahora}
}

type cabeceraJWT struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
}

type claimsJWT struct {
	Iss           string `json:"iss"`
	Aud           string `json:"aud"`
	Sub           string `json:"sub"`
	Exp           int64  `json:"exp"`
	Iat           int64  `json:"iat"`
	AuthTime      int64  `json:"auth_time"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Firebase      struct {
		SignInProvider string `json:"sign_in_provider"`
	} `json:"firebase"`
}

// Verificar valida firma y claims del ID token. Cualquier fallo de validación devuelve services.ErrTokenGoogleInvalido.
func (v *Verificador) Verificar(ctx context.Context, idToken string) (services.IdentidadGoogle, error) {
	partes := strings.Split(idToken, ".")
	if len(partes) != 3 {
		return services.IdentidadGoogle{}, services.ErrTokenGoogleInvalido
	}
	var cab cabeceraJWT
	var claims claimsJWT
	if err := decodificarParte(partes[0], &cab); err != nil || cab.Alg != "RS256" || cab.Kid == "" {
		return services.IdentidadGoogle{}, services.ErrTokenGoogleInvalido
	}
	if err := decodificarParte(partes[1], &claims); err != nil {
		return services.IdentidadGoogle{}, services.ErrTokenGoogleInvalido
	}
	firma, err := base64.RawURLEncoding.DecodeString(partes[2])
	if err != nil {
		return services.IdentidadGoogle{}, services.ErrTokenGoogleInvalido
	}

	clave, err := v.claveParaKid(ctx, cab.Kid)
	if err != nil {
		return services.IdentidadGoogle{}, err
	}
	resumen := sha256.Sum256([]byte(partes[0] + "." + partes[1]))
	if rsa.VerifyPKCS1v15(clave, crypto.SHA256, resumen[:], firma) != nil {
		return services.IdentidadGoogle{}, services.ErrTokenGoogleInvalido
	}

	ahora := v.ahora()
	switch {
	case claims.Aud != v.projectID,
		claims.Iss != "https://securetoken.google.com/"+v.projectID,
		claims.Sub == "",
		!ahora.Before(time.Unix(claims.Exp, 0)),
		time.Unix(claims.Iat, 0).After(ahora.Add(toleranciaReloj)),
		time.Unix(claims.AuthTime, 0).After(ahora.Add(toleranciaReloj)),
		claims.Firebase.SignInProvider != "google.com",
		claims.Email == "":
		return services.IdentidadGoogle{}, services.ErrTokenGoogleInvalido
	}
	return services.IdentidadGoogle{
		UID:         claims.Sub,
		Correo:      claims.Email,
		CorreoVerif: claims.EmailVerified,
		Nombre:      claims.Name,
	}, nil
}

func (v *Verificador) claveParaKid(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.claves == nil || !v.ahora().Before(v.vigente) {
		claves, ttl, err := v.fuente(ctx)
		if err != nil {
			return nil, fmt.Errorf("no se pudieron obtener las claves de Google: %w", err)
		}
		v.claves, v.vigente = claves, v.ahora().Add(ttl)
	}
	clave, ok := v.claves[kid]
	if !ok {
		return nil, services.ErrTokenGoogleInvalido
	}
	return clave, nil
}

func decodificarParte(parte string, destino any) error {
	b, err := base64.RawURLEncoding.DecodeString(parte)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, destino)
}

var reMaxAge = regexp.MustCompile(`max-age=(\d+)`)

func fuenteHTTP(cliente *http.Client) FuenteClaves {
	return func(ctx context.Context) (map[string]*rsa.PublicKey, time.Duration, error) {
		ctx, cancelar := context.WithTimeout(ctx, 10*time.Second)
		defer cancelar()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, URLClavesFirebase, nil)
		if err != nil {
			return nil, 0, err
		}
		resp, err := cliente.Do(req)
		if err != nil {
			return nil, 0, err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, 0, fmt.Errorf("respuesta %d al pedir claves", resp.StatusCode)
		}
		var certs map[string]string
		if err := json.NewDecoder(resp.Body).Decode(&certs); err != nil {
			return nil, 0, err
		}
		claves := make(map[string]*rsa.PublicKey, len(certs))
		for kid, pemCert := range certs {
			bloque, _ := pem.Decode([]byte(pemCert))
			if bloque == nil {
				continue
			}
			cert, err := x509.ParseCertificate(bloque.Bytes)
			if err != nil {
				continue
			}
			if pub, ok := cert.PublicKey.(*rsa.PublicKey); ok {
				claves[kid] = pub
			}
		}
		if len(claves) == 0 {
			return nil, 0, errors.New("Google no devolvió claves válidas")
		}
		ttl := time.Hour
		if m := reMaxAge.FindStringSubmatch(resp.Header.Get("Cache-Control")); m != nil {
			if seg, err := strconv.Atoi(m[1]); err == nil && seg > 0 {
				ttl = time.Duration(seg) * time.Second
			}
		}
		return claves, ttl, nil
	}
}
