// Análisis estructurado de procesos (POST /api/analyze).
// Aquí viven: las instrucciones específicas de este análisis y la validación del output del modelo.
// Se mantienen separadas de SYSTEM_PROMPT para no contaminar el chat general.

export const ANALYZE_PROMPT = `Eres el módulo de análisis de PG AI. Analizas la situación o proceso que describe el usuario y respondes ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin markdown y sin bloques de código.

Formato exacto:
{
  "type": "process_analysis",
  "summary": "string",
  "problems": ["string"],
  "automation_candidate": true,
  "ai_required": false,
  "missing_information": ["string"]
}

Reglas:
- "type" siempre es "process_analysis".
- "summary": resumen breve (una frase) de lo que describe el usuario.
- "problems": problemas concretos que se deducen de lo que dijo el usuario. Si no hay evidencia suficiente de problemas, usa [].
- "automation_candidate": true solo si existe una oportunidad razonable de automatización; si no, false.
- "ai_required": true solo si la situación realmente necesita inteligencia artificial (por ejemplo, interpretar texto libre, clasificar o entender lenguaje natural). Copiar o mover datos con reglas fijas se resuelve con automatización tradicional y NO requiere IA. No asumas que automatizar es lo mismo que usar IA.
- "missing_information": información importante que falta para hacer recomendaciones más específicas. Si no falta nada relevante, usa [].
- Analiza solo la información proporcionada. No inventes datos, procesos ni problemas.
- Escribe los textos en español, con gramática y ortografía naturales, breves y sin saltos de línea.
- Los valores booleanos deben ser true o false, sin comillas.`;

// Límite de salida: el JSON es corto, pero 512 tokens (el valor del chat) deja margen
// suficiente sin cortarlo; se mantiene explícito y separado del chat.
export const ANALYZE_MAX_TOKENS = 600;

// Valida la salida del modelo (texto u objeto) (frontera 2: output del modelo, no confiable).
// Devuelve { value } si cumple el contrato o { error } con el motivo técnico.
export function parseAnalysis(raw) {
	let data;
	if (raw !== null && typeof raw === "object") {
		// Workers AI ya entregó el JSON parseado.
		data = raw;
	} else if (typeof raw === "string") {
		// Los modelos suelen envolver el JSON en ```json ... ```; se recorta al primer { y último }.
		const start = raw.indexOf("{");
		const end = raw.lastIndexOf("}");
		if (start === -1 || end <= start) return { error: "No se encontró un objeto JSON." };
		try {
			data = JSON.parse(raw.slice(start, end + 1));
		} catch {
			return { error: "JSON inválido." };
		}
	} else {
		return { error: "La respuesta del modelo no es texto ni objeto." };
	}

	if (data === null || typeof data !== "object" || Array.isArray(data)) {
		return { error: "El JSON no es un objeto." };
	}
	if (data.type !== "process_analysis") return { error: 'type debe ser "process_analysis".' };
	if (typeof data.summary !== "string") return { error: "summary debe ser string." };
	if (!isStringArray(data.problems)) return { error: "problems debe ser un array de strings." };
	if (typeof data.automation_candidate !== "boolean") return { error: "automation_candidate debe ser boolean." };
	if (typeof data.ai_required !== "boolean") return { error: "ai_required debe ser boolean." };
	if (!isStringArray(data.missing_information)) return { error: "missing_information debe ser un array de strings." };

	// Se devuelven solo los campos del contrato (se descarta cualquier extra del modelo).
	return {
		value: {
			type: data.type,
			summary: data.summary,
			problems: data.problems,
			automation_candidate: data.automation_candidate,
			ai_required: data.ai_required,
			missing_information: data.missing_information,
		},
	};
}

function isStringArray(v) {
	return Array.isArray(v) && v.every((x) => typeof x === "string");
}
