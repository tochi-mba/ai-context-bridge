# AI Context Bridge

A production-ready Chrome extension that saves chat context from any AI platform and lets you inject it into another — carry your conversation from ChatGPT to Claude to Gemini and back.

## Supported Platforms

| Platform | Extract | Inject |
|---|---|---|
| ChatGPT (chat.openai.com / chatgpt.com) | ✓ | ✓ |
| Claude (claude.ai) | ✓ | ✓ |
| Gemini (gemini.google.com) | ✓ | ✓ |
| Perplexity (perplexity.ai) | ✓ | ✓ |
| Grok (grok.com / x.com/i/grok) | ✓ | ✓ |

## Setup

### 1. Install dependencies and generate icons

```bash
npm install
npm run build:icons   # generates PNG icons from SVG (run once)
npm run build         # compiles the extension to /dist
```

For crisp SVG-based icons install `sharp` first:

```bash
npm install -D sharp
npm run build:icons
```

### 2. Load the extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder inside this project
5. The AI Context Bridge icon appears in your toolbar

## How to Use

### Saving a context

1. Open a conversation on any supported AI platform
2. Wait until the AI has **finished responding** (important!)
3. Click the **💾 Save Context** floating button (bottom-right corner), or press **Ctrl+Shift+S** (Cmd+Shift+S on Mac)
4. Your conversation is saved with a title, platform badge, and timestamp

### Injecting a context

1. Open a **new chat** on any AI platform (same or different)
2. Click the **📋 Inject Context** floating button, or press **Ctrl+Shift+V**
3. Search and select the context you want to transfer
4. Click **Inject into Chat**
5. Review the formatted context in the input box and press Send

### Managing contexts (Popup)

Click the extension icon in the toolbar to:

- See all saved contexts with search
- **Rename** a context (click the title)
- **Inject** a context into the current tab
- **Export** individual contexts as JSON
- **Export All** / **Import** for backup and sharing

### Settings

Right-click the extension icon → **Options**, or use the ⚙ button in the popup.

## Architecture

```
src/
├── shared/          # Types, constants, storage, compression, formatter
├── background/      # Service Worker — message router + storage coordinator  
├── content-scripts/
│   ├── platforms/   # Platform-specific DOM extractors (ChatGPT, Claude, Gemini…)
│   └── ui/          # Floating button + modal (Shadow DOM isolated)
├── popup/           # Extension popup — context library
└── options/         # Settings page
```

## Edge Cases Handled

- **Streaming responses** — save button disables while AI is generating
- **SPA navigation** — re-initializes on URL changes without reloading the page
- **React/Vue inputs** — uses native value setter + synthetic events to properly trigger state
- **Long conversations** — compresses with LZ-string; truncates if exceeding platform input limits
- **Images & files** — cannot transfer, but warns the user explicitly
- **Storage limits** — warns at 80% capacity; enforces 5 MB hard cap
- **Duplicate saves** — UUID-based; import deduplication
- **Style isolation** — all injected UI uses Shadow DOM to avoid CSS conflicts with host pages
- **Selector fallbacks** — every platform has multiple selector tiers; graceful degradation if AI site updates its DOM
- **Incognito** — `unlimitedStorage` permission declared; storage is per-profile

## Development

```bash
npm run dev          # watch mode — rebuilds on file changes
npm run type-check   # TypeScript without emitting
```

After each `npm run dev` rebuild, go to `chrome://extensions` and click the **↻ refresh** icon on the extension card.

## Updating selectors

When an AI platform updates its UI and breaks extraction, edit the relevant file in `src/content-scripts/platforms/`. Each platform class has a `selectors` object with ordered fallback arrays — add new selectors to the front of each array.
