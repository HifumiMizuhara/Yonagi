# Himawari 🌻

A privacy-first, local-first, multi-provider LLM chat client that runs entirely in your browser. Bring your own API keys, talk to models from many providers in a single unified interface, and keep all of your data on your own device.

Himawari has **no backend**. There is no server to deploy, no account to create, and no telemetry. Your chats, settings, and API keys live in your browser's IndexedDB. Requests go directly from your browser to each provider's API.

---
## Special Thanks

- [LINUX DO](https://linux.do/) A very friendly community.

## Highlights

- **Multiple providers, one interface** — Gemini, OpenAI (ChatGPT), Claude (Anthropic), DeepSeek, OpenRouter, Ollama (local), plus any OpenAI-compatible custom endpoint.
- **Local-first storage** — All chats, messages, and settings are stored locally in IndexedDB via [Dexie](https://dexie.org/). Nothing leaves your machine except the direct calls to the model providers you configure.
- **Streaming responses** — Token-by-token streaming with a stop button to abort generation at any time.
- **Encrypted API keys** — Optionally protect your stored API keys with a passphrase. Keys are encrypted at rest and unlocked per session.
- **Attachments** — Send images, PDFs, and text files. PDFs are parsed client-side with `pdfjs-dist`.
- **Message variants & regeneration** — Regenerate a response (optionally with a different model) and switch between variants of the same answer.
- **Branching & comparison** — Branch a conversation from any message to explore alternatives.
- **Reasoning effort selector** — Control reasoning/effort levels for models that support it.
- **Web search toggle** — Enable provider-side web search where supported, with citation rendering.
- **Token & cost tracking** — Per-message token usage and configurable per-model pricing to estimate spend.
- **Full-text search** — Search across all of your chats and messages.
- **Prompt presets** — Save and reuse system-prompt / prompt snippets.
- **Markdown rendering** — GitHub-flavored Markdown with `react-markdown` + `remark-gfm`.
- **Internationalization** — Built-in UI translations for Japanese (ja), English (en), and Chinese (zh), with browser-locale auto-detection.
- **Light / dark / system themes** — Class-based dark mode powered by Tailwind CSS v4.
- **Single-file build** — Can be bundled into one self-contained HTML file for easy sharing or offline use.

---

## Supported providers

| Provider | ID | Default base URL | Notes |
|----------|-----|------------------|-------|
| Google Gemini | `gemini` | `https://generativelanguage.googleapis.com` | Enabled by default |
| OpenAI (ChatGPT) | `openai` | `https://api.openai.com` | |
| Claude (Anthropic) | `claude` | `https://api.anthropic.com` | |
| DeepSeek | `deepseek` | — | OpenAI-compatible |
| OpenRouter | `openrouter` | — | Aggregator for many models |
| Ollama | `ollama` | — | Run models locally |
| Custom | `custom` | user-defined | Any OpenAI-compatible API |

Each provider supports a configurable base URL, API key, model list (with model search / fetch), and an optional CORS proxy for endpoints that don't send permissive CORS headers.

---

## Tech stack

- **React 19** + **TypeScript**
- **Vite 8** for dev server and builds
- **Tailwind CSS v4** (`@tailwindcss/vite`) for styling
- **Zustand** for application state (`src/store/useChatStore.ts`)
- **Dexie** + **dexie-react-hooks** for IndexedDB persistence (`src/services/db.ts`)
- **react-markdown** + **remark-gfm** for message rendering
- **pdfjs-dist** for client-side PDF text extraction
- **lucide-react** for icons
- **vite-plugin-singlefile** for the bundled single-HTML build

---

## Getting started

### Prerequisites

- Node.js 18+ (Node 20+ recommended)
- An API key for at least one supported provider (or a local Ollama install)

### Install & run

```bash
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

### Configure a provider

1. Open **Settings**.
2. Pick a provider, paste your API key, and enable it.
3. Add or fetch the models you want to use, then start chatting.

> API keys are stored in your browser only. Enable **key encryption** in Settings to protect them with a passphrase.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint over the project |

The production build uses `vite-plugin-singlefile`, so `npm run build` emits a self-contained HTML file in `dist/` that you can open directly or host anywhere.

---

## Project structure

```
src/
├── App.tsx                 # Root component & layout
├── main.tsx                # React entry point
├── components/
│   ├── ChatArea.tsx        # Message list, composer, streaming UI
│   ├── Sidebar.tsx         # Chat list & navigation
│   ├── SettingsModal.tsx   # Provider, theme, language, pricing, encryption settings
│   ├── SearchModal.tsx     # Full-text search across chats
│   └── UnlockModal.tsx     # Passphrase prompt for encrypted keys
├── services/
│   ├── api.ts              # Provider request formatting & streaming (openai/claude/gemini)
│   └── db.ts               # Dexie schema & data models
├── store/
│   └── useChatStore.ts     # Zustand store: chats, messages, settings, actions
├── hooks/
│   └── useTranslation.ts   # i18n hook
└── utils/
    ├── crypto.ts           # API key encryption / decryption
    ├── fileParser.ts       # Image / PDF / text attachment parsing
    ├── i18n.ts             # Translation strings (ja/en/zh)
    └── tokens.ts           # Token estimation & cost calculation
```

---

## Privacy & security

- **No server, no telemetry.** Himawari talks only to the provider APIs you configure.
- **Local storage.** Chats, settings, and keys are persisted in IndexedDB on your device.
- **Optional key encryption.** When enabled, API keys are encrypted at rest with a passphrase you provide; the passphrase is held in memory only for the session and is never persisted.
- **CORS proxy support.** Some provider endpoints require a proxy for direct browser access; configure one per provider if needed. Be mindful that a proxy can see traffic routed through it.

---

## License

Released under the [MIT License](LICENSE).
