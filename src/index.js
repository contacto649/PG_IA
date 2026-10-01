// Punto de entrada del Worker de PG AI.
// Fase 0: solo un placeholder para verificar que la configuración funciona.
// El primer endpoint real se construye en la Fase 1.
export default {
	async fetch(request) {
		return new Response("PG AI — Fase 0: entorno preparado.");
	},
};
