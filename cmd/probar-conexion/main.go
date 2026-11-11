// Command probar-conexion comprueba, SOLO CON LECTURA, la conexión a PostgreSQL (por ejemplo la rama dev-backend de
// Neon) usando DATABASE_URL (variable de entorno o archivo .env en la raíz del repositorio).
//
// Uso (desde la raíz del repositorio):
//
//	go run ./cmd/probar-conexion
//
// No escribe nada, no migra y nunca imprime la cadena de conexión ni la contraseña.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	_ "github.com/joho/godotenv/autoload" // carga .env si existe (no pisa variables ya definidas)
)

func main() {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		log.Fatal("Falta DATABASE_URL: defínela o crea el archivo .env en la raíz del repositorio (ver README).")
	}

	// Con el plan gratis de Neon la base se duerme a los 5 min sin uso: la primera consulta puede tardar 1–2 s
	ctx, cancelar := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancelar()

	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		log.Fatalf("DATABASE_URL no es válida: %v", err)
	}
	fmt.Printf("Conectando a %s (base %q) como %q...\n", cfg.Host, cfg.Database, cfg.User)
	if !strings.Contains(url, "sslmode=require") && !strings.Contains(url, "sslmode=verify") {
		fmt.Println("AVISO: la cadena no incluye sslmode=require; Neon lo exige.")
	}

	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		log.Fatalf("No se pudo conectar: %v", err)
	}
	defer conn.Close(ctx)

	var usuario, searchPath, base, version string
	if err := conn.QueryRow(ctx, `SELECT current_user, current_setting('search_path'), current_database(), version()`).
		Scan(&usuario, &searchPath, &base, &version); err != nil {
		log.Fatalf("Consulta de verificación falló: %v", err)
	}
	fmt.Printf("OK  usuario=%s  base=%s  search_path=%s\n    %s\n", usuario, base, searchPath, version)

	if usuario == "neondb_owner" {
		fmt.Println("ADVERTENCIA: estás conectado como neondb_owner (administrador). El backend debe usar backend_showtech.")
	}

	var tablas int
	if err := conn.QueryRow(ctx, `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'showtech' AND table_type = 'BASE TABLE'`).Scan(&tablas); err == nil {
		fmt.Printf("Tablas en el esquema showtech: %d (la guía indica 40)\n", tablas)
	}

	// Permisos: el usuario del backend NO debe poder crear tablas (los cambios de estructura los hace el administrador).
	// Se comprueba con has_schema_privilege, sin intentar crear ni borrar nada.
	var puedeCrear bool
	if err := conn.QueryRow(ctx, `SELECT has_schema_privilege(current_user, 'showtech', 'CREATE')`).Scan(&puedeCrear); err == nil {
		if puedeCrear {
			fmt.Println("ADVERTENCIA: este usuario PUEDE crear objetos en showtech; el de la guía no debería.")
		} else {
			fmt.Println("Permisos: no puede crear tablas en showtech (lo esperado).")
		}
	}

	var solicitudes int
	if err := conn.QueryRow(ctx, `SELECT count(*) FROM solicitud_modificacion`).Scan(&solicitudes); err == nil {
		fmt.Printf("Solicitudes de modificación: %d (con los datos de prueba de la guía: 2)\n", solicitudes)
	}

	var eventos int
	if err := conn.QueryRow(ctx, `SELECT count(*) FROM evento`).Scan(&eventos); err != nil {
		fmt.Printf("No se pudo contar evento: %v\n", err)
		return
	}
	fmt.Printf("Eventos: %d (con los datos de prueba de la guía: 9)\n", eventos)
}
