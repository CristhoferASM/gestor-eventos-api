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
	"time"

	"gestor-eventos-api/models"
	"gestor-eventos-api/repositories"

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
)

// Códigos de error de PostgreSQL que traducimos a errores de dominio.
const (
	pgViolacionUnica = "23505"
	pgViolacionFK    = "23503"
)

// PostgresStore implementa todos los repositorios sobre PostgreSQL. Los datos sobreviven a los reinicios.
type PostgresStore struct {
	pool *pgxpool.Pool
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
	s := &PostgresStore{pool: pool}
	if err := s.migrar(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return s, nil
}

// Close libera las conexiones.
func (s *PostgresStore) Close() { s.pool.Close() }

// migrar aplica en orden los archivos migraciones/NNN_*.sql que aún no se hayan ejecutado, cada uno en su transacción.
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

	var n int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM eventos`).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		eventos, _ := mem.ObtenerEventos(ctx)
		for _, e := range eventos {
			datos, err := json.Marshal(e)
			if err != nil {
				return err
			}
			if _, err := s.pool.Exec(ctx, `INSERT INTO eventos (id, cliente_id, fecha, datos) VALUES ($1,$2,$3,$4)`,
				int64(e.ID), e.ClienteID, e.Fecha, datos); err != nil {
				return err
			}
		}
		bloqueos, _ := mem.ObtenerBloqueos(ctx)
		for _, b := range bloqueos {
			datos, err := json.Marshal(b)
			if err != nil {
				return err
			}
			if _, err := s.pool.Exec(ctx, `INSERT INTO bloqueos (id, fecha, datos) VALUES ($1,$2,$3)`, b.ID, b.Fecha, datos); err != nil {
				return err
			}
		}
	}

	usuarios, _ := mem.ObtenerUsuarios(ctx)
	for _, u := range usuarios {
		if _, err := s.pool.Exec(ctx, `INSERT INTO usuarios (correo, id, nombre, rol, cliente_id, proveedor, password_hash)
			VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (correo) DO NOTHING`,
			u.Correo, int64(u.ID), u.Nombre, u.Rol, u.ClienteID, u.Proveedor, u.PasswordHash); err != nil {
			return err
		}
	}
	return nil
}

// ---------------------------------------------------------------- eventos

func (s *PostgresStore) ObtenerEventos(ctx context.Context) ([]models.Evento, error) {
	filas, err := s.pool.Query(ctx, `SELECT datos FROM eventos ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer filas.Close()
	lista := make([]models.Evento, 0)
	for filas.Next() {
		var datos []byte
		if err := filas.Scan(&datos); err != nil {
			return nil, err
		}
		var e models.Evento
		if err := json.Unmarshal(datos, &e); err != nil {
			return nil, err
		}
		lista = append(lista, e)
	}
	return lista, filas.Err()
}

func (s *PostgresStore) ObtenerEventoPorID(ctx context.Context, id uint) (models.Evento, error) {
	var datos []byte
	err := s.pool.QueryRow(ctx, `SELECT datos FROM eventos WHERE id = $1`, int64(id)).Scan(&datos)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Evento{}, repositories.ErrEventoNoEncontrado
	}
	if err != nil {
		return models.Evento{}, err
	}
	var e models.Evento
	return e, json.Unmarshal(datos, &e)
}

// ---------------------------------------------------------------- bloqueos

