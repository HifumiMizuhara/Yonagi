# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Yonagi** (formerly Himawari) is a privacy-first, browser-only LLM chat client. There is no backend — all state lives in IndexedDB, and API calls go directly from the browser to each provider. The app is deployed as a single self-contained HTML file to GitHub Pages.

## Commands

```bash
npm run dev        # Vite dev server with HMR at http://localhost:5173
npm run build      # tsc -b && vite build → dist/ (single-file HTML)
npm test           # Node.js built-in test runner (no framework)
npm run lint       # ESLint
npm run preview    # Preview the production build locally
npm run deploy     # Build + publish dist/ to the gh-pages branch
```

### Running a single test file

```bash
node --experimental-strip-types --test tests/providerCompatibility.test.ts
```

Tests use Node's built-in `node:test` runner with `--experimental-strip-types` to execute TypeScript directly — no compilation step required.

## Architecture

### Data layer — `src/services/db.ts`

Dexie schema with three tables: `chats`, `messages`, `settings`. The IndexedDB database is named **`MinaseDatabase`** (not `YonagiDatabase`) — this name must stay unchanged to preserve existing user data. Settings are stored as key-value pairs; structured objects (`providers`, `modelPricing`, etc.) are stored as single JSON-serialized values.

`Message` objects carry a `variants[]` array for regeneration history. The active variant's content is always mirrored into `message.content` so the rest of the code can read it without variant-index logic.

### State — `src/store/useChatStore.ts`

Single Zustand store for all application state. `init()` bootstraps from DB on startup, including provider config backfilling (new fields in `DEFAULT_PROVIDERS` are merged into stored configs so existing users get new fields like `corsProxy` without losing their settings).

`streamAssistantReply()` (closure inside the store) drives the streaming lifecycle:
- Assigns a **`generationId`** (UUID) at stream start. The `finally` block only resets state if it still holds the current `generationId`, preventing races when aborting and immediately regenerating.
- Batches React state updates (80 ms) and IndexedDB writes (200 ms) to avoid per-chunk re-renders during long responses.

### API layer — `src/services/api.ts`

`streamChatCompletion()` handles the full streaming pipeline. Wire format differs per provider:

| Provider | Endpoint | Auth header | Stream format |
|---|---|---|---|
| Gemini | `v1beta/models/{model}:streamGenerateContent?alt=sse` | `x-goog-api-key` | SSE JSON |
| Claude | `v1/messages` | `x-api-key` + `anthropic-version` | SSE JSON |
| Ollama | `/api/chat` | none | Newline-delimited JSON (not SSE) |
| OpenAI / DeepSeek / custom | `v1/chat/completions` | `Authorization: Bearer` | SSE JSON |

CORS proxy support: if `ProviderConfig.corsProxy` is set, the proxy URL is prepended to every outbound request.

### Provider compatibility — `src/utils/providerCompatibility.ts`

All model-specific branching is isolated here:
- `buildApiUrl()` — normalises base URLs (strips accidental path suffixes, avoids double version segments).
- `getGeminiThinkingConfig()` / `getClaudeThinkingConfig()` — maps effort levels to provider-specific thinking parameters.
- `normalizeOpenAiEffort()` — clamps effort values for models that don't support all levels.
- `RETIRED_MODEL_REPLACEMENTS` / `replaceRetiredModel()` / `migrateProviderModels()` — transparently upgrades stored model IDs when a model is retired.

When adding support for a new model capability or a new provider, this is the file to extend first.

### Key encryption — `src/utils/crypto.ts`

AES-GCM via Web Crypto API. When encryption is enabled, provider records in the DB have empty `apiKey`; the real keys are stored as an `EncryptedPayload` blob under the `encryptedKeys` settings key. The passphrase is held in Zustand memory only (`sessionPassphrase`), never persisted.

### Build configuration

`vite.config.ts` sets `base: '/Yonagi/'` for production builds (GitHub Pages sub-path, matching the `Yonagi` repo name after the Himawari rebrand) and `'/'` for the dev server. `vite-plugin-singlefile` inlines all assets into one HTML file. Tailwind CSS v4 is integrated via `@tailwindcss/vite` (no `tailwind.config.js`).

## Key invariants

- **Never rename `MinaseDatabase`** — it would orphan all existing user data.
- **Never persist `sessionPassphrase`** to storage — it must stay in memory only.
- **`generateId` pattern** — always use a UUID guard when writing async streaming loops; the `finally` block must check ownership before resetting shared state.
- **Provider backfill** — when adding new fields to `DEFAULT_PROVIDERS`, the merge logic in `store.init()` picks them up automatically; no migration is needed.
- **Debounced writes** — clear both timers in `finally` and do a final synchronous flush before updating chat metadata, otherwise the last tokens can be lost on fast completions.
