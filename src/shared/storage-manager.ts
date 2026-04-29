import type {
  ChatContext,
  ChatMessage,
  ExtractionResult,
  ExtensionSettings,
  PlatformId,
  StorageState,
  StorageStats,
} from './types.js';
import {
  DEFAULT_SETTINGS,
  MAX_CONTEXT_MESSAGE_COUNT,
  MAX_PREVIEW_LENGTH,
  MAX_TITLE_LENGTH,
  STORAGE_KEY,
  STORAGE_MAX_BYTES,
  STORAGE_SCHEMA_VERSION,
  STORAGE_WARN_BYTES,
} from './constants.js';
import { compressMessages, decompressMessages } from './compression.js';

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

function buildPreview(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return '(no user messages)';
  return firstUser.content.slice(0, MAX_PREVIEW_LENGTH);
}

function buildTitle(messages: ChatMessage[], platformName: string): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return `${platformName} — ${new Date().toLocaleDateString()}`;
  const raw = firstUser.content.replace(/\s+/g, ' ').trim();
  return raw.slice(0, MAX_TITLE_LENGTH);
}

function estimateStateBytes(state: StorageState): number {
  return JSON.stringify(state).length * 2; // UTF-16: 2 bytes/char
}

// ──────────────────────────────────────────────────────────────────────────────
// Load / save raw state
// ──────────────────────────────────────────────────────────────────────────────

async function loadState(): Promise<StorageState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY] as StorageState | undefined;
  if (!raw) {
    return { contexts: [], settings: { ...DEFAULT_SETTINGS }, version: STORAGE_SCHEMA_VERSION };
  }
  return migrateState(raw);
}

