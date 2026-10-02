// Acceso a D1: conversaciones y mensajes (env.DB).
// D1 es la fuente de verdad del historial cuando existe un conversation_id.

// Cuántos mensajes recientes se envían al modelo. El historial PERSISTIDO en D1 puede ser
// mucho más largo: esto limita solo el CONTEXTO que ve el modelo en cada petición.
export const MAX_CONTEXT_MESSAGES = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidId(id) {
	return typeof id === "string" && UUID_RE.test(id);
}

export async function createConversation(env) {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await env.DB.prepare("INSERT INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)")
		.bind(id, now, now)
		.run();
	return id;
}

export function getConversation(env, id) {
	return env.DB.prepare("SELECT id, created_at, updated_at FROM conversations WHERE id = ?").bind(id).first();
}

// Todos los mensajes, en orden cronológico (para mostrar la conversación completa).
export async function getMessages(env, id) {
	const { results } = await env.DB.prepare(
		"SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC",
	)
		.bind(id)
		.all();
	return results;
}

// Solo los últimos N mensajes, en orden cronológico (para armar el contexto del modelo).
export async function getRecentMessages(env, id, limit = MAX_CONTEXT_MESSAGES) {
	const { results } = await env.DB.prepare(
		"SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?",
	)
		.bind(id, limit)
		.all();
	return results.reverse();
}

// Guarda el par user + assistant y actualiza updated_at en una sola operación atómica
// (db.batch ejecuta las sentencias en una transacción implícita).
export async function saveExchange(env, id, userContent, assistantContent) {
	const now = new Date().toISOString();
	const insert = env.DB.prepare(
		"INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
	);
	await env.DB.batch([
		insert.bind(id, "user", userContent, now),
		insert.bind(id, "assistant", assistantContent, now),
		env.DB.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").bind(now, id),
	]);
}
