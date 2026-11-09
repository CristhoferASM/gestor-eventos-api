package storage

import (
	"context"
	"strings"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"

	"golang.org/x/crypto/bcrypt"
)

var (
	_ repositories.UsuarioRepository = (*Store)(nil)
	_ repositories.SesionRepository  = (*Store)(nil)
)

// AgregarUsuario registra un usuario (el correo se normaliza a minúsculas).
func (s *Store) AgregarUsuario(u models.Usuario) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.inicializarAuth()
	u.Correo = strings.ToLower(strings.TrimSpace(u.Correo))
	s.usuarios[u.Correo] = u
}

// CargarUsuariosDemo registra las cuentas de demostración del prototipo (asesor y cliente CLI-001).
// Solo para desarrollo: las contraseñas son públicas en el prototipo original.
func (s *Store) CargarUsuariosDemo() error {
	demos := []struct {
		usuario  models.Usuario
		password string
	}{
		{models.Usuario{ID: 1, Correo: "asesor@showtech.com", Nombre: "Asesor(a) comercial", Rol: models.RolAsesor}, "Asesor2026!"},
		{models.Usuario{ID: 2, Correo: "cliente@horizonte.com", Nombre: "Promoción Horizonte 2026", Rol: models.RolCliente, ClienteID: "CLI-001"}, "Cliente2026!"},
	}
	for _, d := range demos {
		hash, err := bcrypt.GenerateFromPassword([]byte(d.password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		d.usuario.PasswordHash = string(hash)
		s.AgregarUsuario(d.usuario)
	}
	return nil
}

// inicializarAuth crea los mapas de autenticación si aún no existen. Requiere s.mu tomado para escritura.
func (s *Store) inicializarAuth() {
	if s.usuarios == nil {
		s.usuarios = make(map[string]models.Usuario)
	}
	if s.desafios == nil {
		s.desafios = make(map[string]models.DesafioVerificacion)
	}
	if s.sesiones == nil {
		s.sesiones = make(map[string]models.Sesion)
	}
}

func (s *Store) ObtenerUsuarios(_ context.Context) ([]models.Usuario, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	lista := make([]models.Usuario, 0, len(s.usuarios))
	for _, u := range s.usuarios {
		lista = append(lista, u)
	}
	return lista, nil
}

func (s *Store) GuardarUsuario(_ context.Context, u models.Usuario) error {
	s.AgregarUsuario(u)
	return nil
}

func (s *Store) ObtenerUsuarioPorCorreo(_ context.Context, correo string) (models.Usuario, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.usuarios[correo]
	if !ok {
		return models.Usuario{}, repositories.ErrUsuarioNoEncontrado
	}
	return u, nil
}

func (s *Store) GuardarDesafio(_ context.Context, d models.DesafioVerificacion) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.inicializarAuth()
	s.desafios[d.ID] = d
	return nil
}

func (s *Store) ObtenerDesafio(_ context.Context, id string) (models.DesafioVerificacion, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	d, ok := s.desafios[id]
	if !ok {
		return models.DesafioVerificacion{}, repositories.ErrDesafioNoEncontrado
	}
	return d, nil
}

func (s *Store) EliminarDesafio(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.desafios, id)
	return nil
}

func (s *Store) GuardarVerificacionDiaria(_ context.Context, dispositivoID, correo, dia string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.verifDiaria == nil {
		s.verifDiaria = make(map[string]string)
	}
	s.verifDiaria[dispositivoID+"|"+correo] = dia
	return nil
}

func (s *Store) ObtenerVerificacionDiaria(_ context.Context, dispositivoID, correo string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.verifDiaria[dispositivoID+"|"+correo], nil
}

func (s *Store) GuardarSesion(_ context.Context, ses models.Sesion) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.inicializarAuth()
	s.sesiones[ses.Token] = ses
	return nil
}

func (s *Store) ObtenerSesion(_ context.Context, token string) (models.Sesion, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ses, ok := s.sesiones[token]
	if !ok {
		return models.Sesion{}, repositories.ErrSesionNoEncontrada
	}
	return ses, nil
}

func (s *Store) EliminarSesion(_ context.Context, token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sesiones, token)
	return nil
}
