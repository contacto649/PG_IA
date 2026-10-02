# PG AI

Proyecto experimental para aprender a construir progresivamente un sistema de inteligencia artificial y automatización.

## Objetivo

Aprender mediante implementación práctica:

- APIs
- HTTP
- Cloudflare Workers
- Modelos de IA
- Almacenamiento
- Memoria
- RAG
- Embeddings
- Tool calling
- Automatizaciones
- Agentes

## Filosofía del proyecto

Construir una capacidad por vez, comprenderla y recién después avanzar.

## Presupuesto inicial

**USD 0.**

Se priorizarán servicios y recursos gratuitos durante la etapa experimental.

## Estado actual

| Fase | Estado |
| --- | --- |
| Fase 0 — Preparación del entorno | ✅ Completada |
| Fase 1 — Primer endpoint / API | ✅ Completada |
| Fase 2 — Primer modelo de IA | ✅ Completada y verificada con Workers AI real |
| Fase 3 — Interfaz de chat | ✅ Completada |
| Fase 4 — Instrucciones propias de PG AI | ✅ Completada |
| Fase 5 — Contexto conversacional temporal | ✅ Completada |
| Fase 6 — Outputs estructurados | ✅ Completada |
| Fase 7 — Persistencia con D1 | ✅ Completada |
| Fase 8 — Memoria selectiva persistente selectiva persistente | ✅ Completada (lógica verificada con modelo simulado; falta verificar el comportamiento de Llama real, ver abajo) |

## Estructura del proyecto

```
pg-ai/
├── public/             # Frontend estático (se sirve en /)
│   ├── index.html
│   ├── styles.css
│   └── app.js          # Llama a POST /api/chat y pinta la conversación
├── src/
│   ├── index.js        # Punto de entrada del Worker: rutas, validación y respuestas HTTP
│   ├── ai.js           # Capa de integración con el proveedor de IA (Workers AI)
│   ├── system-prompt.js # Instrucciones (system prompt) de PG AI
│   ├── analyze.js      # Instrucciones y validación del análisis estructurado
│   ├── conversations.js # Acceso a D1: conversaciones y mensajes
│   └── memory.js       # Memoria: clasificador de intención, validación, D1 y contexto
├── migrations/         # Esquema SQL versionado de D1 (0001_create_conversations.sql)
├── .gitignore          # Archivos que Git no debe versionar (dependencias, secretos, generados)
├── package.json        # Metadatos del proyecto, scripts y dependencias
├── package-lock.json   # Versiones exactas instaladas (generado por npm)
├── wrangler.jsonc      # Configuración de Cloudflare Workers (incluye el binding AI)
└── README.md
```

## Requisitos

- Node.js 22 o superior
- npm
- Git
- Cuenta de Cloudflare (plan gratuito)

## Iniciar el proyecto localmente

```bash
npm install          # Instalar dependencias
npx wrangler login   # Solo la primera vez: vincula Wrangler con tu cuenta de Cloudflare
npm run dev          # Levanta Worker + interfaz en http://localhost:8787
npm run check        # Verifica que el Worker compila, sin subir nada a Cloudflare
```

> Workers AI no tiene modo 100 % local: aunque el Worker corra en tu PC, cada llamada a
> `/api/chat` usa el servicio real de Cloudflare (por eso hace falta `wrangler login`).

