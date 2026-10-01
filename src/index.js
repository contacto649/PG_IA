// Punto de entrada del Worker de PG AI.
// Cloudflare llama a fetch() por cada petición HTTP que llega al Worker.

import { generateReply } from "./ai.js";

function json(data, status = 200, headers = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
	});
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/api/test") {
			if (request.method !== "GET") {
				return json({ error: "Método no permitido. Usá GET." }, 405, { Allow: "GET" });
			}
			return json({ status: "ok", message: "PG AI funcionando" });
		}

		if (url.pathname === "/api/chat") {
			if (request.method !== "POST") {
				return json({ error: "Método no permitido. Usá POST." }, 405, { Allow: "POST" });
			}
			return handleChat(request, env);
		}

		return json({ error: "Ruta no encontrada." }, 404);
	},
};

async function handleChat(request, env) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "El body debe ser JSON válido." }, 400);
	}

	const message = body?.message;
	if (message === undefined) {
		return json({ error: "El campo message es obligatorio." }, 400);
	}
	if (typeof message !== "string") {
		return json({ error: "El campo message debe ser texto." }, 400);
	}
	if (message.trim() === "") {
		return json({ error: "El campo message no puede estar vacío." }, 400);
	}

	try {
		const response = await generateReply(env, message);
		return json({ response });
	} catch (err) {
		console.error("Error al llamar a Workers AI:", err);
		return json({ error: "Error al generar la respuesta.", detail: String(err?.message ?? err) }, 502);
	}
}