func (s *PostgresStore) ObtenerBloqueos(ctx context.Context) ([]models.BloqueoInstitucional, error) {
	filas, err := s.pool.Query(ctx, `SELECT datos FROM bloqueos ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer filas.Close()
	lista := make([]models.BloqueoInstitucional, 0)
	for filas.Next() {
		var datos []byte
		if err := filas.Scan(&datos); err != nil {
			return nil, err
		}
		var b models.BloqueoInstitucional
		if err := json.Unmarshal(datos, &b); err != nil {
			return nil, err
		}
		lista = append(lista, b)
	}
	return lista, filas.Err()
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
	var id int64
	err = s.pool.QueryRow(ctx, `INSERT INTO solicitudes (evento_id, estado, datos) VALUES ($1,$2,$3) RETURNING id`,
		int64(sol.EventoID), sol.Estado, datos).Scan(&id)
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
	filas, err := s.pool.Query(ctx, `SELECT id, estado, datos FROM solicitudes ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer filas.Close()
	lista := make([]models.Solicitud, 0)
	for filas.Next() {
		var (
			id     int64
			estado string
			datos  []byte
		)
		if err := filas.Scan(&id, &estado, &datos); err != nil {
			return nil, err
		}
		sol, err := solicitudDesdeFila(id, estado, datos)
		if err != nil {
			return nil, err
		}
		lista = append(lista, sol)
	}
	return lista, filas.Err()
}

// RetirarSolicitud pasa de forma atómica a «Retirada por el cliente» solo si sigue pendiente:
// el UPDATE condicional evita que dos retiros simultáneos tengan éxito a la vez.
func (s *PostgresStore) RetirarSolicitud(ctx context.Context, id uint, fechaRetiro string) (models.Solicitud, error) {
	var (
		estado string
		datos  []byte
	)
	err := s.pool.QueryRow(ctx, `
		UPDATE solicitudes
		   SET estado = $2,
		       datos  = jsonb_set(jsonb_set(datos, '{estado}', to_jsonb($2::text)), '{fecha_retiro}', to_jsonb($3::text))
		 WHERE id = $1 AND estado = $4
		RETURNING estado, datos`,
		int64(id), models.EstadoRetiradaCliente, fechaRetiro, models.EstadoPendienteRevision).Scan(&estado, &datos)
	if err == nil {
		return solicitudDesdeFila(int64(id), estado, datos)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return models.Solicitud{}, err
	}
	// Ninguna fila cambió: o no existe, o ya no estaba pendiente
	var existe bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM solicitudes WHERE id = $1)`, int64(id)).Scan(&existe); err != nil {
		return models.Solicitud{}, err
	}
	if !existe {
		return models.Solicitud{}, repositories.ErrSolicitudNoEncontrada
	}
	return models.Solicitud{}, repositories.ErrSolicitudNoPendiente
}

// ---------------------------------------------------------------- usuarios

func (s *PostgresStore) ObtenerUsuarioPorCorreo(ctx context.Context, correo string) (models.Usuario, error) {
	var (
		u  models.Usuario
		id int64
	)
	err := s.pool.QueryRow(ctx, `SELECT correo, id, nombre, rol, cliente_id, proveedor, password_hash FROM usuarios WHERE correo = $1`, correo).
		Scan(&u.Correo, &id, &u.Nombre, &u.Rol, &u.ClienteID, &u.Proveedor, &u.PasswordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Usuario{}, repositories.ErrUsuarioNoEncontrado
	}
	u.ID = uint(id)
	return u, err
}

func (s *PostgresStore) GuardarUsuario(ctx context.Context, u models.Usuario) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO usuarios (correo, id, nombre, rol, cliente_id, proveedor, password_hash)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (correo) DO UPDATE SET
		  id = EXCLUDED.id, nombre = EXCLUDED.nombre, rol = EXCLUDED.rol, cliente_id = EXCLUDED.cliente_id,
		  proveedor = EXCLUDED.proveedor, password_hash = EXCLUDED.password_hash`,
		u.Correo, int64(u.ID), u.Nombre, u.Rol, u.ClienteID, u.Proveedor, u.PasswordHash)
	return err
}

func (s *PostgresStore) ObtenerUsuarios(ctx context.Context) ([]models.Usuario, error) {
	filas, err := s.pool.Query(ctx, `SELECT correo, id, nombre, rol, cliente_id, proveedor, password_hash FROM usuarios ORDER BY correo`)
	if err != nil {
		return nil, err
	}
	defer filas.Close()
	lista := make([]models.Usuario, 0)
	for filas.Next() {
		var (
			u  models.Usuario
			id int64
		)
		if err := filas.Scan(&u.Correo, &id, &u.Nombre, &u.Rol, &u.ClienteID, &u.Proveedor, &u.PasswordHash); err != nil {
			return nil, err
		}
		u.ID = uint(id)
		lista = append(lista, u)
	}
	return lista, filas.Err()
}