async function saveState(state: StorageState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function migrateState(state: StorageState): StorageState {
  // Future migrations go here; currently no-op.
  return { ...state, version: STORAGE_SCHEMA_VERSION };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export interface SaveContextOptions {
  extraction: ExtractionResult;
  platformId: PlatformId;
  platformName: string;
  sourceUrl: string;
  customTitle?: string;
  compressionEnabled?: boolean;
}

export interface SaveContextResult {
  context: ChatContext;
  storageWarning?: string;
}

export async function saveContext(options: SaveContextOptions): Promise<SaveContextResult> {
  const {
    extraction,
    platformId,
    platformName,
    sourceUrl,
    customTitle,
    compressionEnabled = true,
  } = options;

  const state = await loadState();
  const { settings } = state;

  // Truncate very long conversations
  let messages = extraction.messages;
  if (messages.length > MAX_CONTEXT_MESSAGE_COUNT) {
    messages = messages.slice(-MAX_CONTEXT_MESSAGE_COUNT);
  }

  const charCount = messages.reduce((sum, m) => sum + m.content.length, 0);
  const shouldCompress = compressionEnabled && settings.compressionEnabled && charCount > 2000;

  let storedMessages: ChatMessage[];
  let compressed = false;

  if (shouldCompress) {
    // Store compressed data as a special marker in the messages array
    const compressedStr = compressMessages(messages);
    storedMessages = [{ role: 'system', content: compressedStr }];
    compressed = true;
  } else {
    storedMessages = messages;
  }

  const title = customTitle
    ? customTitle.slice(0, MAX_TITLE_LENGTH)
    : buildTitle(messages, platformName);

  const context: ChatContext = {
    id: generateId(),
    title,
    sourcePlatform: platformId,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    messageCount: messages.length,
    charCount,
    preview: buildPreview(messages),
    compressed,
    messages: storedMessages,
    metadata: {
      model: extraction.model,
      sourceUrl,
      hasImages: extraction.hasImages,
      hasFiles: extraction.hasFiles,
      schemaVersion: STORAGE_SCHEMA_VERSION,
    },
  };

  // Enforce max contexts limit
  while (state.contexts.length >= settings.maxContexts) {
    state.contexts.sort(
      (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    );
    state.contexts.shift();
  }

  state.contexts.unshift(context);

  const estimatedBytes = estimateStateBytes(state);
  if (estimatedBytes > STORAGE_MAX_BYTES) {
    throw new Error(
      'Storage limit reached. Please delete some saved contexts before saving more.'
    );
  }

  await saveState(state);

  const storageWarning =
    estimatedBytes > STORAGE_WARN_BYTES
      ? `Storage is ${Math.round((estimatedBytes / STORAGE_MAX_BYTES) * 100)}% full.`
      : undefined;

  return { context, storageWarning };
}

export async function getAllContexts(search?: string): Promise<ChatContext[]> {
  const state = await loadState();
  let { contexts } = state;
  if (search && search.trim()) {
    const term = search.toLowerCase();
    contexts = contexts.filter(
      (c) =>
        c.title.toLowerCase().includes(term) ||
        c.preview.toLowerCase().includes(term) ||
        c.sourcePlatform.toLowerCase().includes(term)
    );
  }
  return contexts;
}

export async function getContextById(id: string): Promise<ChatContext | undefined> {
  const state = await loadState();
  return state.contexts.find((c) => c.id === id);
}

/**
 * Returns a context with messages fully decompressed.
 * Always use this before injecting or displaying full messages.
 */
export async function getContextWithMessages(id: string): Promise<ChatContext | undefined> {
  const context = await getContextById(id);
  if (!context) return undefined;
  if (!context.compressed) return context;

  const compressedData = context.messages[0]?.content;
  if (!compressedData) return context;

  try {
    const messages = decompressMessages(compressedData);
    return { ...context, messages, compressed: false };
  } catch {
    return { ...context, messages: [], compressed: false };
  }
}

export async function updateContextTitle(id: string, title: string): Promise<void> {
  const state = await loadState();
  const idx = state.contexts.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Context ${id} not found.`);
  state.contexts[idx]!.title = title.slice(0, MAX_TITLE_LENGTH);
  state.contexts[idx]!.updatedAt = nowISO();
  await saveState(state);
}

export async function deleteContext(id: string): Promise<void> {
  const state = await loadState();
  state.contexts = state.contexts.filter((c) => c.id !== id);
  await saveState(state);
}

export async function deleteAllContexts(): Promise<void> {
  const state = await loadState();
  state.contexts = [];
  await saveState(state);
}

export async function getSettings(): Promise<ExtensionSettings> {
  const state = await loadState();
  return { ...DEFAULT_SETTINGS, ...state.settings };
}

export async function updateSettings(patch: Partial<ExtensionSettings>): Promise<void> {
  const state = await loadState();
  state.settings = { ...state.settings, ...patch };
  await saveState(state);
}

export async function getStorageStats(): Promise<StorageStats> {
  const state = await loadState();
  const { contexts } = state;

  const totalChars = contexts.reduce((sum, c) => sum + c.charCount, 0);
  const estimatedBytes = estimateStateBytes(state);
  const estimatedBytesCompressed = contexts
    .filter((c) => c.compressed)
    .reduce((sum, c) => sum + c.messages[0]!.content.length * 2, 0);

  const sorted = [...contexts].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return {
    totalContexts: contexts.length,
    totalChars,
    estimatedBytes,
    estimatedBytesCompressed,
    oldestContext: sorted[0]?.createdAt,
    newestContext: sorted[sorted.length - 1]?.createdAt,
  };
}

export async function exportContexts(ids?: string[]): Promise<string> {
  const state = await loadState();
  const toExport = ids
    ? state.contexts.filter((c) => ids.includes(c.id))
    : state.contexts;

  // Decompress all before export so the export file is human-readable
  const decompressed = await Promise.all(
    toExport.map(async (ctx) => {
      if (!ctx.compressed) return ctx;
      const full = await getContextWithMessages(ctx.id);
      return full ?? ctx;
    })
  );

  return JSON.stringify(
    { version: STORAGE_SCHEMA_VERSION, exportedAt: nowISO(), contexts: decompressed },
    null,
    2
  );
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export async function importContexts(json: string): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  let parsed: { contexts?: ChatContext[] };
  try {
    parsed = JSON.parse(json) as { contexts?: ChatContext[] };
  } catch {
    throw new Error('Invalid JSON format.');
  }

  if (!Array.isArray(parsed.contexts)) {
    throw new Error('JSON must contain a "contexts" array.');
  }

  const state = await loadState();
  const existingIds = new Set(state.contexts.map((c) => c.id));

  for (const ctx of parsed.contexts) {
    try {
      if (existingIds.has(ctx.id)) {
        result.skipped++;
        continue;
      }
      if (!ctx.id || !ctx.title || !ctx.sourcePlatform || !Array.isArray(ctx.messages)) {
        result.errors.push(`Skipped invalid context: ${String(ctx.id ?? 'unknown')}`);
        continue;
      }
      state.contexts.unshift(ctx);
      existingIds.add(ctx.id);
      result.imported++;
    } catch (e) {
      result.errors.push(`Error importing context: ${String(e)}`);
    }
  }

  await saveState(state);
  return result;
}
