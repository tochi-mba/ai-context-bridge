import type { ExtractionResult, PlatformSelectors } from '../../shared/types.js';
import { BasePlatform } from './base.js';
import { registerPlatform } from './registry.js';

/**
 * Claude (claude.ai) extractor.
 *
 * Real DOM (2025/2026) — confirmed from live fixture:
 *   User messages  → [data-testid="user-message"]
 *   AI responses   → [data-is-streaming] (value is "true" while streaming, "false" when done)
 *   Text input     → div[contenteditable="true"][data-testid="chat-input"]  (TipTap ProseMirror)
 *   Model selector → [data-testid="model-selector-dropdown"]
 */
export class ClaudePlatform extends BasePlatform {
  readonly id = 'claude' as const;
  readonly name = 'Claude';

  readonly selectors: PlatformSelectors = {
    messageContainers: [
      '[data-testid="user-message"]',
      '[data-is-streaming]',
    ],
    userMessages: [
      '[data-testid="user-message"]',
    ],
    assistantMessages: [
      '[data-is-streaming]',
    ],
    textInput: [
      '[data-testid="chat-input"]',
      '.tiptap.ProseMirror[contenteditable="true"]',
      '.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"]',
    ],
    streamingIndicator: [
      '[data-is-streaming="true"]',
      'button[aria-label="Stop"]',
      '[data-testid="stop-button"]',
    ],
    modelSelector: [
      '[data-testid="model-selector-dropdown"] .whitespace-nowrap',
      '[data-testid="model-selector-dropdown"]',
      'button[class*="model"] span',
    ],
  };

  extractMessages(): ExtractionResult {
    const result: ExtractionResult = { messages: [], hasImages: false, hasFiles: false };

    const userEls = Array.from(document.querySelectorAll('[data-testid="user-message"]'));
    const aiEls = Array.from(document.querySelectorAll('[data-is-streaming]'));

    if (userEls.length === 0 && aiEls.length === 0) {
      result.error = 'No messages found. The page may be a new chat or not fully loaded.';
      return result;
    }

    // Merge and sort by DOM order
    const all: Array<{ el: Element; role: 'user' | 'assistant' }> = [
      ...userEls.map((el) => ({ el, role: 'user' as const })),
      ...aiEls.map((el) => ({ el, role: 'assistant' as const })),
    ].sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    for (const { el, role } of all) {
      const content = role === 'user'
        ? this.extractUserText(el)
        : this.extractAssistantText(el);
      if (!content) continue;
      if (el.querySelectorAll('img:not([class*="avatar"]):not([class*="icon"])').length > 0) {
        result.hasImages = true;
      }
      if (el.querySelectorAll('[class*="file"], [class*="attachment"], [class*="upload"]').length > 0) {
        result.hasFiles = true;
      }
      result.messages.push({ role, content });
    }

    const model = this.detectModel();
    if (model) result.model = model;

    if (result.messages.length === 0) {
      result.error = 'No messages found. The page may be a new chat or not fully loaded.';
    }

    return result;
  }

  /** Extract text from a user message element ([data-testid="user-message"]). */
  private extractUserText(el: Element): string {
    const clone = el.cloneNode(true) as Element;
    // Remove buttons (edit, copy etc.) that share the same container
    clone.querySelectorAll('button, [role="button"], svg').forEach((n) => n.remove());
    return (clone.textContent ?? '').replace(/\u200b/g, '').trim();
  }

  /**
   * Extract text from an assistant response element ([data-is-streaming]).
   * The actual prose lives inside .standard-markdown; we prefer that to avoid
   * including the "Thought for Xs" thinking summary.
   */
  private extractAssistantText(el: Element): string {
    const clone = el.cloneNode(true) as Element;

    // Remove action buttons and SVGs
    clone.querySelectorAll('button, [role="button"], svg, [data-testid*="action"]').forEach((n) => n.remove());

    // Remove the "Thought for Xs" collapsible thinking block
    clone.querySelectorAll('.sr-only, [role="status"]').forEach((n) => n.remove());

    // Prefer the .standard-markdown prose section if it exists
    const markdown = clone.querySelector('.standard-markdown');
    const source = markdown ?? clone;

    // Format code blocks
    source.querySelectorAll('pre').forEach((pre) => {
      const code = pre.querySelector('code');
      if (code) {
        const lang = code.className.match(/language-(\w+)/)?.[1] ?? '';
        const text = code.textContent?.trim() ?? '';
        pre.textContent = `\`\`\`${lang}\n${text}\n\`\`\``;
      }
    });

    return (source.textContent ?? '').replace(/\u200b/g, '').trim();
  }

  getInputElement(): HTMLElement | null {
    return this.queryFirst(this.selectors.textInput) as HTMLElement | null;
  }

  isStreamingActive(): boolean {
    // Check for any element with data-is-streaming="true"
    return document.querySelector('[data-is-streaming="true"]') !== null
      || this.isAnyVisible(['button[aria-label="Stop"]', '[data-testid="stop-button"]']);
  }

  detectModel(): string | undefined {
    const el = this.queryFirst(this.selectors.modelSelector);
    const text = el?.textContent?.trim();
    return text || undefined;
  }
}

registerPlatform('claude', ClaudePlatform);
