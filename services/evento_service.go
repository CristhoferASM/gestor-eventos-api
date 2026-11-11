package services

import (
	"context"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"
)

// EventoService coordina la lógica de consulta de eventos.
type EventoService struct {
	eventoRepo repositories.EventoRepository
	clientes   repositories.ClienteRepository // opcional: completa Evento.ClienteNombre
	catalogoRepo repositories.AdicionalRepository // opcional: catálogo de adicionales (si es nil, el simulado)
}

// ConClientes habilita que los eventos incluyan la razón social de su cliente (cliente_nombre).
func (s *EventoService) ConClientes(clientes repositories.ClienteRepository) *EventoService {
	s.clientes = clientes
	return s
}

// ConCatalogo hace que el catálogo de adicionales venga del repositorio (la tabla `adicional` de la base de datos de la
// empresa). Sin él se usa el catálogo simulado del prototipo.
func (s *EventoService) ConCatalogo(r repositories.AdicionalRepository) *EventoService {
	s.catalogoRepo = r
	return s
}

// ObtenerCatalogo devuelve el catálogo de adicionales disponibles.
func (s *EventoService) ObtenerCatalogo(ctx context.Context) ([]models.AdicionalCatalogo, error) {
	if s.catalogoRepo == nil {
		return models.CatalogoAdicionalesSimulado, nil
	}
	lista, err := s.catalogoRepo.ObtenerAdicionales(ctx)
	if err != nil {
		return nil, err
	}
	if lista == nil {
		lista = []models.AdicionalCatalogo{}
	}
	return lista, nil
}

// nombresDeClientes devuelve la razón social por código de cliente (vacío si no hay repositorio de clientes).
func nombresDeClientes(ctx context.Context, repo repositories.ClienteRepository) (map[string]string, error) {
	nombres := map[string]string{}
	if repo == nil {
		return nombres, nil
	}
	lista, err := repo.ObtenerClientes(ctx)
	if err != nil {
		return nil, err
	}
	for _, c := range lista {
		nombres[c.ID] = c.RazonSocial
	}
	return nombres, nil
}

// NewEventoService crea una nueva instancia de EventoService.
func NewEventoService(eventoRepo repositories.EventoRepository) *EventoService {
	return &EventoService{
		eventoRepo: eventoRepo,
	}
}

// ObtenerEventos retorna el listado de eventos disponibles garantizando un slice no nulo.
func (s *EventoService) ObtenerEventos(ctx context.Context) ([]models.Evento, error) {
	eventos, err := s.eventoRepo.ObtenerEventos(ctx)
	if err != nil {
		return nil, err
	}
	if eventos == nil {
		return make([]models.Evento, 0), nil
	}
	if err := s.completarClientes(ctx, eventos); err != nil {
		return nil, err
	}
	return eventos, nil
}

// completarClientes agrega la razón social a los eventos que no la traen. Solo consulta los clientes si hace falta:
// el almacén de la base de datos de la empresa ya la trae en la misma consulta del evento y así se ahorra una ida y
// vuelta a la base.
func (s *EventoService) completarClientes(ctx context.Context, eventos []models.Evento) error {
	falta := false
	for _, e := range eventos {
		if e.ClienteID != "" && e.ClienteNombre == "" {
			falta = true
			break
		}
	}
	if !falta {
		return nil
	}
	nombres, err := nombresDeClientes(ctx, s.clientes)
	if err != nil {
		return err
	}
	for i := range eventos {
		if eventos[i].ClienteNombre == "" {
			eventos[i].ClienteNombre = nombres[eventos[i].ClienteID]
		}
	}
	return nil
}

// puedeVerEvento indica si el usuario puede acceder al evento: el asesor ve todos; el cliente solo los suyos.
// Un rol desconocido o un cliente sin cliente_id vinculado no ve ninguno.
func puedeVerEvento(u models.Usuario, e models.Evento) bool {
	switch u.Rol {
	case models.RolAsesor:
		return true
	case models.RolCliente:
		return u.ClienteID != "" && u.ClienteID == e.ClienteID
	default:
		return false
	}
}

// ObtenerEventosDe retorna solo los eventos que el usuario puede ver, garantizando un slice no nulo.
func (s *EventoService) ObtenerEventosDe(ctx context.Context, u models.Usuario) ([]models.Evento, error) {
	todos, err := s.ObtenerEventos(ctx)
	if err != nil {
		return nil, err
	}
	visibles := make([]models.Evento, 0, len(todos))
	for _, e := range todos {
		if puedeVerEvento(u, e) {
			visibles = append(visibles, e)
		}
	}
	return visibles, nil
}

// ObtenerEventoDe retorna el evento si el usuario puede verlo. Si pertenece a otro cliente responde
// ErrEventoNoEncontrado (igual que si no existiera) para no revelar su existencia.
func (s *EventoService) ObtenerEventoDe(ctx context.Context, id uint, u models.Usuario) (models.Evento, error) {
	evento, err := s.ObtenerEventoPorID(ctx, id)
	if err != nil {
		return models.Evento{}, err
	}
	if !puedeVerEvento(u, evento) {
		return models.Evento{}, ErrEventoNoEncontrado
	}
	return evento, nil
}

// ObtenerEventoPorID valida el identificador y consulta el detalle de un evento específico.
func (s *EventoService) ObtenerEventoPorID(ctx context.Context, id uint) (models.Evento, error) {
	if id == 0 {
		return models.Evento{}, nuevoErrorValidacion("El identificador del evento debe ser un número entero positivo.")
	}
	evento, err := s.eventoRepo.ObtenerEventoPorID(ctx, id)
	if err != nil {
		return models.Evento{}, err
	}
	unico := []models.Evento{evento}
	if err := s.completarClientes(ctx, unico); err != nil {
		return models.Evento{}, err
	}
	return unico[0], nil
}
