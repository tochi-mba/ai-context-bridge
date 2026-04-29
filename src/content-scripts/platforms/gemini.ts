import type { ExtractionResult, PlatformSelectors } from '../../shared/types.js';
import { BasePlatform } from './base.js';
import { registerPlatform } from './registry.js';

/**
 * Google Gemini (gemini.google.com) extractor.
 * Real DOM (2025): Angular app using custom elements <user-query> and <model-response>.
 * Input is a Quill .ql-editor contenteditable div.
 * Model name is in [data-test-id="logo-pill-label-container"].
 */
export class GeminiPlatform extends BasePlatform {
  readonly id = 'gemini' as const;
  readonly name = 'Gemini';

  readonly selectors: PlatformSelectors = {
    messageContainers: [
      'user-query',
      'model-response',
      '[class*="conversation-container"] > *',
    ],
    userMessages: [
      'user-query',
      '[class*="user-query"]',
    ],
    assistantMessages: [
      'model-response',
      '[class*="model-response"]',
    ],
    textInput: [
      '.ql-editor[contenteditable="true"]',
      'rich-textarea .ql-editor',
      '[contenteditable="true"][data-placeholder]',
      'div[contenteditable="true"]',
    ],
    streamingIndicator: [
      // Gemini displays this aria-label on the spinner while generating
      '[aria-label="Gemini is thinking"]',
      // A stop/pause button shown only during active generation
      'button[aria-label="Stop generating"]',
      'button[aria-label="Stop"]',
      // Progress bar specifically inside the response area (not sidebar spinners)
      'model-response mat-progress-bar',
    ],
    modelSelector: [
      // Real: data-test-id (note: dash, not camelCase)
      '[data-test-id="logo-pill-label-container"]',
      '.logo-pill-label-container',
      '[class*="model-name"]',
    ],
  };

  extractMessages(): ExtractionResult {
    const result: ExtractionResult = { messages: [], hasImages: false, hasFiles: false };

    const userEls = Array.from(document.querySelectorAll('user-query'));
    const modelEls = Array.from(document.querySelectorAll('model-response'));

    if (userEls.length > 0 || modelEls.length > 0) {
      const all: Array<{ el: Element; role: 'user' | 'assistant' }> = [
        ...userEls.map((el) => ({ el, role: 'user' as const })),
        ...modelEls.map((el) => ({ el, role: 'assistant' as const })),
      ].sort((a, b) => {
        const pos = a.el.compareDocumentPosition(b.el);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });

      for (const { el, role } of all) {
        const content = this.extractGeminiText(el, role);
        if (!content) continue;
        if (this.hasImages(el)) result.hasImages = true;
        result.messages.push({ role, content });
      }
    } else {
      this.extractFallback(result);
    }

    const model = this.detectModel();
    if (model) result.model = model;

    if (result.messages.length === 0) {
      result.error = 'No messages found on this Gemini conversation.';
    }

    return result;
  }

  private extractGeminiText(el: Element, role: 'user' | 'assistant'): string {
    const clone = el.cloneNode(true) as Element;

    // Remove screen reader labels (e.g. "Vous avez dit", "Gemini a dit")
    clone
      .querySelectorAll(
        'button, mat-icon, [class*="actions"], [class*="feedback"], svg, ' +
        '.cdk-visually-hidden, [class*="screen-reader"], [class*="visually-hidden"]'
      )
      .forEach((n) => n.remove());

    // For assistant: prefer the markdown panel content
    if (role === 'assistant') {
      const md = clone.querySelector('.markdown.markdown-main-panel, .markdown-main-panel, message-content .markdown');
      if (md) return this.extractMarkdownContent(md);
    }

    // For user: prefer query-text content
    if (role === 'user') {
      const queryText = clone.querySelector('.query-text, .query-text-line, p.query-text-line');
      if (queryText) return (queryText.textContent ?? '').replace(/\u200b/g, '').trim();
    }

    // Preserve code blocks in fallback path
    const codeEls = Array.from(clone.querySelectorAll('code-block, pre code, pre'));
    for (const codeEl of codeEls) {
      const code = codeEl.querySelector('code') ?? codeEl;
      const lang = code.className.match(/language-(\w+)/)?.[1] ?? '';
      const codeText = code.textContent?.trim() ?? '';
      if (codeText) {
        codeEl.textContent = `\`\`\`${lang}\n${codeText}\n\`\`\``;
      }
    }

    return (clone.textContent ?? '').replace(/\u200b/g, '').trim();
  }

  private extractMarkdownContent(el: Element): string {
    const clone = el.cloneNode(true) as Element;
    const codeEls = Array.from(clone.querySelectorAll('pre code, pre'));
    for (const codeEl of codeEls) {
      const code = codeEl.querySelector('code') ?? codeEl;
      const lang = code.className.match(/language-(\w+)/)?.[1] ?? '';
      const codeText = code.textContent?.trim() ?? '';
      if (codeText) {
        codeEl.textContent = `\`\`\`${lang}\n${codeText}\n\`\`\``;
      }
    }
    return (clone.textContent ?? '').replace(/\u200b/g, '').trim();
  }

  private extractFallback(result: ExtractionResult): void {
    const containers = this.queryAll(this.selectors.messageContainers);
    for (const el of containers) {
      const tag = el.tagName.toLowerCase();
      const role: 'user' | 'assistant' =
        tag === 'user-query' || el.className.includes('user') ? 'user' : 'assistant';
      const content = this.extractGeminiText(el, role);
      if (content) result.messages.push({ role, content });
    }
  }

  private hasImages(el: Element): boolean {
    return el.querySelectorAll('img:not([class*="icon"])').length > 0;
  }

  getInputElement(): HTMLElement | null {
    return this.queryFirst(this.selectors.textInput) as HTMLElement | null;
  }

  isStreamingActive(): boolean {
    return this.isAnyVisible(this.selectors.streamingIndicator);
  }

  detectModel(): string | undefined {
    const el = this.queryFirst(this.selectors.modelSelector);
    const text = el?.textContent?.trim();
    if (text) return text;
    // Fallback: page title
    const title = document.title;
    if (title.includes('Gemini')) {
      return title.replace(/\s*-\s*Google.*$/, '').trim() || undefined;
    }
    return undefined;
  }
}

registerPlatform('gemini', GeminiPlatform);
