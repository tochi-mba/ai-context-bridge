import { describe, it, expect } from 'vitest';
import {
  compressMessages,
  decompressMessages,
  compressString,
  decompressString,
  estimateCompressionRatio,
} from '../../src/shared/compression.js';
import type { ChatMessage } from '../../src/shared/types.js';

const sampleMessages: ChatMessage[] = [
  { role: 'user', content: 'Hello, can you help me write a React component?' },
  {
    role: 'assistant',
    content:
      'Sure! Here is a basic React functional component:\n\n```tsx\nconst MyComponent = () => {\n  return <div>Hello World</div>;\n};\n```\n\nWhat would you like it to do?',
  },
  { role: 'user', content: 'Make it display a list of items passed as props.' },
  {
    role: 'assistant',
    content:
      '```tsx\ninterface Props { items: string[]; }\nconst MyComponent = ({ items }: Props) => (\n  <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>\n);\n```',
  },
];

describe('compression', () => {
  describe('compressMessages / decompressMessages', () => {
    it('round-trips messages correctly', () => {
      const compressed = compressMessages(sampleMessages);
      const restored = decompressMessages(compressed);
      expect(restored).toEqual(sampleMessages);
    });

    it('returns a non-empty string for non-empty messages', () => {
      const compressed = compressMessages(sampleMessages);
      expect(typeof compressed).toBe('string');
      expect(compressed.length).toBeGreaterThan(0);
    });

    it('round-trips an empty message array', () => {
      const compressed = compressMessages([]);
      const restored = decompressMessages(compressed);
      expect(restored).toEqual([]);
    });

    it('round-trips messages with special characters', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: '你好！ مرحبا 🎉 <script>alert("xss")</script>' },
        { role: 'assistant', content: 'こんにちは\nΩ≈ç√∫˜µ≤≥÷' },
      ];
      const restored = decompressMessages(compressMessages(messages));
      expect(restored).toEqual(messages);
    });

    it('round-trips a very long message (>10k chars)', () => {
      const longContent = 'A'.repeat(12000);
      const messages: ChatMessage[] = [{ role: 'user', content: longContent }];
      const restored = decompressMessages(compressMessages(messages));
      expect(restored[0]!.content).toHaveLength(12000);
    });

    it('throws on corrupted data', () => {
      expect(() => decompressMessages('not-valid-lz-data')).toThrow();
    });

    it('preserves message roles', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      const restored = decompressMessages(compressMessages(messages));
      expect(restored.map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
    });

    it('preserves optional timestamps', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello', timestamp: '2026-01-01T00:00:00Z' },
      ];
      const restored = decompressMessages(compressMessages(messages));
      expect(restored[0]!.timestamp).toBe('2026-01-01T00:00:00Z');
    });
  });

  describe('compressString / decompressString', () => {
    it('round-trips an arbitrary string', () => {
      const original = 'Hello world! This is a test string with emoji 🚀';
      expect(decompressString(compressString(original))).toBe(original);
    });

    it('round-trips an empty string', () => {
      expect(decompressString(compressString(''))).toBe('');
    });

    it('throws on null decompression result (invalid data)', () => {
      // Pass a string that decompresses to null
      expect(() => decompressString('')).toThrow();
    });
  });

  describe('estimateCompressionRatio', () => {
    it('returns a number between 0 and 1 for compressible content', () => {
      const ratio = estimateCompressionRatio('A'.repeat(1000));
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThanOrEqual(1);
    });

    it('highly repetitive content compresses better than random content', () => {
      const repetitiveRatio = estimateCompressionRatio('ABABABABABABABABAB'.repeat(100));
      const uniqueRatio = estimateCompressionRatio(
        Array.from({ length: 300 }, (_, i) => String.fromCharCode(65 + (i % 26))).join('')
      );
      // Repetitive content should have a lower ratio (better compression)
      expect(repetitiveRatio).toBeLessThan(uniqueRatio);
    });
  });
});
