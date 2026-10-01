// Lógica del chat: toma el texto del textarea, lo envía a POST /api/chat
// y muestra la respuesta en el DOM. Todo el contenido se inserta con textContent
// (nunca innerHTML) para que el texto del usuario o del modelo no se interprete como HTML.

const chat = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("input");
const sendButton = document.getElementById("send");

let busy = false;

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

async function sendMessage() {
	const message = input.value.trim();
	if (busy || message === "") return;

	setBusy(true);
	addMessage("user", message);
	input.value = "";
	input.style.height = "auto";

	const pending = addMessage("bot", "PG AI está pensando...", "pending");

	try {
		const res = await fetch("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ message }),
		});

		const data = await res.json().catch(() => null);
		if (!res.ok || typeof data?.response !== "string") {
			throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
		}

		pending.wrapper.classList.remove("pending");
		pending.bubble.textContent = data.response;
	} catch (err) {
		console.error("Error en /api/chat:", err);
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
