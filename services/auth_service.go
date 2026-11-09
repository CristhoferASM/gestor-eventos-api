package services

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"

	"golang.org/x/crypto/bcrypt"
)

const (
	// DuracionCodigo es la vigencia del código de verificación (igual que el prototipo: 60 s).
	DuracionCodigo = 60 * time.Second
	// EsperaReenvio es el tiempo mínimo entre envíos del código (igual que el prototipo: 30 s).
	EsperaReenvio = 30 * time.Second
	// DuracionSesion es la vigencia de una sesión autenticada.
	DuracionSesion = 8 * time.Hour
	// MaxIntentosCodigo es la cantidad de códigos erróneos permitidos antes de invalidar el desafío.
	MaxIntentosCodigo = 5

	// MaxFallosLogin es la cantidad de contraseñas erróneas permitidas por correo antes de bloquearlo temporalmente.
	MaxFallosLogin = 5
	// VentanaFallosLogin es el tiempo durante el que se acumulan los fallos de contraseña.
	VentanaFallosLogin = 15 * time.Minute
	// BloqueoLogin es cuánto dura el bloqueo tras superar MaxFallosLogin.
	BloqueoLogin = 15 * time.Minute

	maxRegistrosFallos = 10000
)

// zonaLima es la hora de Perú (UTC-5, sin horario de verano). El «día» de la verificación diaria se cuenta en esta zona
// para que no dependa de la zona horaria del navegador ni del servidor.
var zonaLima = time.FixedZone("America/Lima", -5*60*60)

func diaLima(t time.Time) string { return t.In(zonaLima).Format("2006-01-02") }

// NotificadorCodigo entrega el código de verificación al usuario (correo, SMS...).
// Hoy solo existe una implementación de consola para desarrollo: aún no hay envío real de correos.
type NotificadorCodigo interface {
	EnviarCodigo(ctx context.Context, correo, codigo string) error
}

type registroFallos struct {
	cuenta         int
	desde          time.Time
	bloqueadoHasta time.Time
}

// hashFicticio se compara cuando el correo no existe, para que el tiempo de respuesta no revele qué correos están registrados.
var (
	hashFicticio     []byte
	hashFicticioOnce sync.Once
)

// IdentidadGoogle son los datos de la cuenta de Google ya validados por el verificador.
type IdentidadGoogle struct {
	UID         string
	Correo      string
	CorreoVerif bool
	Nombre      string
}

// VerificadorGoogle valida un ID token de Firebase. Devuelve ErrTokenGoogleInvalido si no es válido.
type VerificadorGoogle interface {
	Verificar(ctx context.Context, idToken string) (IdentidadGoogle, error)
}

// AuthService implementa el acceso en dos pasos: correo y contraseña, y luego código de verificación (simulado).
type AuthService struct {
	usuarios      repositories.UsuarioRepository
	sesiones      repositories.SesionRepository
	clock         ClockFunc
	generarCodigo func() (string, error)
	generarToken  func() (string, error)
	googleVerif   VerificadorGoogle
	notificador   NotificadorCodigo
	mostrarCodigo bool // incluir codigo_prueba en la respuesta (solo modo demostración)

	muFallos sync.Mutex
	fallos   map[string]*registroFallos

	mu sync.Mutex // serializa verificar/reenviar para que el límite de intentos sea exacto
}

// NewAuthService crea el servicio con reloj real y generadores aleatorios criptográficos.
func NewAuthService(usuarios repositories.UsuarioRepository, sesiones repositories.SesionRepository) *AuthService {
	return NewAuthServiceCompleto(usuarios, sesiones, time.Now, generarCodigoAleatorio, generarTokenAleatorio)
}

// NewAuthServiceCompleto permite inyectar reloj y generadores para pruebas deterministas.
func NewAuthServiceCompleto(
	usuarios repositories.UsuarioRepository,
	sesiones repositories.SesionRepository,
	clock ClockFunc,
	generarCodigo func() (string, error),
	generarToken func() (string, error),
) *AuthService {
	return &AuthService{
		usuarios:      usuarios,
		sesiones:      sesiones,
		clock:         clock,
		generarCodigo: generarCodigo,
		generarToken:  generarToken,
		mostrarCodigo: true,
		fallos:        make(map[string]*registroFallos),
	}
}

// ConNotificador define cómo se entrega el código y si la respuesta de la API lo incluye (codigo_prueba).
// Con mostrarCodigoPrueba=false el código solo llega por el notificador: es el modo previsto para producción.
func (s *AuthService) ConNotificador(n NotificadorCodigo, mostrarCodigoPrueba bool) *AuthService {
	s.notificador = n
	s.mostrarCodigo = mostrarCodigoPrueba
	return s
}

