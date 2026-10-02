-- Fase 8: memoria explícita v1. Hechos que el usuario pidió guardar; sobreviven entre conversaciones.
-- Sin user_id: no hay usuarios todavía, la memoria es global para esta instancia del laboratorio.

CREATE TABLE memories (
	id          TEXT PRIMARY KEY,      -- UUID (crypto.randomUUID())
	content     TEXT NOT NULL,         -- hecho en una oración breve
	content_key TEXT NOT NULL UNIQUE,  -- versión normalizada de content: evita duplicados triviales
	created_at  TEXT NOT NULL,
	updated_at  TEXT NOT NULL
);
