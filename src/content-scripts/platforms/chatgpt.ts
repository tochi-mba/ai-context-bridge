import type { ExtractionResult, PlatformSelectors } from '../../shared/types.js';
import { BasePlatform } from './base.js';
import { registerPlatform } from './registry.js';

/**
 * ChatGPT extractor.
 * Real DOM (2025/2026): uses <section data-turn="user|assistant"> containing
 * <div data-message-author-role="user|assistant">.
 * Input is a contenteditable ProseMirror div with id="prompt-textarea".
 */
export class ChatGPTPlatform extends BasePlatform {
  readonly id = 'chatgpt' as const;
  readonly name = 'ChatGPT';

  readonly selectors: PlatformSelectors = {
    messageContainers: [
      'section[data-turn="user"], section[data-turn="assistant"]',
      '[data-testid^="conversation-turn-"]',
      'article[data-testid]',
    ],
    userMessages: [
      '[data-message-author-role="user"]',
      'section[data-turn="user"]',
    ],
    assistantMessages: [
      '[data-message-author-role="assistant"]',
      'section[data-turn="assistant"]',
    ],
    textInput: [
      // Real: contenteditable ProseMirror div
      '#prompt-textarea',
      '[contenteditable="true"].ProseMirror',
      'textarea[name="prompt-textarea"]',
      'textarea[placeholder*="Ask"]',
    ],
    streamingIndicator: [
      '[data-testid="stop-button"]',
      'button[aria-label="Stop generating"]',
      'button[aria-label="Stop"]',
      '.result-streaming',
    ],
    modelSelector: [
      // Model slug is on assistant message elements
      '[data-message-model-slug]',
      // Fallback: the header model switcher button (shows brand name "ChatGPT")
      '[data-testid="model-switcher-dropdown-button"] span',
      'button[aria-label="Model selector"] span',
    ],
  };

  extractMessages(): ExtractionResult {
    const result: ExtractionResult = { messages: [], hasImages: false, hasFiles: false };

    // Primary: section elements with data-turn attribute (most reliable in 2025)
    const sections = Array.from(
      document.querySelectorAll('section[data-turn="user"], section[data-turn="assistant"]')
    );

    if (sections.length > 0) {
      for (const section of sections) {
        const role = section.getAttribute('data-turn') as 'user' | 'assistant';
        const content = this.extractTextFromSection(section, role);
        if (!content) continue;
        if (this.hasImages(section)) result.hasImages = true;
        if (this.hasFiles(section)) result.hasFiles = true;
        result.messages.push({ role, content });
      }
    } else {
      // Fallback: conversation-turn data-testid
      this.extractByTurnTestId(result);
    }

    const model = this.detectModel();
    if (model) result.model = model;

    if (result.messages.length === 0) {
      result.error = 'No messages found. The conversation may be empty or the page has not fully loaded.';
    }

    return result;
  }

  private extractTextFromSection(section: Element, role: 'user' | 'assistant'): string {
    const clone = section.cloneNode(true) as Element;

    // Remove interactive chrome
    clone.querySelectorAll(
      'button, svg, [role="button"], [data-testid*="copy"], [data-testid*="action"], h4.sr-only'
    ).forEach((n) => n.remove());

    // For user messages, prefer .whitespace-pre-wrap text (the bubble)
    if (role === 'user') {
      const bubble = clone.querySelector('.whitespace-pre-wrap');
      if (bubble) return (bubble.textContent ?? '').replace(/\u200b/g, '').trim();
    }

    // For assistant messages, prefer the markdown/prose container
    if (role === 'assistant') {
      const md = clone.querySelector('.markdown, .prose');
      if (md) return this.extractMarkdownText(md);
    }

    return (clone.textContent ?? '').replace(/\u200b/g, '').trim();
  }

  private extractMarkdownText(el: Element): string {
    const clone = el.cloneNode(true) as Element;
    // Preserve code blocks
    const codeBlocks = Array.from(clone.querySelectorAll('pre code'));
    for (const block of codeBlocks) {
      const pre = block.closest('pre');
      if (pre) {
        const lang = block.className.match(/language-(\w+)/)?.[1] ?? '';
        const code = block.textContent?.trim() ?? '';
        pre.textContent = `\`\`\`${lang}\n${code}\n\`\`\``;
      }
    }
    return (clone.textContent ?? '').replace(/\u200b/g, '').trim();
  }

  private extractByTurnTestId(result: ExtractionResult): void {
    const turns = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"]'));
    for (const turn of turns) {
      const roleEl = turn.querySelector('[data-message-author-role]');
      if (!roleEl) continue;
      const rawRole = roleEl.getAttribute('data-message-author-role');
      if (rawRole !== 'user' && rawRole !== 'assistant') continue;
      const content = this.extractTextFromSection(turn, rawRole);
      if (content) {
        if (this.hasImages(turn)) result.hasImages = true;
        result.messages.push({ role: rawRole, content });
      }
    }
  }

  private hasImages(el: Element): boolean {
    return el.querySelectorAll('img:not([aria-hidden]):not([class*="avatar"])').length > 0;
  }

  private hasFiles(el: Element): boolean {
    return el.querySelectorAll('[data-testid*="file"], [class*="attachment"]').length > 0;
  }

  getInputElement(): HTMLElement | null {
    return this.queryFirst(this.selectors.textInput) as HTMLElement | null;
  }

  isStreamingActive(): boolean {
    return this.isAnyVisible(this.selectors.streamingIndicator);
  }

  detectModel(): string | undefined {
    // Best source: model slug on the last assistant message
    const slugEl = document.querySelector('[data-message-model-slug]');
    if (slugEl) {
      const slug = slugEl.getAttribute('data-message-model-slug');
      if (slug) return slug;
    }
    // Fallback: header model switcher button text
    const btn = this.queryFirst([
      '[data-testid="model-switcher-dropdown-button"] span',
      'button[aria-label="Model selector"] span',
    ]);
    const text = btn?.textContent?.trim();
    return text?.replace(/[\u25bc\u25be▼▾⌄]/g, '').trim() || undefined;
  }
}

registerPlatform('chatgpt', ChatGPTPlatform);
