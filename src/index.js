// Punto de entrada del Worker de PG AI.
// Cloudflare llama a fetch() por cada petición HTTP que llega al Worker.

import { generateReply, generateAnalysisRaw } from "./ai.js";
import { parseAnalysis } from "./analyze.js";

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

		if (url.pathname === "/api/analyze") {
			if (request.method !== "POST") {
				return json({ error: "Método no permitido. Usá POST." }, 405, { Allow: "POST" });
			}
			return handleAnalyze(request, env);
		}

		return json({ error: "Ruta no encontrada." }, 404);
	},
};

// Límites de la API (protegen al Worker de peticiones desmedidas; NO son el límite de
// contexto del modelo, que es bastante mayor y se mide en tokens, no en mensajes).
const MAX_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 4000;
const ALLOWED_ROLES = ["user", "assistant"];

// Valida el body y devuelve { messages } o { error }.
// Acepta { messages: [...] } (historial) o, por compatibilidad, { message: "..." }.
// El rol "system" nunca se acepta del cliente: las instrucciones las pone solo el backend.
function parseMessages(body) {
	let messages;
	if (body?.messages !== undefined) {
		messages = body.messages;
	} else if (body?.message !== undefined) {
		if (typeof body.message !== "string") return { error: "El campo message debe ser texto." };
		messages = [{ role: "user", content: body.message }];
	} else {
		return { error: "Falta el campo messages (o message)." };
	}

	if (!Array.isArray(messages)) return { error: "El campo messages debe ser un array." };
	if (messages.length === 0) return { error: "El campo messages no puede estar vacío." };
	if (messages.length > MAX_MESSAGES) {
		return { error: `messages admite como máximo ${MAX_MESSAGES} mensajes.` };
	}

	const clean = [];
	for (const [i, m] of messages.entries()) {
		if (m === null || typeof m !== "object" || Array.isArray(m)) {
			return { error: `messages[${i}] debe ser un objeto.` };
		}
		if (!ALLOWED_ROLES.includes(m.role)) {
			return { error: `messages[${i}].role debe ser "user" o "assistant".` };
		}
		if (typeof m.content !== "string") {
			return { error: `messages[${i}].content debe ser texto.` };
		}
		if (m.content.trim() === "") {
			return { error: `messages[${i}].content no puede estar vacío.` };
		}
		if (m.content.length > MAX_CONTENT_LENGTH) {
			return { error: `messages[${i}].content supera los ${MAX_CONTENT_LENGTH} caracteres.` };
		}
		// Se copian solo los campos conocidos: cualquier otro campo del cliente se descarta.
		clean.push({ role: m.role, content: m.content });
	}

	if (clean[clean.length - 1].role !== "user") {
		return { error: "El último mensaje de messages debe tener role \"user\"." };
	}
	return { messages: clean };
}

async function handleChat(request, env) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "El body debe ser JSON válido." }, 400);
	}

	const parsed = parseMessages(body);
	if (parsed.error) {
		return json({ error: parsed.error }, 400);
	}


	try {
		const response = await generateReply(env, parsed.messages);
		return json({ response });
	} catch (err) {
		console.error("Error al llamar a Workers AI:", err);
		return json({ error: "Error al generar la respuesta.", detail: String(err?.message ?? err) }, 502);
	}
}

const MAX_TEXT_LENGTH = 4000;

async function handleAnalyze(request, env) {
	// Frontera 1: validar el REQUEST del cliente.
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "El body debe ser JSON válido." }, 400);
	}

	const text = body?.text;
	if (text === undefined) return json({ error: "El campo text es obligatorio." }, 400);
	if (typeof text !== "string") return json({ error: "El campo text debe ser texto." }, 400);
	if (text.trim() === "") return json({ error: "El campo text no puede estar vacío." }, 400);
	if (text.length > MAX_TEXT_LENGTH) {
		return json({ error: `El campo text supera los ${MAX_TEXT_LENGTH} caracteres.` }, 400);
	}

	let raw;
	try {
		raw = await generateAnalysisRaw(env, text);
	} catch (err) {
		console.error("Error al llamar a Workers AI:", err);
		return json({ error: "Error al generar el análisis.", detail: String(err?.message ?? err) }, 502);
	}

	// Frontera 2: validar el OUTPUT del modelo (tampoco es de confianza).
	const parsed = parseAnalysis(raw);
	if (parsed.error) {
		console.error("Respuesta estructurada inválida:", parsed.error);
		return json({ error: "Invalid structured response from AI", detail: parsed.error }, 502);
	}
	return json(parsed.value);
}