// bloqueado informa si el correo está bloqueado por intentos fallidos de contraseña.
func (s *AuthService) bloqueado(correo string) bool {
	s.muFallos.Lock()
	defer s.muFallos.Unlock()
	r, ok := s.fallos[correo]
	return ok && s.clock().Before(r.bloqueadoHasta)
}

// registrarFallo cuenta un fallo de contraseña (exista o no el correo, para no revelar cuáles existen).
func (s *AuthService) registrarFallo(correo string) {
	s.muFallos.Lock()
	defer s.muFallos.Unlock()
	ahora := s.clock()
	if len(s.fallos) >= maxRegistrosFallos {
		for k, v := range s.fallos {
			if ahora.After(v.bloqueadoHasta) && ahora.Sub(v.desde) > VentanaFallosLogin {
				delete(s.fallos, k)
			}
		}
	}
	r, ok := s.fallos[correo]
	if !ok || ahora.Sub(r.desde) > VentanaFallosLogin {
		r = &registroFallos{desde: ahora}
		s.fallos[correo] = r
	}
	r.cuenta++
	if r.cuenta >= MaxFallosLogin {
		r.bloqueadoHasta = ahora.Add(BloqueoLogin)
	}
}

func (s *AuthService) limpiarFallos(correo string) {
	s.muFallos.Lock()
	defer s.muFallos.Unlock()
	delete(s.fallos, correo)
}

func (s *AuthService) notificar(ctx context.Context, d models.DesafioVerificacion) {
	if s.notificador != nil {
		// Un fallo al notificar no invalida el desafío: el usuario puede pedir un reenvío.
		_ = s.notificador.EnviarCodigo(ctx, d.Correo, d.Codigo)
	}
}

// ConVerificadorGoogle habilita POST /auth/google. Sin verificador, el acceso con Google responde ErrGoogleNoDisponible.
func (s *AuthService) ConVerificadorGoogle(v VerificadorGoogle) *AuthService {
	s.googleVerif = v
	return s
}

// abrirSesion crea y guarda una sesión para el usuario.
func (s *AuthService) abrirSesion(ctx context.Context, usuario models.Usuario) (models.RespuestaSesion, error) {
	token, err := s.generarToken()
	if err != nil {
		return models.RespuestaSesion{}, err
	}
	sesion := models.Sesion{Token: token, Correo: usuario.Correo, ExpiraEn: s.clock().Add(DuracionSesion)}
	if err := s.sesiones.GuardarSesion(ctx, sesion); err != nil {
		return models.RespuestaSesion{}, err
	}
	return models.RespuestaSesion{Token: token, ExpiraEn: sesion.ExpiraEn, Usuario: usuario}, nil
}

// LoginConGoogle valida el ID token y abre sesión. La cuenta se crea como cliente sin cliente_id vinculado
// (no ve eventos hasta que se vincule). Si el correo ya pertenece a una cuenta con contraseña se rechaza,
// para que Google nunca dé acceso a cuentas existentes como la del asesor.
func (s *AuthService) LoginConGoogle(ctx context.Context, dto models.LoginGoogleDTO) (models.RespuestaSesion, error) {
	if s.googleVerif == nil {
		return models.RespuestaSesion{}, ErrGoogleNoDisponible
	}
	ident, err := s.googleVerif.Verificar(ctx, dto.IDToken)
	if err != nil {
		return models.RespuestaSesion{}, err
	}
	if !ident.CorreoVerif {
		return models.RespuestaSesion{}, ErrCorreoGoogleNoVerificado
	}
	correo := normalizarCorreo(ident.Correo)

	usuario, err := s.usuarios.ObtenerUsuarioPorCorreo(ctx, correo)
	switch {
	case err == nil:
		if usuario.Proveedor != "google" {
			return models.RespuestaSesion{}, ErrCuentaConContrasena
		}
	case errors.Is(err, repositories.ErrUsuarioNoEncontrado):
		nombre := strings.TrimSpace(ident.Nombre)
		if nombre == "" {
			nombre = correo
		}
		usuario = models.Usuario{Correo: correo, Nombre: nombre, Rol: models.RolCliente, Proveedor: "google"}
		if err := s.usuarios.GuardarUsuario(ctx, usuario); err != nil {
			return models.RespuestaSesion{}, err
		}
	default:
		return models.RespuestaSesion{}, err
	}

	return s.abrirSesion(ctx, usuario)
}

