-- Fase 7: conversaciones y mensajes. Esquema mínimo, sin usuarios ni memorias.

CREATE TABLE conversations (
	id         TEXT PRIMARY KEY,   -- UUID (crypto.randomUUID()), también es el identificador público
	created_at TEXT NOT NULL,      -- ISO 8601 UTC
	updated_at TEXT NOT NULL
);

CREATE TABLE messages (
	id              INTEGER PRIMARY KEY AUTOINCREMENT, -- solo orden interno; nunca se expone
	conversation_id TEXT NOT NULL REFERENCES conversations(id),
	role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
	content         TEXT NOT NULL,
	created_at      TEXT NOT NULL
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, id);
