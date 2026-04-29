# AI Context Bridge

A Chrome extension that saves your chat history from any AI platform and lets you instantly inject it into another — carry your conversation seamlessly from ChatGPT to Claude to Gemini and back.

Built with TypeScript, Vite, and the Chrome Extensions Manifest V3 API.

## Features

- **Cross-platform context transfer** — extract a conversation from one AI and inject it into another in seconds
- **5 platforms supported** — ChatGPT, Claude, Gemini, Perplexity, and Grok
- **Shadow DOM isolation** — injected UI never conflicts with the host page's styles
- **LZ-string compression** — long conversations are compressed before storage; hard cap at 5 MB with warnings at 80%
- **Streaming-aware** — the save button disables while the AI is still generating, preventing partial captures
- **SPA navigation support** — re-initializes on URL changes without a page reload
- **React/Vue input compatibility** — uses native value setter + synthetic events to properly trigger framework state
- **Keyboard shortcuts** — `Ctrl+Shift+S` to save, `Ctrl+Shift+V` to inject
- **Import/export** — back up and share contexts as JSON; UUID-based deduplication on import
- **Selector fallbacks** — every platform has ordered fallback selector arrays for resilience against DOM updates

## Supported Platforms

| Platform | Extract | Inject |
|---|---|---|
| ChatGPT (chat.openai.com / chatgpt.com) | ✓ | ✓ |
| Claude (claude.ai) | ✓ | ✓ |
| Gemini (gemini.google.com) | ✓ | ✓ |
| Perplexity (perplexity.ai) | ✓ | ✓ |
| Grok (grok.com / x.com/i/grok) | ✓ | ✓ |

## Tech Stack

- **TypeScript** — fully typed across all modules
- **Vite + vite-plugin-web-extension** — fast builds with HMR-style watch mode
- **Vitest** — unit and integration tests with jsdom
- **Chrome Extensions Manifest V3** — service worker background, content scripts, declarative permissions

## Architecture

```
src/
├── shared/              # Types, constants, storage manager, compression, formatter
├── background/          # Service Worker — message router + storage coordinator
├── content-scripts/
│   ├── platforms/       # Platform-specific DOM extractors (ChatGPT, Claude, Gemini…)
│   └── ui/              # Floating button + context picker modal (Shadow DOM)
├── popup/               # Extension popup — context library with search
└── options/             # Settings page
```

Each platform class in `src/content-scripts/platforms/` extends a shared `BasePlatform` with standardised `extract()` and `inject()` methods. The registry pattern means adding a new platform requires only one new file and a single registry entry.

## Getting Started

```bash
npm install
npm run build:icons   # generates PNG icons from SVG (run once)
npm run build         # compiles the extension to /dist
```

Then load the extension in Chrome:

1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

## Development

```bash
npm run dev          # watch mode — rebuilds on file changes
npm run type-check   # TypeScript check without emitting
npm run test         # run test suite
```

After each rebuild, click the **↻ refresh** icon on the extension card in `chrome://extensions`.

## Updating Platform Selectors

When an AI platform updates its UI and breaks extraction, edit the relevant file in `src/content-scripts/platforms/`. Each platform class has a `selectors` object with ordered fallback arrays — add new selectors to the front.
