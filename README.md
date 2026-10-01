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
│   └── system-prompt.js # Instrucciones (system prompt) de PG AI
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

**`GET /api/test`** → `200`

```json
{ "status": "ok", "message": "PG AI funcionando" }
```

**`POST /api/chat`** con body `{ "message": "Hola" }` → `200`

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
- **Sin memoria:** cada mensaje es independiente (system prompt + mensaje actual). El modelo no recibe mensajes anteriores. Limitación actual, prevista para una fase posterior.
- **Sin RAG ni herramientas:** no hay documentos, búsqueda, acciones ni integraciones; PG AI solo conversa.
- **Costo:** el system prompt también forma parte del contexto enviado, así que consume tokens/neurons en cada petición.

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
Fase 5 — Outputs estructurados
Fase 6 — Historial y persistencia
Fase 7 — Memoria
Fase 8 — Documentos y RAG
Fase 9 — Tool calling
Fase 10 — Automatizaciones
Fase 11 — Agente
```

## Seguridad

No se versionan tokens, API keys ni credenciales. Los secretos locales van en `.dev.vars` (ignorado por Git) y los de producción se cargan con `wrangler secret put`.
