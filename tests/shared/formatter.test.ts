import { describe, it, expect } from 'vitest';
import {
  formatContextForInjection,
  truncateFormattedContext,
  estimateTokens,
} from '../../src/shared/formatter.js';
import type { ChatContext } from '../../src/shared/types.js';

function makeContext(overrides: Partial<ChatContext> = {}): ChatContext {
  return {
    id: 'test-id',
    title: 'Test Conversation',
    sourcePlatform: 'chatgpt',
    createdAt: '2026-04-13T10:00:00Z',
    updatedAt: '2026-04-13T10:00:00Z',
    messageCount: 2,
    charCount: 100,
    preview: 'Hello, can you help?',
    compressed: false,
    messages: [
      { role: 'user', content: 'Hello, can you help me with TypeScript?' },
      { role: 'assistant', content: 'Of course! What do you need help with?' },
    ],
    metadata: {
      hasImages: false,
      hasFiles: false,
      schemaVersion: 1,
    },
    ...overrides,
  };
}

describe('formatter', () => {
  describe('formatContextForInjection — verbose', () => {
    it('includes the platform name in the header', () => {
      const output = formatContextForInjection(makeContext(), 'verbose');
      expect(output).toContain('ChatGPT');
    });

    it('includes message count in metadata line', () => {
      const output = formatContextForInjection(makeContext(), 'verbose');
      expect(output).toContain('Messages: 2');
    });

    it('includes the model name when present', () => {
      const ctx = makeContext({ metadata: { hasImages: false, hasFiles: false, schemaVersion: 1, model: 'gpt-4o' } });
      const output = formatContextForInjection(ctx, 'verbose');
      expect(output).toContain('Model: gpt-4o');
    });

    it('formats user messages with "Human:" prefix', () => {
      const output = formatContextForInjection(makeContext(), 'verbose');
      expect(output).toContain('Human: Hello, can you help me with TypeScript?');
    });

    it('formats assistant messages with "Assistant:" prefix', () => {
      const output = formatContextForInjection(makeContext(), 'verbose');
      expect(output).toContain('Assistant: Of course! What do you need help with?');
    });

    it('includes section markers', () => {
      const output = formatContextForInjection(makeContext(), 'verbose');
      expect(output).toContain('--- BEGIN CONTEXT ---');
      expect(output).toContain('--- END CONTEXT ---');
    });

    it('includes closing instruction', () => {
      const output = formatContextForInjection(makeContext(), 'verbose');
      expect(output).toContain('continue');
    });

    it('warns about images when present', () => {
      const ctx = makeContext({
        metadata: { hasImages: true, hasFiles: false, schemaVersion: 1 },
      });
      const output = formatContextForInjection(ctx, 'verbose');
      expect(output).toContain('images');
    });

    it('warns about files when present', () => {
      const ctx = makeContext({
        metadata: { hasImages: false, hasFiles: true, schemaVersion: 1 },
      });
      const output = formatContextForInjection(ctx, 'verbose');
      expect(output).toContain('file');
    });

    it('does not warn when no images or files', () => {
      const output = formatContextForInjection(makeContext(), 'verbose');
      expect(output).not.toContain('⚠️');
    });

    it('includes the saved date', () => {
      const output = formatContextForInjection(makeContext(), 'verbose');
      // Apr 13, 2026
      expect(output).toMatch(/Apr|April/);
    });

    it('formats all platforms correctly', () => {
      const platforms = ['chatgpt', 'claude', 'gemini', 'perplexity', 'grok'] as const;
      const names = ['ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'Grok'];
      for (let i = 0; i < platforms.length; i++) {
        const ctx = makeContext({ sourcePlatform: platforms[i] });
        const output = formatContextForInjection(ctx, 'verbose');
        expect(output).toContain(names[i]);
      }
    });

    it('formats system messages with "System:" prefix', () => {
      const ctx = makeContext({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' },
        ],
      });
      const output = formatContextForInjection(ctx, 'verbose');
      expect(output).toContain('System: You are a helpful assistant.');
    });
  });

  describe('formatContextForInjection — compact', () => {
    it('uses "Me:" prefix for user messages', () => {
      const output = formatContextForInjection(makeContext(), 'compact');
      expect(output).toContain('Me: Hello, can you help me with TypeScript?');
    });

    it('uses "AI:" prefix for assistant messages', () => {
      const output = formatContextForInjection(makeContext(), 'compact');
      expect(output).toContain('AI: Of course! What do you need help with?');
    });

    it('is shorter than verbose format', () => {
      const ctx = makeContext();
      const verbose = formatContextForInjection(ctx, 'verbose');
      const compact = formatContextForInjection(ctx, 'compact');
      expect(compact.length).toBeLessThan(verbose.length);
    });

    it('includes closing marker', () => {
      const output = formatContextForInjection(makeContext(), 'compact');
      expect(output).toContain('[End of context');
    });
  });

  describe('truncateFormattedContext', () => {
    it('returns text unchanged when under the limit', () => {
      const text = 'Short text';
      expect(truncateFormattedContext(text, 1000)).toBe(text);
    });

    it('truncates text to within the limit', () => {
      const text = 'X'.repeat(5000);
      const result = truncateFormattedContext(text, 1000);
      expect(result.length).toBeLessThanOrEqual(1000 + 200); // suffix can add some chars
    });

    it('includes truncation notice in result', () => {
      const text = 'A'.repeat(5000);
      const result = truncateFormattedContext(text, 500);
      expect(result).toContain('truncated');
    });

    it('preserves the closing instruction after truncation', () => {
      const text = 'B'.repeat(10000);
      const result = truncateFormattedContext(text, 1000);
      expect(result).toContain('continue');
    });
  });

  describe('estimateTokens', () => {
    it('returns a positive number for non-empty text', () => {
      expect(estimateTokens('Hello world')).toBeGreaterThan(0);
    });

    it('returns 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('estimates ~1 token per 4 chars', () => {
      // 400 chars → ~100 tokens
      const text = 'A'.repeat(400);
      expect(estimateTokens(text)).toBe(100);
    });

    it('scales linearly', () => {
      const t1 = estimateTokens('A'.repeat(100));
      const t2 = estimateTokens('A'.repeat(200));
      expect(t2).toBe(t1 * 2);
    });
  });
});
