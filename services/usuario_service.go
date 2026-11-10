package services

import (
	"context"
	"errors"
	"sort"
	"strings"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"
)

// UsuarioService administra la vinculación de cuentas con clientes. Solo el rol asesor puede usarlo.
type UsuarioService struct {
	usuarios   repositories.UsuarioRepository
	eventoRepo repositories.EventoRepository
	clientes   repositories.ClienteRepository // opcional: completa la razón social al listar clientes
}

func NewUsuarioService(usuarios repositories.UsuarioRepository, eventoRepo repositories.EventoRepository) *UsuarioService {
	return &UsuarioService{usuarios: usuarios, eventoRepo: eventoRepo}
}

// ConClientes habilita que GET /clientes incluya la razón social de cada cliente.
func (s *UsuarioService) ConClientes(clientes repositories.ClienteRepository) *UsuarioService {
	s.clientes = clientes
	return s
}

func exigirAsesor(u models.Usuario) error {
	if u.Rol != models.RolAsesor {
		return ErrAccesoDenegado
	}
	return nil
}

// CuentasPendientesDeVinculo lista las cuentas de Google que aún no tienen un cliente asociado
// (entraron, pero no ven ningún evento hasta que el asesor las vincule).
func (s *UsuarioService) CuentasPendientesDeVinculo(ctx context.Context, asesor models.Usuario) ([]models.Usuario, error) {
	if err := exigirAsesor(asesor); err != nil {
		return nil, err
	}
	todos, err := s.usuarios.ObtenerUsuarios(ctx)
	if err != nil {
		return nil, err
	}
	pendientes := make([]models.Usuario, 0)
	for _, u := range todos {
		if u.Rol == models.RolCliente && u.Proveedor == "google" && u.ClienteID == "" {
			pendientes = append(pendientes, u)
		}
	}
	sort.Slice(pendientes, func(i, j int) bool { return pendientes[i].Correo < pendientes[j].Correo })
	return pendientes, nil
}

// ClienteConEventos resume un cliente conocido a partir de sus eventos.
type ClienteConEventos struct {
	ClienteID   string   `json:"cliente_id"`
	RazonSocial string   `json:"razon_social,omitempty"` // vacío si el cliente aún no está en la tabla de clientes
	Eventos     []string `json:"eventos"`                // nombres de sus eventos, para reconocerlo al elegirlo
}

// Clientes devuelve los clientes que tienen al menos un evento (los únicos a los que se puede vincular una cuenta).
func (s *UsuarioService) Clientes(ctx context.Context, asesor models.Usuario) ([]ClienteConEventos, error) {
	if err := exigirAsesor(asesor); err != nil {
		return nil, err
	}
	eventos, err := s.eventoRepo.ObtenerEventos(ctx)
	if err != nil {
		return nil, err
	}
	porCliente := map[string][]string{}
	for _, e := range eventos {
		if e.ClienteID != "" {
			porCliente[e.ClienteID] = append(porCliente[e.ClienteID], e.Nombre)
		}
	}
	razones, err := nombresDeClientes(ctx, s.clientes)
	if err != nil {
		return nil, err
	}
	resultado := make([]ClienteConEventos, 0, len(porCliente))
	for id, nombres := range porCliente {
		resultado = append(resultado, ClienteConEventos{ClienteID: id, RazonSocial: razones[id], Eventos: nombres})
	}
	sort.Slice(resultado, func(i, j int) bool { return resultado[i].ClienteID < resultado[j].ClienteID })
	return resultado, nil
}

// VincularCuenta asocia una cuenta de Google con un cliente existente. Reglas:
//   - solo el asesor puede hacerlo;
//   - solo cuentas de Google con rol cliente (las cuentas con contraseña no se tocan);
//   - el cliente debe existir (tener al menos un evento).
//
// Los permisos se leen en cada petición, así que el cliente ve sus eventos de inmediato.
func (s *UsuarioService) VincularCuenta(ctx context.Context, asesor models.Usuario, dto models.VincularCuentaDTO) (models.Usuario, error) {
	if err := exigirAsesor(asesor); err != nil {
		return models.Usuario{}, err
	}
	correo := normalizarCorreo(dto.Correo)
	clienteID := strings.TrimSpace(dto.ClienteID)
	if correo == "" || clienteID == "" {
		return models.Usuario{}, nuevoErrorValidacion("El correo de la cuenta y el cliente son obligatorios.")
	}

	usuario, err := s.usuarios.ObtenerUsuarioPorCorreo(ctx, correo)
	if err != nil {
		if errors.Is(err, repositories.ErrUsuarioNoEncontrado) {
			return models.Usuario{}, nuevoErrorValidacion("La cuenta indicada no existe.")
		}
		return models.Usuario{}, err
	}
	if usuario.Rol != models.RolCliente || usuario.Proveedor != "google" {
		return models.Usuario{}, nuevoErrorValidacion("Solo se pueden vincular cuentas de cliente creadas con Google.")
	}

	clientes, err := s.Clientes(ctx, asesor)
	if err != nil {
		return models.Usuario{}, err
	}
	existe := false
	for _, c := range clientes {
		if c.ClienteID == clienteID {
			existe = true
			break
		}
	}
	if !existe {
		return models.Usuario{}, nuevoErrorValidacion("El cliente indicado no existe.")
	}

	usuario.ClienteID = clienteID
	if err := s.usuarios.GuardarUsuario(ctx, usuario); err != nil {
		return models.Usuario{}, err
	}
	return usuario, nil
}
