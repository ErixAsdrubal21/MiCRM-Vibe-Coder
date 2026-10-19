import { ConvexError } from "convex/values";

/**
 * ICS-133 — texto de error para mostrar en pantalla. En producción Convex
 * oculta el mensaje de cualquier `Error` del servidor ("Server Error" + Request
 * ID); solo entrega el contenido de un `ConvexError`, que es como el servidor
 * lanza los mensajes pensados para el usuario. Cualquier otra falla (red,
 * error interno) muestra `fallback`, nunca el texto crudo.
 */
export function errorMessage(err, fallback = "Algo salió mal. Intenta de nuevo.") {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}
