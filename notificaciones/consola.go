// Package notificaciones contiene las formas de entregar mensajes al usuario.
package notificaciones

import (
	"context"
	"log"

	"gestor-eventos-api/services"
)

// Consola "entrega" el código imprimiéndolo en el registro del servidor. Es solo para desarrollo:
// sustituye al correo real, que aún no está integrado.
type Consola struct{}

var _ services.NotificadorCodigo = Consola{}

func (Consola) EnviarCodigo(_ context.Context, correo, codigo string) error {
	log.Printf("[verificación simulada] código para %s: %s", correo, codigo)
	return nil
}
