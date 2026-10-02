// Lógica del chat: toma el texto del textarea, lo envía a POST /api/chat junto con el
// conversation_id y muestra la respuesta en el DOM. El historial vive en D1. Todo el contenido se inserta con textContent
// (nunca innerHTML) para que el texto del usuario o del modelo no se interprete como HTML.

const chat = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("input");
const sendButton = document.getElementById("send");

let busy = false;

// localStorage guarda SOLO el id de la conversación activa (qué conversación abrir).
// Los mensajes viven en D1; el navegador no guarda su contenido.
const STORAGE_KEY = "pg_ai_conversation_id";
let conversationId = null;

// Copia del saludo inicial del HTML, para restaurarlo en "Nueva conversación".
const greeting = chat.firstElementChild.cloneNode(true);

// Crea un mensaje en el chat y devuelve el elemento de la burbuja para poder actualizarlo.
function addMessage(role, text, extraClass = "") {
	const wrapper = document.createElement("div");
	wrapper.className = `message ${role} ${extraClass}`.trim();

	const author = document.createElement("span");
	author.className = "author";
	author.textContent = role === "user" ? "Tú" : "PG AI";

	const bubble = document.createElement("div");
	bubble.className = "bubble";
	bubble.textContent = text;

	wrapper.append(author, bubble);
	chat.append(wrapper);
	chat.scrollTop = chat.scrollHeight;
	return { wrapper, bubble };
}

function setBusy(value) {
	busy = value;
	sendButton.disabled = value;
}

function readStoredId() {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function storeId(id) {
	try {
		if (id) localStorage.setItem(STORAGE_KEY, id);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Sin localStorage la conversación funciona igual, pero no sobrevive a F5.
	}
}

async function createConversation() {
	const res = await fetch("/api/conversations", { method: "POST" });
	const data = await res.json().catch(() => null);
	if (!res.ok || typeof data?.id !== "string") {
		throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
	}
	conversationId = data.id;
	storeId(conversationId);
}

// Al cargar: si hay un id guardado, recupera los mensajes desde D1 y redibuja las burbujas.
// Si D1 responde 404 (id desconocido) se descarta el id y se empieza una conversación nueva.
async function loadConversation() {
	const stored = readStoredId();
	if (stored) {
		const res = await fetch(`/api/conversations/${encodeURIComponent(stored)}`);
		if (res.ok) {
			const data = await res.json();
			conversationId = stored;
			for (const m of data.messages) addMessage(m.role === "user" ? "user" : "bot", m.content);
			return;
		}
		if (res.status !== 404 && res.status !== 400) throw new Error(`HTTP ${res.status}`);
		storeId(null);
	}
	await createConversation();
}

async function newConversation() {
	if (busy) return;
	setBusy(true);
	try {
		await createConversation();
		chat.replaceChildren(greeting.cloneNode(true));
	} catch (err) {
		console.error("Error al crear conversación:", err);
		addMessage("bot", "No se pudo crear una conversación nueva.", "error");
	} finally {
		setBusy(false);
		input.focus();
	}
}

async function sendMessage() {
	const message = input.value.trim();
	if (busy || message === "") return;

	setBusy(true);
	addMessage("user", message);
	input.value = "";
	input.style.height = "auto";

	const pending = addMessage("bot", "PG AI está pensando...", "pending");

	try {
		if (!conversationId) await createConversation();

		// Se envía solo el mensaje nuevo: el servidor recupera el historial desde D1.
		const res = await fetch("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ conversation_id: conversationId, message }),
		});

		const data = await res.json().catch(() => null);
		if (!res.ok || typeof data?.response !== "string") {
			throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
		}

		pending.wrapper.classList.remove("pending");
		pending.bubble.textContent = data.response;
	} catch (err) {
		console.error("Error en /api/chat:", err);
		// Si la IA falla, el servidor no guarda nada: el mensaje queda visible pero no en el historial.
		pending.wrapper.classList.remove("pending");
		pending.wrapper.classList.add("error");
		pending.bubble.textContent = "No se pudo obtener una respuesta.";
	} finally {
		setBusy(false);
		chat.scrollTop = chat.scrollHeight;
		input.focus();
	}
}

form.addEventListener("submit", (event) => {
	event.preventDefault();
	sendMessage();
});

// Enter envía; Shift+Enter inserta salto de línea.
input.addEventListener("keydown", (event) => {
	if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
		event.preventDefault();
		sendMessage();
	}
});

// El textarea crece con el contenido (hasta max-height).
input.addEventListener("input", () => {
	input.style.height = "auto";
	input.style.height = `${input.scrollHeight}px`;
});

document.getElementById("new-chat").addEventListener("click", newConversation);

// Arranque: se bloquea el envío hasta saber qué conversación usar.
setBusy(true);
loadConversation()
	.catch((err) => {
		console.error("Error al cargar la conversación:", err);
		addMessage("bot", "No se pudo cargar la conversación.", "error");
	})
	.finally(() => {
		setBusy(false);
		chat.scrollTop = chat.scrollHeight;
	});