// IniciarLogin valida correo y contraseña y, si son correctos, crea el desafío de verificación.
func (s *AuthService) IniciarLogin(ctx context.Context, dto models.LoginDTO) (models.RespuestaDesafio, error) {
	correo := normalizarCorreo(dto.Correo)
	if correo == "" || dto.Password == "" {
		return models.RespuestaDesafio{}, nuevoErrorValidacion("El correo y la contraseña son obligatorios.")
	}

	if s.bloqueado(correo) {
		return models.RespuestaDesafio{}, ErrLoginBloqueado
	}

	usuario, err := s.usuarios.ObtenerUsuarioPorCorreo(ctx, correo)
	if err != nil {
		if errors.Is(err, repositories.ErrUsuarioNoEncontrado) {
			_ = bcrypt.CompareHashAndPassword(obtenerHashFicticio(), []byte(dto.Password))
			s.registrarFallo(correo)
			return models.RespuestaDesafio{}, ErrCredencialesInvalidas
		}
		return models.RespuestaDesafio{}, err
	}
	if bcrypt.CompareHashAndPassword([]byte(usuario.PasswordHash), []byte(dto.Password)) != nil {
		s.registrarFallo(correo)
		return models.RespuestaDesafio{}, ErrCredencialesInvalidas
	}
	s.limpiarFallos(correo)

	// Regla del prototipo: al asesor se le pide el código una sola vez por día de Lima y por navegador.
	// La contraseña SIEMPRE se exige (arriba); esto solo omite el segundo paso.
	esAsesor := usuario.Rol == models.RolAsesor
	if esAsesor && dto.DispositivoID != "" {
		dia, err := s.sesiones.ObtenerVerificacionDiaria(ctx, dto.DispositivoID, usuario.Correo)
		if err != nil {
			return models.RespuestaDesafio{}, err
		}
		if dia != "" && dia == diaLima(s.clock()) {
			sesion, err := s.abrirSesion(ctx, usuario)
			if err != nil {
				return models.RespuestaDesafio{}, err
			}
			return models.RespuestaDesafio{RecordatorioDiario: true, Sesion: &sesion}, nil
		}
	}

	id, err := s.generarToken()
	if err != nil {
		return models.RespuestaDesafio{}, err
	}
	codigo, err := s.generarCodigo()
	if err != nil {
		return models.RespuestaDesafio{}, err
	}
	ahora := s.clock()
	desafio := models.DesafioVerificacion{
		ID:                    id,
		Correo:                usuario.Correo,
		Codigo:                codigo,
		ExpiraEn:              ahora.Add(DuracionCodigo),
		ReenvioPermitidoDesde: ahora.Add(EsperaReenvio),
	}
	if err := s.sesiones.GuardarDesafio(ctx, desafio); err != nil {
		return models.RespuestaDesafio{}, err
	}
	s.notificar(ctx, desafio)
	resp := s.respuestaDesafio(desafio)
	resp.RecordatorioDiario = esAsesor
	return resp, nil
}

// ReenviarCodigo genera un código nuevo para un desafío existente, respetando la espera mínima.
func (s *AuthService) ReenviarCodigo(ctx context.Context, dto models.ReenviarCodigoDTO) (models.RespuestaDesafio, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	desafio, err := s.sesiones.ObtenerDesafio(ctx, dto.DesafioID)
	if err != nil {
		if errors.Is(err, repositories.ErrDesafioNoEncontrado) {
			return models.RespuestaDesafio{}, ErrDesafioInvalido
		}
		return models.RespuestaDesafio{}, err
	}
	ahora := s.clock()
	if ahora.Before(desafio.ReenvioPermitidoDesde) {
		return models.RespuestaDesafio{}, ErrReenvioMuyPronto
	}
	codigo, err := s.generarCodigo()
	if err != nil {
		return models.RespuestaDesafio{}, err
	}
	desafio.Codigo = codigo
	desafio.ExpiraEn = ahora.Add(DuracionCodigo)
	desafio.ReenvioPermitidoDesde = ahora.Add(EsperaReenvio)
	desafio.Intentos = 0
	if err := s.sesiones.GuardarDesafio(ctx, desafio); err != nil {
		return models.RespuestaDesafio{}, err
	}
	s.notificar(ctx, desafio)
	return s.respuestaDesafio(desafio), nil
}

