import type { ExtractionResult, PlatformSelectors } from '../../shared/types.js';
import { BasePlatform } from './base.js';
import { registerPlatform } from './registry.js';

/**
 * Grok (grok.com) extractor.
 * Real DOM (2025): Next.js app. No data-testid on message elements.
 * - Messages are in div[id^="response-"] containers
 * - User messages: items-end aligned (right side)
 * - Assistant messages: items-start aligned (left side)
 * - Text content: .response-content-markdown inside .message-bubble
 * - Input: div.tiptap.ProseMirror inside .query-bar
 * - Model: #model-select-trigger span.truncate
 */
export class GrokPlatform extends BasePlatform {
  readonly id = 'grok' as const;
  readonly name = 'Grok';

  readonly selectors: PlatformSelectors = {
    messageContainers: [
      // Each turn: div with id starting with "response-"
      '[id^="response-"]',
      '.message-bubble',
    ],
    userMessages: [
      // User messages are right-aligned (items-end)
      '[id^="response-"][class*="items-end"]',
    ],
    assistantMessages: [
      // Assistant messages are left-aligned (items-start)
      '[id^="response-"][class*="items-start"]',
    ],
    textInput: [
      // Real: TipTap editor inside query-bar
      '.query-bar [contenteditable="true"]',
      '.tiptap.ProseMirror[contenteditable="true"]',
      '[contenteditable="true"].tiptap',
      '[contenteditable="true"]',
    ],
    streamingIndicator: [
      '[data-testid="loading-indicator"]',
      '[class*="loading"]',
      '[aria-label="Grok is thinking"]',
      '[class*="thinking-indicator"]',
    ],
    modelSelector: [
      // Real: model select trigger button
      '#model-select-trigger span.truncate',
      '#model-select-trigger',
      '[data-query-bar-mode-select] button span.truncate',
    ],
  };

  extractMessages(): ExtractionResult {
    const result: ExtractionResult = { messages: [], hasImages: false, hasFiles: false };

    // Primary strategy: find all response containers with id^="response-"
    // and distinguish user (items-end) from assistant (items-start)
    const allResponses = Array.from(document.querySelectorAll('[id^="response-"]'));
    const messageDivs = allResponses.filter(
      (el) =>
        el.classList.contains('items-end') ||
        el.classList.contains('items-start') ||
        el.className.includes('items-end') ||
        el.className.includes('items-start')
    );

    if (messageDivs.length > 0) {
      for (const el of messageDivs) {
        const isUser =
          el.classList.contains('items-end') || el.className.includes('items-end');
        const role: 'user' | 'assistant' = isUser ? 'user' : 'assistant';
        const content = this.extractGrokText(el);
        if (!content) continue;
        if (this.hasImages(el)) result.hasImages = true;
        result.messages.push({ role, content });
      }
    } else {
      // Fallback: scan message-bubble elements
      this.extractByBubbleScan(result);
    }

    const model = this.detectModel();
    if (model) result.model = model;

    if (result.messages.length === 0) {
      result.error = 'No messages found. Make sure you are on an active Grok conversation.';
    }

    return result;
  }

  private extractGrokText(el: Element): string {
    // Target the .response-content-markdown content inside the bubble
    const contentDiv = el.querySelector('.response-content-markdown');
    const target = contentDiv ?? el;
    const clone = target.cloneNode(true) as Element;

    // Remove action buttons and icons
    clone
      .querySelectorAll(
        'button, svg, [aria-label="Regenerate"], [aria-label="Copy"], ' +
        '[class*="action-buttons"], [class*="action"]'
      )
      .forEach((n) => n.remove());

    // Preserve code blocks
    const codeBlocks = Array.from(clone.querySelectorAll('pre code, pre'));
    for (const block of codeBlocks) {
      const code = block.querySelector('code') ?? block;
      const lang = code.className.match(/language-(\w+)/)?.[1] ?? '';
      const codeText = code.textContent?.trim() ?? '';
      if (codeText) {
        block.textContent = `\`\`\`${lang}\n${codeText}\n\`\`\``;
      }
    }

    return (clone.textContent ?? '').replace(/\u200b/g, '').trim();
  }

  private extractByBubbleScan(result: ExtractionResult): void {
    const bubbles = Array.from(document.querySelectorAll('.message-bubble'));
    for (const bubble of bubbles) {
      // Walk up to find the alignment container
      const parent = bubble.parentElement?.parentElement;
      const parentClass = parent?.className ?? '';
      const role: 'user' | 'assistant' = parentClass.includes('items-end') ? 'user' : 'assistant';
      const content = this.extractGrokText(bubble);
      if (content) result.messages.push({ role, content });
    }
  }

  private hasImages(el: Element): boolean {
    return el.querySelectorAll('img:not([class*="avatar"]):not([class*="icon"])').length > 0;
  }

  getInputElement(): HTMLElement | null {
    // Look inside .query-bar first
    const queryBar = document.querySelector('.query-bar');
    if (queryBar) {
      const editor = queryBar.querySelector('[contenteditable="true"]') as HTMLElement | null;
      if (editor) return editor;
    }
    return this.queryFirst(this.selectors.textInput) as HTMLElement | null;
  }

  isStreamingActive(): boolean {
    return this.isAnyVisible(this.selectors.streamingIndicator);
  }

  detectModel(): string | undefined {
    const el = this.queryFirst(this.selectors.modelSelector);
    const text = el?.textContent?.trim();
    return text || undefined;
  }
}

registerPlatform('grok', GrokPlatform);
