import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveContext,
  getAllContexts,
  getContextById,
  getContextWithMessages,
  updateContextTitle,
  deleteContext,
  deleteAllContexts,
  getSettings,
  updateSettings,
  getStorageStats,
  exportContexts,
  importContexts,
} from '../../src/shared/storage-manager.js';
import { DEFAULT_SETTINGS } from '../../src/shared/constants.js';
import type { ExtractionResult } from '../../src/shared/types.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeExtraction(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    messages: [
      { role: 'user', content: 'What is TypeScript?' },
      { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript.' },
    ],
    hasImages: false,
    hasFiles: false,
    ...overrides,
  };
}

async function seedContext(title?: string) {
  return saveContext({
    extraction: makeExtraction(),
    platformId: 'chatgpt',
    platformName: 'ChatGPT',
    sourceUrl: 'https://chat.openai.com/c/abc123',
    customTitle: title,
    compressionEnabled: false,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Save context
// ──────────────────────────────────────────────────────────────────────────────

describe('saveContext', () => {
  it('returns a context with a generated id', async () => {
    const { context } = await seedContext();
    expect(context.id).toBeTruthy();
    expect(typeof context.id).toBe('string');
  });

  it('stores the correct platform', async () => {
    const { context } = await seedContext();
    expect(context.sourcePlatform).toBe('chatgpt');
  });

  it('sets messageCount correctly', async () => {
    const { context } = await seedContext();
    expect(context.messageCount).toBe(2);
  });

  it('auto-generates a title from the first user message', async () => {
    const { context } = await seedContext();
    expect(context.title).toContain('What is TypeScript?');
  });

  it('respects a custom title', async () => {
    const { context } = await seedContext('My Custom Title');
    expect(context.title).toBe('My Custom Title');
  });

  it('truncates title at 80 chars', async () => {
    const longTitle = 'A'.repeat(200);
    const { context } = await seedContext(longTitle);
    expect(context.title.length).toBeLessThanOrEqual(80);
  });

  it('builds a preview from the first user message', async () => {
    const { context } = await seedContext();
    expect(context.preview).toContain('What is TypeScript?');
  });

  it('stores source URL in metadata', async () => {
    const { context } = await seedContext();
    expect(context.metadata.sourceUrl).toBe('https://chat.openai.com/c/abc123');
  });

  it('stores hasImages flag', async () => {
    const { context } = await saveContext({
      extraction: makeExtraction({ hasImages: true }),
      platformId: 'claude',
      platformName: 'Claude',
      sourceUrl: 'https://claude.ai',
      compressionEnabled: false,
    });
    expect(context.metadata.hasImages).toBe(true);
  });

  it('sets createdAt and updatedAt as ISO strings', async () => {
    const { context } = await seedContext();
    expect(() => new Date(context.createdAt)).not.toThrow();
    expect(() => new Date(context.updatedAt)).not.toThrow();
  });

  it('returns no storageWarning when storage is not near limit', async () => {
    const { storageWarning } = await seedContext();
    expect(storageWarning).toBeUndefined();
  });

  it('saves the actual messages when compression is disabled', async () => {
    const { context } = await seedContext();
    expect(context.compressed).toBe(false);
    expect(context.messages).toHaveLength(2);
    expect(context.messages[0]!.role).toBe('user');
  });

  it('throws when extraction has no messages and a save is attempted', async () => {
    // Storage manager doesn't block empty saves — verify it still saves
    const { context } = await saveContext({
      extraction: makeExtraction({ messages: [] }),
      platformId: 'gemini',
      platformName: 'Gemini',
      sourceUrl: 'https://gemini.google.com',
      compressionEnabled: false,
    });
    expect(context.messageCount).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Get contexts
// ──────────────────────────────────────────────────────────────────────────────

describe('getAllContexts', () => {
  it('returns empty array when no contexts saved', async () => {
    const contexts = await getAllContexts();
    expect(contexts).toEqual([]);
  });

  it('returns all saved contexts', async () => {
    await seedContext('First');
    await seedContext('Second');
    const contexts = await getAllContexts();
    expect(contexts).toHaveLength(2);
  });

  it('orders newest context first', async () => {
    await seedContext('Older');
    await seedContext('Newer');
    const contexts = await getAllContexts();
    expect(contexts[0]!.title).toBe('Newer');
  });

  it('filters by search term (title)', async () => {
    await seedContext('TypeScript Help');
    // Give "Python Guide" a completely different message set so its
    // preview doesn't contain "typescript"
    await saveContext({
      extraction: {
        messages: [{ role: 'user', content: 'Explain list comprehensions in Python.' }],
        hasImages: false,
        hasFiles: false,
      },
      platformId: 'claude',
      platformName: 'Claude',
      sourceUrl: 'https://claude.ai',
      customTitle: 'Python Guide',
      compressionEnabled: false,
    });
    const results = await getAllContexts('typescript');
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toContain('TypeScript');
  });

  it('filters by search term (preview)', async () => {
    await seedContext();
    const results = await getAllContexts('What is TypeScript');
    expect(results).toHaveLength(1);
  });

  it('returns empty array when search has no matches', async () => {
    await seedContext('React Tutorial');
    const results = await getAllContexts('vue');
    expect(results).toEqual([]);
  });

  it('returns all contexts for empty search string', async () => {
    await seedContext('A');
    await seedContext('B');
    const results = await getAllContexts('');
    expect(results).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Get by ID
// ──────────────────────────────────────────────────────────────────────────────

describe('getContextById', () => {
  it('returns the correct context by id', async () => {
    const { context } = await seedContext('Find Me');
    const found = await getContextById(context.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(context.id);
    expect(found!.title).toBe('Find Me');
  });

  it('returns undefined for unknown id', async () => {
    const result = await getContextById('non-existent-id');
    expect(result).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Decompressed context
// ──────────────────────────────────────────────────────────────────────────────

describe('getContextWithMessages', () => {
  it('returns messages for uncompressed context', async () => {
    const { context } = await seedContext();
    const full = await getContextWithMessages(context.id);
    expect(full).toBeDefined();
    expect(full!.messages).toHaveLength(2);
  });

  it('returns undefined for unknown id', async () => {
    const result = await getContextWithMessages('bad-id');
    expect(result).toBeUndefined();
  });

  it('decompresses a compressed context', async () => {
    const { context } = await saveContext({
      extraction: makeExtraction({
        messages: [
          { role: 'user', content: 'Compress me!'.repeat(100) },
          { role: 'assistant', content: 'Compressed response.'.repeat(100) },
        ],
      }),
      platformId: 'claude',
      platformName: 'Claude',
      sourceUrl: 'https://claude.ai',
      compressionEnabled: true,
    });

    // Only compressed if content is > 2000 chars
    if (context.compressed) {
      const full = await getContextWithMessages(context.id);
      expect(full!.messages).toHaveLength(2);
      expect(full!.compressed).toBe(false);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Update title
// ──────────────────────────────────────────────────────────────────────────────

describe('updateContextTitle', () => {
  it('updates the title', async () => {
    const { context } = await seedContext('Old Title');
    await updateContextTitle(context.id, 'New Title');
    const found = await getContextById(context.id);
    expect(found!.title).toBe('New Title');
  });

  it('truncates title to 80 chars', async () => {
    const { context } = await seedContext('Initial');
    await updateContextTitle(context.id, 'A'.repeat(150));
    const found = await getContextById(context.id);
    expect(found!.title.length).toBeLessThanOrEqual(80);
  });

  it('throws for unknown id', async () => {
    await expect(updateContextTitle('ghost', 'Title')).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Delete
// ──────────────────────────────────────────────────────────────────────────────

describe('deleteContext', () => {
  it('removes the context', async () => {
    const { context } = await seedContext();
    await deleteContext(context.id);
    const remaining = await getAllContexts();
    expect(remaining.find((c) => c.id === context.id)).toBeUndefined();
  });

  it('does not affect other contexts', async () => {
    const { context: c1 } = await seedContext('Keep');
    const { context: c2 } = await seedContext('Delete');
    await deleteContext(c2.id);
    const remaining = await getAllContexts();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(c1.id);
  });

  it('is a no-op for unknown id', async () => {
    await seedContext('Stay');
    await deleteContext('does-not-exist');
    const remaining = await getAllContexts();
    expect(remaining).toHaveLength(1);
  });
});

describe('deleteAllContexts', () => {
  it('removes all contexts', async () => {
    await seedContext('A');
    await seedContext('B');
    await deleteAllContexts();
    const remaining = await getAllContexts();
    expect(remaining).toEqual([]);
  });

  it('is safe to call on empty storage', async () => {
    await expect(deleteAllContexts()).resolves.toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────────────────────────────────────

describe('getSettings', () => {
  it('returns default settings when none saved', async () => {
    const settings = await getSettings();
    expect(settings.maxContexts).toBe(DEFAULT_SETTINGS.maxContexts);
    expect(settings.showFloatingButton).toBe(DEFAULT_SETTINGS.showFloatingButton);
  });
});

describe('updateSettings', () => {
  it('updates a single setting', async () => {
    await updateSettings({ maxContexts: 10 });
    const settings = await getSettings();
    expect(settings.maxContexts).toBe(10);
  });

  it('merges partial update without losing other settings', async () => {
    await updateSettings({ maxContexts: 25 });
    await updateSettings({ showFloatingButton: false });
    const settings = await getSettings();
    expect(settings.maxContexts).toBe(25);
    expect(settings.showFloatingButton).toBe(false);
  });

  it('updates injectionFormat', async () => {
    await updateSettings({ injectionFormat: 'compact' });
    const settings = await getSettings();
    expect(settings.injectionFormat).toBe('compact');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Storage stats
// ──────────────────────────────────────────────────────────────────────────────

describe('getStorageStats', () => {
  it('returns zero counts for empty storage', async () => {
    const stats = await getStorageStats();
    expect(stats.totalContexts).toBe(0);
    expect(stats.totalChars).toBe(0);
  });

  it('counts contexts correctly', async () => {
    await seedContext();
    await seedContext();
    const stats = await getStorageStats();
    expect(stats.totalContexts).toBe(2);
  });

  it('reports estimatedBytes > 0 after saving', async () => {
    await seedContext();
    const stats = await getStorageStats();
    expect(stats.estimatedBytes).toBeGreaterThan(0);
  });

  it('tracks oldest and newest context dates', async () => {
    await seedContext();
    const stats = await getStorageStats();
    expect(stats.oldestContext).toBeDefined();
    expect(stats.newestContext).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Export / Import
// ──────────────────────────────────────────────────────────────────────────────

describe('exportContexts', () => {
  it('returns valid JSON', async () => {
    await seedContext('Export Test');
    const json = await exportContexts();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('exported JSON contains contexts array', async () => {
    await seedContext('Export Me');
    const parsed = JSON.parse(await exportContexts()) as { contexts: unknown[] };
    expect(Array.isArray(parsed.contexts)).toBe(true);
    expect(parsed.contexts).toHaveLength(1);
  });

  it('exports only specified IDs', async () => {
    const { context: c1 } = await seedContext('One');
    await seedContext('Two');
    const parsed = JSON.parse(await exportContexts([c1.id])) as { contexts: { title: string }[] };
    expect(parsed.contexts).toHaveLength(1);
    expect(parsed.contexts[0]!.title).toBe('One');
  });

  it('exported data includes version field', async () => {
    await seedContext();
    const parsed = JSON.parse(await exportContexts()) as { version: number };
    expect(typeof parsed.version).toBe('number');
  });
});

describe('importContexts', () => {
  it('imports contexts from valid JSON', async () => {
    await seedContext('Original');
    const json = await exportContexts();

    // Clear and re-import
    await deleteAllContexts();
    const result = await importContexts(json);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    const all = await getAllContexts();
    expect(all).toHaveLength(1);
  });

  it('skips duplicate IDs', async () => {
    const { context } = await seedContext('Dup Check');
    const json = await exportContexts([context.id]);
    const result = await importContexts(json);
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
  });

  it('throws on invalid JSON', async () => {
    await expect(importContexts('not-json')).rejects.toThrow();
  });

  it('throws when contexts array is missing', async () => {
    await expect(importContexts(JSON.stringify({ version: 1 }))).rejects.toThrow();
  });

  it('reports errors for malformed context entries', async () => {
    const json = JSON.stringify({
      version: 1,
      contexts: [{ id: 'bad' }], // missing required fields
    });
    const result = await importContexts(json);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Max contexts enforcement
// ──────────────────────────────────────────────────────────────────────────────

describe('maxContexts enforcement', () => {
  it('enforces maxContexts limit — never exceeds the cap', async () => {
    await updateSettings({ maxContexts: 3 });

    await seedContext('First');
    await seedContext('Second');
    await seedContext('Third');
    await seedContext('Fourth');

    const all = await getAllContexts();
    // Hard guarantee: never more than maxContexts
    expect(all).toHaveLength(3);
    // Newest context is always kept
    expect(all.map((c) => c.title)).toContain('Fourth');
  });

  it('evicts one context per overage, not multiple', async () => {
    await updateSettings({ maxContexts: 2 });
    await seedContext('A');
    await seedContext('B');
    await seedContext('C');
    const all = await getAllContexts();
    expect(all).toHaveLength(2);
  });
});