Luego abrí **http://localhost:8787/** en el navegador para usar el chat.

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/test` | Verifica que la API funciona. |
| POST | `/api/chat` | Envía un mensaje al modelo de IA y devuelve su respuesta. |
| POST | `/api/analyze` | Analiza un proceso y devuelve un objeto JSON estructurado. |
| POST | `/api/conversations` | Crea una conversación vacía y devuelve su `id` (UUID). |
| GET | `/api/conversations/:id` | Devuelve la conversación con sus mensajes en orden cronológico. |
| GET | `/api/memories` | Lista las memorias guardadas. |
| DELETE | `/api/memories/:id` | Borra una memoria (`400` id inválido, `404` inexistente). |

**`GET /api/test`** → `200`

```json
{ "status": "ok", "message": "PG AI funcionando" }
```

**`POST /api/chat`** con body `{ "messages": [{ "role": "user", "content": "Hola" }] }` → `200`

```json
{ "response": "¡Hola! ¿En qué puedo ayudarte?" }
```

Errores (siempre en JSON, con la forma `{ "error": "..." }`):

| Caso | Código |
| --- | --- |
| JSON inválido, `message` faltante, no es texto o está vacío | `400` |
| Método HTTP incorrecto | `405` |
| Ruta inexistente | `404` |
| Falla al llamar a Workers AI | `502` |

### Probar

PowerShell (Windows):

```powershell
Invoke-RestMethod http://localhost:8787/api/test
Invoke-RestMethod -Method Post -Uri http://localhost:8787/api/chat -ContentType "application/json" -Body '{"message":"Hola"}'
```

curl (en Windows usar `curl.exe`):

```bash
curl -i http://localhost:8787/api/test
curl -i -X POST http://localhost:8787/api/chat -H "Content-Type: application/json" -d "{\"message\":\"Hola\"}"
```

## Modelo de IA

**`@cf/meta/llama-3.2-3b-instruct`** (Meta Llama 3.2, 3B parámetros) vía Workers AI.

- Disponible en el plan Free y con ficha oficial en la documentación de Workers AI.
- Optimizado para diálogo multilingüe (incluye español).
- De los más económicos del catálogo: ≈ 4.625 neurons por millón de tokens de entrada y ≈ 30.475 por millón de salida.
- No es un modelo de "razonamiento", así que no gasta tokens ocultos pensando.

Se cambia en un solo lugar: la constante `MODEL` en `src/ai.js`.

## PG AI vs. Llama

- **System prompt:** instrucciones que se envían al modelo con `role: "system"` en cada petición. Viven en `src/system-prompt.js`; `src/ai.js` las antepone al mensaje del usuario.
- **PG AI ≠ Llama:** PG AI es la aplicación; el modelo de lenguaje subyacente es Llama 3.2 3B Instruct (Meta), ejecutado por Cloudflare Workers AI. Un system prompt condiciona el comportamiento del modelo, pero no lo entrena ni crea un modelo nuevo.
- **Contexto, no memoria:** el navegador reenvía la conversación en cada petición (ver más abajo). No hay memoria persistente.
- **Sin RAG ni herramientas:** no hay documentos, búsqueda, acciones ni integraciones; PG AI solo conversa.
- **Costo:** el system prompt también forma parte del contexto enviado, así que consume tokens/neurons en cada petición.

## Contexto conversacional (Fase 5)

**Contrato de `/api/chat`:** el cuerpo es `{ "messages": [{ "role": "user"|"assistant", "content": "..." }, ...] }`. El último mensaje debe ser `user`. Por compatibilidad también se acepta `{ "message": "..." }` (se convierte en un array de un mensaje; cuesta ~3 líneas y no rompe las pruebas anteriores).

**Quién controla qué:** el cliente controla la conversación; el servidor controla las instrucciones. El Worker arma `[{ role: "system", content: SYSTEM_PROMPT }, ...messages]`. Un mensaje con `role: "system"` (o cualquier rol distinto de `user`/`assistant`) se rechaza con `400`. Esto evita que el cliente reemplace el system prompt, pero **no hace al modelo inmune a prompt injection**: un mensaje `user` malicioso puede seguir intentando influir en el modelo.

**Límites de validación (400 si se superan):** máx. 50 mensajes por petición y 4000 caracteres por mensaje, `content` no vacío y solo campos `role`/`content`. Son límites de la **API** (protegen al Worker), no el límite real de contexto del modelo, que se mide en tokens y es mucho mayor.

**Contexto ≠ memoria:**
- *Contexto conversacional:* información reenviada explícitamente al modelo dentro de la petición. Es lo que hay ahora.
- *Memoria persistente:* información guardada fuera del modelo y recuperada después. **No existe todavía.**

**Dónde vive el historial:** en el array `conversation` de `public/app.js`, solo en memoria JavaScript (sin localStorage, cookies ni base de datos). Al refrescar la página se pierde. Si una petición falla, el mensaje del usuario se quita del array (la burbuja queda visible con el error) para que el historial siga alternando `user`/`assistant`.

**Ventana de contexto:** cada petición envía `system prompt + historial + mensaje nuevo`. A medida que la conversación crece, aumenta el input enviado y el consumo de neurons del plan gratuito, y eventualmente se alcanzaría el límite de contexto del modelo. Todavía no hay resumen ni truncamiento.

## Output estructurado (Fase 6)

Un **output estructurado** es una respuesta con campos y tipos definidos (JSON) en lugar de texto libre, para que **software** pueda leerla (`if (analysis.ai_required) …`) en vez de interpretar una frase.

**`POST /api/analyze`** — body `{ "text": "descripción del proceso" }` (obligatorio, texto no vacío, máx. 4000 caracteres). Responde:

```json
{
  "type": "process_analysis",
  "summary": "string",
  "problems": ["string"],
  "automation_candidate": true,
  "ai_required": false,
  "missing_information": ["string"]
}
```

Errores: `400` request inválido, `405` método incorrecto, `502` si falla Workers AI o si el modelo devuelve algo que no cumple el contrato (`"Invalid structured response from AI"`).

**Estrategia: JSON pedido por prompt.** La documentación oficial de Workers AI (JSON Mode) no incluye `@cf/meta/llama-3.2-3b-instruct` entre los modelos con `response_format`/JSON Schema nativo, y no cambiamos de modelo. Las instrucciones están en `src/analyze.js` (separadas del system prompt del chat) y el Worker valida el resultado.

**Dos validaciones distintas:** (1) del *request* (`text` existe, es string, no vacío, límite de longitud) y (2) del *output del modelo* (`parseAnalysis`: JSON/objeto válido, `type`, strings, booleans y arrays de strings reales). El modelo no es una fuente de confianza.

**Texto libre vs. JSON:** `/api/chat` está pensado para personas; `/api/analyze` para código. Todavía **no se ejecuta ninguna acción**: la IA interpreta, el software valida y decide, y recién después ejecutaría.

Ejemplo educativo (no conectado a nada):

```js
const analysis = await response.json();
if (analysis.automation_candidate && !analysis.ai_required) {
  console.log("Candidato a automatización tradicional");
}
```

`/api/analyze` usa `max_tokens: 600` y `temperature: 0.2`; `/api/chat` mantiene 512. Es una llamada sin historial y con un prompt propio, así que consume neurons del plan gratuito como cualquier otra.

> Limitación del modelo base: el modelo de 3B a veces produce expresiones poco naturales en español o inventa "problemas" cuando casi no hay información. Se documenta, no se parchea.

## Persistencia con D1 (Fase 7)

**D1** es la base de datos SQL (SQLite) de Cloudflare. Plan gratuito: 5 M filas leídas/día, 100 k escritas/día y 5 GB; al superarlo las consultas fallan, no se cobra.

**Esquema** (`migrations/0001_create_conversations.sql`): `conversations(id, created_at, updated_at)` y `messages(id, conversation_id, role, content, created_at)`, relación 1 → N. El `id` público es un UUID (`crypto.randomUUID()`: no es adivinable ni secuencial; el `id` autoincremental de `messages` es solo orden interno).

**Binding:** `env.DB` (ver `wrangler.jsonc`). Con `npm run dev` se usa una D1 **local** (archivo en `.wrangler/`, ignorado por Git); la base remota `pg-ai-db` existe en tu cuenta pero solo se usaría desplegando.

```bash
npm run db:migrate:local    # crea las tablas en la D1 local
npm run db:migrate:remote   # crea las tablas en la D1 de Cloudflare
```

> En Windows, `wrangler d1 migrations apply --local` se colgó en este equipo; si te pasa, aplicá el SQL con `npx wrangler d1 execute pg-ai-db --local --file migrations/0001_create_conversations.sql`.

**`POST /api/chat` ahora tiene dos modos:**
- Con `{ "conversation_id": "...", "message": "..." }` → **persistente**: D1 es la fuente de verdad. El Worker valida el id, lee los últimos mensajes, llama al modelo y **solo si responde** guarda el mensaje del usuario y la respuesta (en un `db.batch` atómico) y actualiza `updated_at`. Si Workers AI falla, no se guarda nada.
- Sin `conversation_id` → modo temporal de la Fase 5 (`messages` o `message`).
- `conversation_id` con formato inválido → `400`; UUID válido inexistente → `404`.

**localStorage solo guarda el `conversation_id`** (qué conversación abrir). El contenido vive en D1. Al refrescar, `public/app.js` lee el id, hace `GET /api/conversations/:id` y redibuja las burbujas; si D1 responde `404`, descarta el id y crea una conversación nueva. El botón **Nueva conversación** crea otra y deja de usar la anterior (no se borra de D1).

**Persistencia ≠ contexto ≠ memoria:**
- *Historial persistido:* todo lo guardado en D1.
- *Contexto del modelo:* solo los **últimos 20 mensajes** (`MAX_CONTEXT_MESSAGES` en `src/conversations.js`) se envían a Llama en cada petición. Es un límite de este experimento, distinto del límite real de contexto del modelo.
- *Memoria inteligente:* extraer y recordar hechos ("a Lu le gusta el verde") **no existe todavía**.

`/api/analyze` sigue siendo independiente y no usa D1. Concurrencia avanzada (dos pestañas escribiendo a la vez) queda fuera de alcance; el botón se deshabilita mientras hay una respuesta en curso.

> ⚠️ **Seguridad:** no hay usuarios ni autenticación, así que quien conozca un `conversation_id` puede leer esa conversación y escribir en ella. Es adecuado para el laboratorio local, no para guardar conversaciones sensibles ni para producción multiusuario.

## Memoria selectiva (Fase 8)

**Tres cosas distintas:** *historial* = lo que ocurrió en una conversación (tabla `messages`); *contexto* = lo que se envía al modelo en una petición; *memoria* = hechos que el usuario pidió guardar y que **sobreviven entre conversaciones** (tabla `memories`). Que algo esté en el historial no lo convierte en memoria.

**Tabla `memories`** (`migrations/0002_create_memories.sql`): `id` (UUID), `content`, `content_key` (UNIQUE, versión normalizada para evitar duplicados), `created_at`, `updated_at`. Sin `user_id`: no hay usuarios, la memoria es **global** para esta instancia del laboratorio.

**Solo memoria explícita.** Se guarda únicamente si el usuario lo pide ("recordá que…", "quiero que recuerdes que…"). Contar un dato ("mi comida favorita es la pizza") no lo guarda. Ante la duda, no se guarda.

**Flujo en `/api/chat` con `conversation_id`:** clasificador de intención (Llama, `temperature: 0`) → el Worker valida el JSON (`parseMemoryIntent`: `action` es `save`/`none`; si es `save`, `memory` es texto no vacío de ≤ 300 caracteres) → `saveMemory()` (el modelo nunca escribe en D1) → se leen las memorias → se arma el contexto → Llama responde → se guarda el historial. Si el clasificador o D1 fallan, no se guarda nada y se le avisa al modelo (aviso de la aplicación) para que **no afirme** que recordó algo. La respuesta incluye un campo `memory` con `classifier`, `stored` e `in_context` solo para inspección; la interfaz lo ignora.

**Duplicados:** `content_key` normaliza minúsculas, tildes, espacios y puntuación en los extremos, y `INSERT OR IGNORE` + índice UNIQUE evita insertar dos veces lo mismo. No hay deduplicación semántica.

**Borrado:** `DELETE /api/memories/:id`. Lo que PG AI puede guardar, también se puede borrar. No hay edición: borrar y volver a guardar.

**Cómo llega al modelo:** se agrega al mensaje `system` un bloque delimitado `<memorias>` con las memorias como **datos entre comillas JSON** y la indicación de que no son instrucciones. No se simulan mensajes del usuario. Solo se envían las **20 memorias más recientes** (`MAX_MEMORIES_IN_CONTEXT`); D1 puede guardar más. Esto reduce, pero **no elimina**, el riesgo de prompt injection: una memoria maliciosa sigue siendo texto que el modelo lee.

**Costo de inferencia:** cada mensaje con `conversation_id` hace **2 llamadas** a Workers AI (clasificador + respuesta), en lugar de 1. Consume más neurons del plan gratuito.

> ⚠️ **Seguridad:** sin autenticación ni usuarios, sin cifrado a nivel de aplicación, memoria global. No guardes contraseñas, tokens, datos bancarios, médicos ni secretos. No apto para múltiples usuarios.

> Limitaciones del modelo: Llama 3.2 3B puede clasificar mal (falsos positivos/negativos) o redactar la memoria de forma imperfecta. El clasificador solo ve el mensaje actual, no el historial ("recordá eso" no funciona).

> **Estado de verificación:** la lógica (validación, D1, duplicados, borrado, fallos, armado del contexto, 37 comprobaciones) se probó con un D1 de SQLite real y un modelo **simulado**. El comportamiento del clasificador con Llama real **no pudo probarse** en el equipo de desarrollo porque `wrangler` dejó de arrancar; falta correr los tests A–J con el modelo real.

## Límites del plan gratuito

- **Workers AI:** 10.000 neurons por día, se reinician a las 00:00 UTC. Al superarlos, las llamadas **fallan con error; no se cobra** (para pasar el límite habría que contratar Workers Paid).
- Las llamadas hechas desde `npm run dev` **también consumen** esa asignación.
- Generación de texto: hasta 300 peticiones por minuto.
- **Workers:** 100.000 peticiones por día y 10 ms de CPU por petición (esperar al modelo no cuenta como CPU).
- Algunos modelos del catálogo exigen método de pago; PG AI no los usa.
- Uso consultable en el dashboard de Cloudflare → AI → Workers AI.

## Arquitectura futura

> ⚠️ **Solo como referencia.** Estos componentes todavía **NO están implementados**.

```
Usuario
   ↓
Frontend
   ↓
Cloudflare Worker
   ↓
PG AI
   │
   ├── Modelo IA
   ├── Memoria
   ├── Base de conocimiento / RAG
   ├── Herramientas
   └── Automatizaciones
```

## Roadmap

```
Fase 0 — Preparación del entorno
Fase 1 — Primer endpoint / API
Fase 2 — Primer modelo de IA
Fase 3 — Interfaz de chat
Fase 4 — Instrucciones propias de PG AI
Fase 5 — Contexto conversacional temporal
Fase 6 — Outputs estructurados
Fase 7 — Persistencia con D1
Fase 8 — Memoria
Fase 9 — Documentos y RAG
Fase 10 — Tool calling
Fase 11 — Automatizaciones
Fase 12 — Agente
```

## Seguridad

No se versionan tokens, API keys ni credenciales. Los secretos locales van en `.dev.vars` (ignorado por Git) y los de producción se cargan con `wrangler secret put`.
