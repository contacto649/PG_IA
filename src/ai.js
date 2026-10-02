// Capa de integración con el proveedor de IA.
// El resto de PG AI solo conoce estas funciones: reciben texto/mensajes y devuelven texto.
// Para cambiar de modelo o de proveedor, se modifica únicamente este archivo.

import { SYSTEM_PROMPT } from "./system-prompt.js";
import { ANALYZE_PROMPT, ANALYZE_MAX_TOKENS } from "./analyze.js";
import { MEMORY_INTENT_PROMPT } from "./memory.js";

const MODEL = "@cf/meta/llama-3.2-3b-instruct";

async function run(env, messages, options) {
	const result = await env.AI.run(MODEL, { messages, ...options });
	// Workers AI devuelve { response, usage, ... }. Normalmente response es texto, pero si el
	// modelo produce JSON válido Workers AI puede entregarlo ya parseado (como objeto).
	return result?.response;
}

// Chat: el backend controla las instrucciones; el cliente aporta solo la conversación (ya validada).
// memoryContext (opcional): bloque de memoria/avisos de la aplicación, ya construido en memory.js.
export async function generateReply(env, messages, memoryContext = "") {
	const system = memoryContext ? `${SYSTEM_PROMPT}

${memoryContext}` : SYSTEM_PROMPT;
	const response = await run(env, [{ role: "system", content: system }, ...messages], { max_tokens: 512 });
	if (typeof response !== "string") {
		throw new Error("Respuesta inesperada de Workers AI.");
	}
	return response;
}

// Análisis estructurado: devuelve la salida cruda del modelo, texto u objeto (se valida en analyze.js).
// Este modelo no soporta JSON Mode nativo en Workers AI, así que el formato se pide por prompt.
// Temperatura baja para que la salida sea más estable.
export function generateAnalysisRaw(env, text) {
	return run(
		env,
		[
			{ role: "system", content: ANALYZE_PROMPT },
			{ role: "user", content: text },
		],
		{ max_tokens: ANALYZE_MAX_TOKENS, temperature: 0.2 },
	);
}

// Clasificador de intención de memoria: devuelve la salida cruda (se valida en memory.js).
// Es una inferencia ADICIONAL por mensaje. Temperatura 0 para que sea lo más estable posible.
export function classifyMemoryIntentRaw(env, message) {
	return run(
		env,
		[
			{ role: "system", content: MEMORY_INTENT_PROMPT },
			{ role: "user", content: message },
		],
		{ max_tokens: 150, temperature: 0 },
	);
}
