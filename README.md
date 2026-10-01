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

**Fase 0 — Preparación del entorno.**

## Estructura del proyecto

```
pg-ai/
├── src/
│   └── index.js        # Punto de entrada del Worker (placeholder de Fase 0)
├── .gitignore          # Archivos que Git no debe versionar (dependencias, secretos, generados)
├── package.json        # Metadatos del proyecto, scripts y dependencias
├── package-lock.json   # Versiones exactas instaladas (generado por npm)
├── wrangler.jsonc      # Configuración de Cloudflare Workers
└── README.md
```

## Requisitos

- Node.js 22 o superior
- npm
- Git
- Cuenta de Cloudflare (plan gratuito)

## Uso

```bash
# Instalar dependencias
npm install

# Levantar el Worker en local (http://localhost:8787)
npm run dev

# Verificar que el Worker compila, sin subir nada a Cloudflare
npm run check
```

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