// ---------------------------------------------------------------- desafíos y sesiones

func (s *PostgresStore) GuardarDesafio(ctx context.Context, d models.DesafioVerificacion) error {
	// Limpieza oportunista de desafíos vencidos hace más de un día
	_, _ = s.pool.Exec(ctx, `DELETE FROM desafios WHERE expira_en < now() - interval '1 day'`)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO desafios (id_hash, correo, codigo, expira_en, reenvio_desde, intentos)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (id_hash) DO UPDATE SET
		  correo = EXCLUDED.correo, codigo = EXCLUDED.codigo, expira_en = EXCLUDED.expira_en,
		  reenvio_desde = EXCLUDED.reenvio_desde, intentos = EXCLUDED.intentos`,
		hashDe(d.ID), d.Correo, d.Codigo, d.ExpiraEn, d.ReenvioPermitidoDesde, d.Intentos)
	return err
}

func (s *PostgresStore) ObtenerDesafio(ctx context.Context, id string) (models.DesafioVerificacion, error) {
	d := models.DesafioVerificacion{ID: id}
	err := s.pool.QueryRow(ctx, `SELECT correo, codigo, expira_en, reenvio_desde, intentos FROM desafios WHERE id_hash = $1`, hashDe(id)).
		Scan(&d.Correo, &d.Codigo, &d.ExpiraEn, &d.ReenvioPermitidoDesde, &d.Intentos)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.DesafioVerificacion{}, repositories.ErrDesafioNoEncontrado
	}
	return d, err
}

func (s *PostgresStore) EliminarDesafio(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM desafios WHERE id_hash = $1`, hashDe(id))
	return err
}

func (s *PostgresStore) GuardarSesion(ctx context.Context, ses models.Sesion) error {
	_, _ = s.pool.Exec(ctx, `DELETE FROM sesiones WHERE expira_en < now()`)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO sesiones (token_hash, correo, expira_en) VALUES ($1,$2,$3)
		ON CONFLICT (token_hash) DO UPDATE SET correo = EXCLUDED.correo, expira_en = EXCLUDED.expira_en`,
		hashDe(ses.Token), ses.Correo, ses.ExpiraEn)
	return err
}

func (s *PostgresStore) ObtenerSesion(ctx context.Context, token string) (models.Sesion, error) {
	ses := models.Sesion{Token: token}
	var expira time.Time
	err := s.pool.QueryRow(ctx, `SELECT correo, expira_en FROM sesiones WHERE token_hash = $1`, hashDe(token)).Scan(&ses.Correo, &expira)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Sesion{}, repositories.ErrSesionNoEncontrada
	}
	ses.ExpiraEn = expira
	return ses, err
}

func (s *PostgresStore) EliminarSesion(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sesiones WHERE token_hash = $1`, hashDe(token))
	return err
}

func (s *PostgresStore) GuardarVerificacionDiaria(ctx context.Context, dispositivoID, correo, dia string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO verificaciones_diarias (dispositivo_hash, correo, dia) VALUES ($1,$2,$3)
		ON CONFLICT (dispositivo_hash, correo) DO UPDATE SET dia = EXCLUDED.dia`,
		hashDe(dispositivoID), correo, dia)
	return err
}

func (s *PostgresStore) ObtenerVerificacionDiaria(ctx context.Context, dispositivoID, correo string) (string, error) {
	var dia string
	err := s.pool.QueryRow(ctx, `SELECT dia FROM verificaciones_diarias WHERE dispositivo_hash = $1 AND correo = $2`, hashDe(dispositivoID), correo).Scan(&dia)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return dia, err
}
