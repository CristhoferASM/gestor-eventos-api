package storage

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"
	"gestor-eventos-api/storage/db"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migraciones/*.sql
var migraciones embed.FS

var (
	_ repositories.EventoRepository    = (*PostgresStore)(nil)
	_ repositories.SolicitudRepository = (*PostgresStore)(nil)
	_ repositories.UsuarioRepository   = (*PostgresStore)(nil)
	_ repositories.SesionRepository    = (*PostgresStore)(nil)
	_ repositories.BloqueoRepository   = (*PostgresStore)(nil)
	_ repositories.ClienteRepository   = (*PostgresStore)(nil)
)

// Códigos de error de PostgreSQL que traducimos a errores de dominio.
const (
	pgViolacionUnica = "23505"
	pgViolacionFK    = "23503"
)

// PostgresStore implementa todos los repositorios sobre PostgreSQL. Los datos sobreviven a los reinicios.
// Las consultas viven en storage/queries/*.sql y sqlc genera el código tipado en storage/db (sqlc + pgx):
// tras cambiar un .sql o una migración, ejecutar `sqlc generate` desde la raíz del repositorio.
type PostgresStore struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

// NewPostgresStore se conecta, comprueba la conexión y aplica las migraciones pendientes.
func NewPostgresStore(ctx context.Context, url string) (*PostgresStore, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("configuración de PostgreSQL inválida: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("no se pudo conectar con PostgreSQL: %w", err)
	}
	s := &PostgresStore{pool: pool, q: db.New(pool)}
	if err := s.migrar(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return s, nil
}

// Close libera las conexiones.
func (s *PostgresStore) Close() { s.pool.Close() }

// migrar aplica en orden los archivos migraciones/NNN_*.sql que aún no se hayan ejecutado, cada uno en su transacción.
// Es SQL de infraestructura (no de negocio), por eso queda fuera de sqlc.
func (s *PostgresStore) migrar(ctx context.Context) error {
	if _, err := s.pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())`); err != nil {
		return fmt.Errorf("no se pudo preparar el control de migraciones: %w", err)
	}
	entradas, err := migraciones.ReadDir("migraciones")
	if err != nil {
		return err
	}
	nombres := make([]string, 0, len(entradas))
	for _, e := range entradas {
		nombres = append(nombres, e.Name())
	}
	sort.Strings(nombres)

	for _, nombre := range nombres {
		var existe bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, nombre).Scan(&existe); err != nil {
			return err
		}
		if existe {
			continue
		}
		sql, err := migraciones.ReadFile("migraciones/" + nombre)
		if err != nil {
			return err
		}
		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("falló la migración %s: %w", nombre, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, nombre); err != nil {
			_ = tx.Rollback(ctx)
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
	}
	return nil
}

func hashDe(texto string) string {
	h := sha256.Sum256([]byte(texto))
	return hex.EncodeToString(h[:])
}

func esErrorPG(err error, codigo string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == codigo
}

// SembrarDemo carga los datos de demostración (eventos, bloqueo y cuentas demo). Los eventos y bloqueos solo se
// insertan si la tabla está vacía, y las cuentas con ON CONFLICT DO NOTHING: así nunca se pisa lo que ya se hizo
// (por ejemplo, una cuenta de Google vinculada a un cliente).
func (s *PostgresStore) SembrarDemo(ctx context.Context) error {
	mem := NewMemoryStore()
	if err := mem.CargarUsuariosDemo(); err != nil {
		return err
	}

	n, err := s.q.ContarEventos(ctx)
	if err != nil {
		return err
	}
	if n == 0 {
		eventos, _ := mem.ObtenerEventos(ctx)
		for _, e := range eventos {
			datos, err := json.Marshal(e)
			if err != nil {
				return err
			}
			if err := s.q.InsertarEvento(ctx, db.InsertarEventoParams{
				ID: int64(e.ID), ClienteID: e.ClienteID, Fecha: e.Fecha, Datos: datos,
			}); err != nil {
				return err
			}
		}
		bloqueos, _ := mem.ObtenerBloqueos(ctx)
		for _, b := range bloqueos {
			datos, err := json.Marshal(b)
			if err != nil {
				return err
			}
			if err := s.q.InsertarBloqueo(ctx, db.InsertarBloqueoParams{ID: b.ID, Fecha: b.Fecha, Datos: datos}); err != nil {
				return err
			}
		}
	}

	// Los clientes demo se insertan siempre que falten (también en bases anteriores a la tabla de clientes)
	clientes, _ := mem.ObtenerClientes(ctx)
	for _, c := range clientes {
		if err := s.q.InsertarClienteSiFalta(ctx, db.InsertarClienteSiFaltaParams{ID: c.ID, RazonSocial: c.RazonSocial}); err != nil {
			return err
		}
	}

	usuarios, _ := mem.ObtenerUsuarios(ctx)
	for _, u := range usuarios {
		if err := s.q.InsertarUsuarioSiFalta(ctx, db.InsertarUsuarioSiFaltaParams{
			Correo: u.Correo, ID: int64(u.ID), Nombre: u.Nombre, Rol: u.Rol,
			ClienteID: u.ClienteID, Proveedor: u.Proveedor, PasswordHash: u.PasswordHash,
		}); err != nil {
			return err
		}
	}
	return nil
}

// ---------------------------------------------------------------- eventos

func (s *PostgresStore) ObtenerEventos(ctx context.Context) ([]models.Evento, error) {
	filas, err := s.q.ListarEventos(ctx)
	if err != nil {
		return nil, err
	}
	lista := make([]models.Evento, 0, len(filas))
	for _, datos := range filas {
		var e models.Evento
		if err := json.Unmarshal(datos, &e); err != nil {
			return nil, err
		}
		lista = append(lista, e)
	}
	return lista, nil
}

func (s *PostgresStore) ObtenerEventoPorID(ctx context.Context, id uint) (models.Evento, error) {
	datos, err := s.q.ObtenerEventoPorID(ctx, int64(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Evento{}, repositories.ErrEventoNoEncontrado
	}
	if err != nil {
		return models.Evento{}, err
	}
	var e models.Evento
	return e, json.Unmarshal(datos, &e)
}

// ---------------------------------------------------------------- clientes

func (s *PostgresStore) ObtenerClientes(ctx context.Context) ([]models.Cliente, error) {
	filas, err := s.q.ListarClientes(ctx)
	if err != nil {
		return nil, err
	}
	lista := make([]models.Cliente, 0, len(filas))
	for _, f := range filas {
		lista = append(lista, models.Cliente{ID: f.ID, RazonSocial: f.RazonSocial})
	}
	return lista, nil
}

// ObtenerAdicionales devuelve el catálogo simulado: el almacén propio no tiene tabla de adicionales.
func (s *PostgresStore) ObtenerAdicionales(ctx context.Context) ([]models.AdicionalCatalogo, error) {
	return models.CatalogoAdicionalesSimulado, nil
}

// ---------------------------------------------------------------- bloqueos

func (s *PostgresStore) ObtenerBloqueos(ctx context.Context) ([]models.BloqueoInstitucional, error) {
	filas, err := s.q.ListarBloqueos(ctx)
	if err != nil {
		return nil, err
	}
	lista := make([]models.BloqueoInstitucional, 0, len(filas))
	for _, datos := range filas {
		var b models.BloqueoInstitucional
		if err := json.Unmarshal(datos, &b); err != nil {
			return nil, err
		}
		lista = append(lista, b)
	}
	return lista, nil
}

// ---------------------------------------------------------------- solicitudes

func solicitudDesdeFila(id int64, estado string, datos []byte) (models.Solicitud, error) {
	var sol models.Solicitud
	if err := json.Unmarshal(datos, &sol); err != nil {
		return models.Solicitud{}, err
	}
	sol.ID = uint(id)
	sol.Estado = estado
	return sol, nil
}

// CrearSolicitud inserta la solicitud. La unicidad de la pendiente por evento y la existencia del evento las
// garantiza la base de datos (índice único parcial y clave foránea), por lo que es correcto incluso con concurrencia.
func (s *PostgresStore) CrearSolicitud(ctx context.Context, sol models.Solicitud) (models.Solicitud, error) {
	datos, err := json.Marshal(sol)
	if err != nil {
		return models.Solicitud{}, err
	}
	id, err := s.q.InsertarSolicitud(ctx, db.InsertarSolicitudParams{
		EventoID: int64(sol.EventoID), Estado: sol.Estado, Datos: datos,
	})
	switch {
	case esErrorPG(err, pgViolacionUnica):
		return models.Solicitud{}, repositories.ErrSolicitudPendienteDuplicada
	case esErrorPG(err, pgViolacionFK):
		return models.Solicitud{}, repositories.ErrEventoNoEncontrado
	case err != nil:
		return models.Solicitud{}, err
	}
	sol.ID = uint(id)
	return sol, nil
}

func (s *PostgresStore) ObtenerSolicitudes(ctx context.Context) ([]models.Solicitud, error) {
	filas, err := s.q.ListarSolicitudes(ctx)
	if err != nil {
		return nil, err
	}
	lista := make([]models.Solicitud, 0, len(filas))
	for _, f := range filas {
		sol, err := solicitudDesdeFila(f.ID, f.Estado, f.Datos)
		if err != nil {
			return nil, err
		}
		lista = append(lista, sol)
	}
	return lista, nil
}

// RetirarSolicitud pasa de forma atómica a «Retirada por el cliente» solo si sigue pendiente:
// el UPDATE condicional evita que dos retiros simultáneos tengan éxito a la vez.
func (s *PostgresStore) RetirarSolicitud(ctx context.Context, id uint, fechaRetiro string) (models.Solicitud, error) {
	fila, err := s.q.RetirarSolicitudPendiente(ctx, db.RetirarSolicitudPendienteParams{
		EstadoNuevo:     models.EstadoRetiradaCliente,
		FechaRetiro:     fechaRetiro,
		ID:              int64(id),
		EstadoRequerido: models.EstadoPendienteRevision,
	})
	if err == nil {
		return solicitudDesdeFila(int64(id), fila.Estado, fila.Datos)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return models.Solicitud{}, err
	}
	// Ninguna fila cambió: o no existe, o ya no estaba pendiente
	existe, err := s.q.ExisteSolicitud(ctx, int64(id))
	if err != nil {
		return models.Solicitud{}, err
	}
	if !existe {
		return models.Solicitud{}, repositories.ErrSolicitudNoEncontrada
	}
	return models.Solicitud{}, repositories.ErrSolicitudNoPendiente
}

// ---------------------------------------------------------------- usuarios

func usuarioDesdeFila(u db.Usuario) models.Usuario {
	return models.Usuario{
		ID: uint(u.ID), Correo: u.Correo, Nombre: u.Nombre, Rol: u.Rol,
		ClienteID: u.ClienteID, Proveedor: u.Proveedor, PasswordHash: u.PasswordHash,
	}
}

func (s *PostgresStore) ObtenerUsuarioPorCorreo(ctx context.Context, correo string) (models.Usuario, error) {
	u, err := s.q.ObtenerUsuarioPorCorreo(ctx, correo)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Usuario{}, repositories.ErrUsuarioNoEncontrado
	}
	return usuarioDesdeFila(u), err
}

func (s *PostgresStore) GuardarUsuario(ctx context.Context, u models.Usuario) error {
	return s.q.GuardarUsuario(ctx, db.GuardarUsuarioParams{
		Correo: u.Correo, ID: int64(u.ID), Nombre: u.Nombre, Rol: u.Rol,
		ClienteID: u.ClienteID, Proveedor: u.Proveedor, PasswordHash: u.PasswordHash,
	})
}

func (s *PostgresStore) ObtenerUsuarios(ctx context.Context) ([]models.Usuario, error) {
	filas, err := s.q.ListarUsuarios(ctx)
	if err != nil {
		return nil, err
	}
	lista := make([]models.Usuario, 0, len(filas))
	for _, f := range filas {
		lista = append(lista, usuarioDesdeFila(f))
	}
	return lista, nil
}

// ---------------------------------------------------------------- desafíos y sesiones

func (s *PostgresStore) GuardarDesafio(ctx context.Context, d models.DesafioVerificacion) error {
	// Limpieza oportunista de desafíos vencidos hace más de un día
	_ = s.q.BorrarDesafiosVencidos(ctx)
	return s.q.GuardarDesafio(ctx, db.GuardarDesafioParams{
		IDHash: hashDe(d.ID), Correo: d.Correo, Codigo: d.Codigo, ExpiraEn: d.ExpiraEn,
		ReenvioDesde: d.ReenvioPermitidoDesde, Intentos: int32(d.Intentos),
	})
}

func (s *PostgresStore) ObtenerDesafio(ctx context.Context, id string) (models.DesafioVerificacion, error) {
	f, err := s.q.ObtenerDesafio(ctx, hashDe(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return models.DesafioVerificacion{}, repositories.ErrDesafioNoEncontrado
	}
	return models.DesafioVerificacion{
		ID: id, Correo: f.Correo, Codigo: f.Codigo, ExpiraEn: f.ExpiraEn,
		ReenvioPermitidoDesde: f.ReenvioDesde, Intentos: int(f.Intentos),
	}, err
}

func (s *PostgresStore) EliminarDesafio(ctx context.Context, id string) error {
	return s.q.EliminarDesafio(ctx, hashDe(id))
}

func (s *PostgresStore) GuardarSesion(ctx context.Context, ses models.Sesion) error {
	_ = s.q.BorrarSesionesVencidas(ctx)
	return s.q.GuardarSesion(ctx, db.GuardarSesionParams{
		TokenHash: hashDe(ses.Token), Correo: ses.Correo, ExpiraEn: ses.ExpiraEn,
	})
}

func (s *PostgresStore) ObtenerSesion(ctx context.Context, token string) (models.Sesion, error) {
	f, err := s.q.ObtenerSesion(ctx, hashDe(token))
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Sesion{}, repositories.ErrSesionNoEncontrada
	}
	return models.Sesion{Token: token, Correo: f.Correo, ExpiraEn: f.ExpiraEn}, err
}

func (s *PostgresStore) EliminarSesion(ctx context.Context, token string) error {
	return s.q.EliminarSesion(ctx, hashDe(token))
}

func (s *PostgresStore) GuardarVerificacionDiaria(ctx context.Context, dispositivoID, correo, dia string) error {
	return s.q.GuardarVerificacionDiaria(ctx, db.GuardarVerificacionDiariaParams{
		DispositivoHash: hashDe(dispositivoID), Correo: correo, Dia: dia,
	})
}

func (s *PostgresStore) ObtenerVerificacionDiaria(ctx context.Context, dispositivoID, correo string) (string, error) {
	dia, err := s.q.ObtenerVerificacionDiaria(ctx, db.ObtenerVerificacionDiariaParams{
		DispositivoHash: hashDe(dispositivoID), Correo: correo,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return dia, err
}
