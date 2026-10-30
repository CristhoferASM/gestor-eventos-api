package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"

	"gestor-eventos-api/handlers"
	"gestor-eventos-api/services"
	"gestor-eventos-api/storage"
)

func main() {
	// Inicializar almacenamiento en memoria con datos de prueba (implementa los repositorios)
	store := storage.NewMemoryStore()

	// Ensamblar servicios inyectando las interfaces de repositorio
	eventoService := services.NewEventoService(store)
	solicitudService := services.NewSolicitudService(store, store)

	// Configurar enrutador Gin y endpoints recibiendo únicamente servicios
	r := handlers.SetupRouter(eventoService, solicitudService)

	direccion := "127.0.0.1:8081"
	fmt.Println("=============================================================")
	fmt.Println("   SHOWTECH SOLUTIONS - API Gestor de Eventos (Backend Go)   ")
	fmt.Println("=============================================================")
	fmt.Printf(" Servidor iniciado en http://%s\n", direccion)
	fmt.Println(" Escuchando exclusivamente en 127.0.0.1 (evita conflicto con puerto 8080)")
	fmt.Println(" Endpoints disponibles:")
	fmt.Println("   - GET  /health")
	fmt.Println("   - GET  /eventos")
	fmt.Println("   - GET  /eventos/:id")
	fmt.Println("   - POST /solicitudes")
	fmt.Println("   - GET  /solicitudes")
	fmt.Println("=============================================================")

	// Iniciar servidor HTTP en 127.0.0.1:8081 con manejo de errores
	if err := r.Run(direccion); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("Error crítico al iniciar el servidor en %s: %v\n", direccion, err)
	}
}