// VerificarCodigo valida el código y, si es correcto, consume el desafío y crea la sesión.
func (s *AuthService) VerificarCodigo(ctx context.Context, dto models.VerificarCodigoDTO) (models.RespuestaSesion, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	desafio, err := s.sesiones.ObtenerDesafio(ctx, dto.DesafioID)
	if err != nil {
		if errors.Is(err, repositories.ErrDesafioNoEncontrado) {
			return models.RespuestaSesion{}, ErrDesafioInvalido
		}
		return models.RespuestaSesion{}, err
	}
	ahora := s.clock()
	if !ahora.Before(desafio.ExpiraEn) {
		return models.RespuestaSesion{}, ErrCodigoExpirado
	}

	if subtle.ConstantTimeCompare([]byte(strings.TrimSpace(dto.Codigo)), []byte(desafio.Codigo)) != 1 {
		desafio.Intentos++
		if desafio.Intentos >= MaxIntentosCodigo {
			_ = s.sesiones.EliminarDesafio(ctx, desafio.ID)
			return models.RespuestaSesion{}, ErrDemasiadosIntentos
		}
		if err := s.sesiones.GuardarDesafio(ctx, desafio); err != nil {
			return models.RespuestaSesion{}, err
		}
		return models.RespuestaSesion{}, ErrCodigoIncorrecto
	}

	usuario, err := s.usuarios.ObtenerUsuarioPorCorreo(ctx, desafio.Correo)
	if err != nil {
		return models.RespuestaSesion{}, err
	}
	respuesta, err := s.abrirSesion(ctx, usuario)
	if err != nil {
		return models.RespuestaSesion{}, err
	}
	_ = s.sesiones.EliminarDesafio(ctx, desafio.ID)
	if usuario.Rol == models.RolAsesor && dto.DispositivoID != "" {
		// Un fallo al recordar la verificación no debe impedir el acceso: solo se volverá a pedir el código
		_ = s.sesiones.GuardarVerificacionDiaria(ctx, dto.DispositivoID, usuario.Correo, diaLima(ahora))
	}
	return respuesta, nil
}

// UsuarioDeSesion devuelve el usuario dueño de un token vigente.
func (s *AuthService) UsuarioDeSesion(ctx context.Context, token string) (models.Usuario, error) {
	if token == "" {
		return models.Usuario{}, ErrSesionInvalida
	}
	sesion, err := s.sesiones.ObtenerSesion(ctx, token)
	if err != nil {
		if errors.Is(err, repositories.ErrSesionNoEncontrada) {
			return models.Usuario{}, ErrSesionInvalida
		}
		return models.Usuario{}, err
	}
	if !s.clock().Before(sesion.ExpiraEn) {
		_ = s.sesiones.EliminarSesion(ctx, token)
		return models.Usuario{}, ErrSesionInvalida
	}
	usuario, err := s.usuarios.ObtenerUsuarioPorCorreo(ctx, sesion.Correo)
	if err != nil {
		if errors.Is(err, repositories.ErrUsuarioNoEncontrado) {
			return models.Usuario{}, ErrSesionInvalida
		}
		return models.Usuario{}, err
	}
	return usuario, nil
}

// CerrarSesion invalida el token. Es idempotente.
func (s *AuthService) CerrarSesion(ctx context.Context, token string) error {
	return s.sesiones.EliminarSesion(ctx, token)
}

func (s *AuthService) respuestaDesafio(d models.DesafioVerificacion) models.RespuestaDesafio {
	codigo := ""
	if s.mostrarCodigo {
		codigo = d.Codigo
	}
	return models.RespuestaDesafio{
		DesafioID:         d.ID,
		CorreoEnmascarado: enmascararCorreo(d.Correo),
		ExpiraEnSegundos:  int(DuracionCodigo / time.Second),
		ReenvioEnSegundos: int(EsperaReenvio / time.Second),
		CodigoPrueba:      codigo,
	}
}

func normalizarCorreo(correo string) string {
	return strings.ToLower(strings.TrimSpace(correo))
}

// enmascararCorreo devuelve "as***@showtech.com" a partir de "asesor@showtech.com".
func enmascararCorreo(correo string) string {
	local, dominio, ok := strings.Cut(correo, "@")
	if !ok {
		return "***"
	}
	runas := []rune(local)
	if len(runas) > 2 {
		runas = runas[:2]
	}
	return string(runas) + "***@" + dominio
}

func obtenerHashFicticio() []byte {
	hashFicticioOnce.Do(func() {
		hashFicticio, _ = bcrypt.GenerateFromPassword([]byte("contraseña-ficticia"), bcrypt.DefaultCost)
	})
	return hashFicticio
}

func generarCodigoAleatorio() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()+100000), nil
}

func generarTokenAleatorio() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
