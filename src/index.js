// Punto de entrada del Worker de PG AI.
// Cloudflare llama a fetch() por cada petición HTTP que llega al Worker.

import { generateReply, generateAnalysisRaw, classifyMemoryIntentRaw } from "./ai.js";
import { parseAnalysis } from "./analyze.js";
import {
	buildMemoryContext,
	deleteMemory,
	getContextMemories,
	getMemories,
	isValidMemoryId,
	parseMemoryIntent,
	saveMemory,
} from "./memory.js";
import {
	MAX_CONTEXT_MESSAGES,
	createConversation,
	getConversation,
	getMessages,
	getRecentMessages,
	isValidId,
	saveExchange,
} from "./conversations.js";

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

		if (url.pathname === "/api/conversations") {
			if (request.method !== "POST") {
				return json({ error: "Método no permitido. Usá POST." }, 405, { Allow: "POST" });
			}
			return handleCreateConversation(env);
		}

		const convMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
		if (convMatch) {
			if (request.method !== "GET") {
				return json({ error: "Método no permitido. Usá GET." }, 405, { Allow: "GET" });
			}
			return handleGetConversation(env, convMatch[1]);
		}

		if (url.pathname === "/api/memories") {
			if (request.method !== "GET") {
				return json({ error: "Método no permitido. Usá GET." }, 405, { Allow: "GET" });
			}
			return handleListMemories(env);
		}

		const memMatch = url.pathname.match(/^\/api\/memories\/([^/]+)$/);
		if (memMatch) {
			if (request.method !== "DELETE") {
				return json({ error: "Método no permitido. Usá DELETE." }, 405, { Allow: "DELETE" });
			}
			return handleDeleteMemory(env, memMatch[1]);
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

	// Modo persistente: con conversation_id, el servidor (D1) es dueño del historial.
	if (body?.conversation_id !== undefined) {
		return handleChatPersistent(env, body);
	}

	// Modo temporal (Fase 5): el cliente envía el historial en messages.
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

async function handleCreateConversation(env) {
	try {
		const id = await createConversation(env);
		return json({ id }, 201);
	} catch (err) {
		console.error("Error de D1 al crear conversación:", err);
		return json({ error: "Error al crear la conversación." }, 500);
	}
}

async function handleGetConversation(env, id) {
	// Un id que no es UUID ni siquiera se consulta: 400 (request mal formado).
	// Un UUID válido que no existe: 404.
	if (!isValidId(id)) return json({ error: "conversation_id inválido." }, 400);
	try {
		const conversation = await getConversation(env, id);
		if (!conversation) return json({ error: "Conversación no encontrada." }, 404);
		const messages = await getMessages(env, id);
		return json({ ...conversation, messages });
	} catch (err) {
		console.error("Error de D1 al leer conversación:", err);
		return json({ error: "Error al leer la conversación." }, 500);
	}
}

// Flujo: validar → leer historial de D1 → llamar al modelo → SOLO si responde, guardar user+assistant.
// Si Workers AI falla no se guarda nada, así no quedan mensajes del usuario sin respuesta.
async function handleChatPersistent(env, body) {
	const { conversation_id: id, message } = body;
	if (!isValidId(id)) return json({ error: "conversation_id inválido." }, 400);
	if (typeof message !== "string") return json({ error: "El campo message debe ser texto." }, 400);
	if (message.trim() === "") return json({ error: "El campo message no puede estar vacío." }, 400);
	if (message.length > MAX_CONTENT_LENGTH) {
		return json({ error: `El campo message supera los ${MAX_CONTENT_LENGTH} caracteres.` }, 400);
	}

	let history;
	try {
		if (!(await getConversation(env, id))) return json({ error: "Conversación no encontrada." }, 404);
		history = await getRecentMessages(env, id, MAX_CONTEXT_MESSAGES);
	} catch (err) {
		console.error("Error de D1 al leer historial:", err);
		return json({ error: "Error al leer la conversación." }, 500);
	}

	// Memoria: clasificar intención (IA) → validar → guardar en D1 → recién entonces responder.
	const memory = await processMemory(env, message);

	let memories = [];
	try {
		memories = await getContextMemories(env);
	} catch (err) {
		console.error("Error de D1 al leer memorias:", err);
		memory.note ??= "No se pudo leer la memoria guardada; no afirmes recordar datos que no tengas en esta conversación.";
	}
	const memoryContext = buildMemoryContext(memories, memory.note);

	let response;
	try {
		response = await generateReply(env, [...history, { role: "user", content: message }], memoryContext);
	} catch (err) {
		console.error("Error al llamar a Workers AI:", err);
		return json({ error: "Error al generar la respuesta.", detail: String(err?.message ?? err) }, 502);
	}

	try {
		await saveExchange(env, id, message, response);
	} catch (err) {
		console.error("Error de D1 al guardar mensajes:", err);
		return json({ error: "La respuesta se generó pero no se pudo guardar." }, 500);
	}
	// "memory" es información de depuración/aprendizaje: la interfaz la ignora.
	return json({
		conversation_id: id,
		response,
		memory: { classifier: memory.classifier, stored: memory.stored, in_context: memories.length },
	});
}

// Clasifica el mensaje y, si el usuario pidió guardar algo, lo valida y lo guarda.
// Nunca lanza: devuelve el estado y una "note" (aviso de la aplicación para el modelo) para que
// la respuesta no afirme algo que no ocurrió (p. ej. "lo recordaré" si D1 falló).
async function processMemory(env, message) {
	const result = { classifier: null, stored: null, note: null };

	let raw;
	try {
		raw = await classifyMemoryIntentRaw(env, message);
	} catch (err) {
		console.error("Error del clasificador de memoria:", err);
		result.stored = "classifier_error";
		result.note = "No se pudo determinar si había que guardar algo en memoria; no afirmes haber guardado nada.";
		return result;
	}

	const parsed = parseMemoryIntent(raw);
	if (parsed.error) {
		console.error("Salida inválida del clasificador de memoria:", parsed.error);
		result.stored = "classifier_invalid";
		result.note = "No se pudo determinar si había que guardar algo en memoria; no afirmes haber guardado nada.";
		return result;
	}
	result.classifier = parsed.value;
	if (parsed.value.action !== "save") return result;

	try {
		const saved = await saveMemory(env, parsed.value.memory);
		result.stored = saved.status;
		result.note =
			saved.status === "saved"
				? `La aplicación acaba de guardar en memoria este dato: ${JSON.stringify(parsed.value.memory)}. Confírmalo de forma breve y natural.`
				: `Este dato ya estaba guardado en memoria: ${JSON.stringify(parsed.value.memory)}. Indícalo de forma breve.`;
	} catch (err) {
		console.error("Error de D1 al guardar memoria:", err);
		result.stored = "failed";
		result.note =
			"NO se pudo guardar el dato en memoria por un error. NO digas que lo guardaste ni que lo recordarás; informa brevemente que hubo un problema.";
	}
	return result;
}

async function handleListMemories(env) {
	try {
		return json({ memories: await getMemories(env) });
	} catch (err) {
		console.error("Error de D1 al listar memorias:", err);
		return json({ error: "Error al leer las memorias." }, 500);
	}
}

async function handleDeleteMemory(env, id) {
	if (!isValidMemoryId(id)) return json({ error: "id de memoria inválido." }, 400);
	try {
		if (!(await deleteMemory(env, id))) return json({ error: "Memoria no encontrada." }, 404);
		return json({ deleted: true });
	} catch (err) {
		console.error("Error de D1 al borrar memoria:", err);
		return json({ error: "Error al borrar la memoria." }, 500);
	}
}
