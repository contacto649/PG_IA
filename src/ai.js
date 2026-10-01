// Capa de integración con el proveedor de IA.
// El resto de PG AI solo conoce generateReply(): recibe texto y devuelve texto.
// Para cambiar de modelo o de proveedor, se modifica únicamente este archivo.

import { SYSTEM_PROMPT } from "./system-prompt.js";

const MODEL = "@cf/meta/llama-3.2-3b-instruct";

export async function generateReply(env, messages) {
	// El backend controla las instrucciones; el cliente aporta solo la conversación (ya validada).
	const result = await env.AI.run(MODEL, {
		messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
		max_tokens: 512,
	});

	// Workers AI devuelve { response, usage, ... }; nos quedamos solo con el texto.
	if (typeof result?.response !== "string") {
		throw new Error("Respuesta inesperada de Workers AI.");
	}
	return result.response;
}
