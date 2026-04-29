import type { ExtractionResult, PlatformSelectors } from '../../shared/types.js';
import { BasePlatform } from './base.js';
import { registerPlatform } from './registry.js';

/**
 * Perplexity AI (perplexity.ai) extractor.
 * Real DOM (2025): No ThreadMessage/UserMessage classes.
 * - User queries: h1[class*="group/query"] containing a bubble span
 * - AI answers: [id^="markdown-content-"] with [data-renderer="lm"] inside
 * - Input: #ask-input (contenteditable Lexical editor)
 */
export class PerplexityPlatform extends BasePlatform {
  readonly id = 'perplexity' as const;
  readonly name = 'Perplexity';

  readonly selectors: PlatformSelectors = {
    messageContainers: [
      // User queries and AI answers are siblings in the main content
      'h1[class*="whitespace-pre-line"]',
      '[id^="markdown-content-"]',
    ],
    userMessages: [
      // The user query bubble: h1 with Tailwind group/query class (note: / is valid in attribute value)
      'h1[class*="whitespace-pre-line"]',
      'h1[class*="group"]',
    ],
    assistantMessages: [
      '[id^="markdown-content-"]',
      '[data-renderer="lm"]',
    ],
    textInput: [
      // Real: Lexical editor
      '#ask-input',
      '[data-lexical-editor="true"]',
      '[contenteditable="true"][data-ask-input-container]',
      'div[contenteditable="true"]',
    ],
    streamingIndicator: [
      '[class*="loading"]',
      '[aria-label*="loading"]',
      '[class*="thinking"]',
      '[class*="generating"]',
    ],
    modelSelector: [
      'button[aria-label="Model"]',
      '[class*="ModelPill"]',
      'button[class*="model"]',
    ],
  };

  extractMessages(): ExtractionResult {
    const result: ExtractionResult = { messages: [], hasImages: false, hasFiles: false };

    // Strategy: find user queries and AI answers in document order
    const userEls = this.findUserQueryElements();
    const assistantEls = this.findAssistantElements();

    if (userEls.length > 0 || assistantEls.length > 0) {
      const all: Array<{ el: Element; role: 'user' | 'assistant' }> = [
        ...userEls.map((el) => ({ el, role: 'user' as const })),
        ...assistantEls.map((el) => ({ el, role: 'assistant' as const })),
      ].sort((a, b) => {
        const pos = a.el.compareDocumentPosition(b.el);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });

      for (const { el, role } of all) {
        const content =
          role === 'user' ? this.extractUserText(el) : this.extractAssistantText(el);
        if (!content) continue;
        if (role === 'assistant' && this.hasImages(el)) result.hasImages = true;
        result.messages.push({ role, content });
      }
    }

    const model = this.detectModel();
    if (model) result.model = model;

    if (result.messages.length === 0) {
      result.error = 'No messages found on this Perplexity page.';
    }

    return result;
  }

  private findUserQueryElements(): Element[] {
    // User queries are wrapped in h1 elements with Tailwind group/query classes
    // Use attribute selector to match class containing group/query
    const byGroupQuery = Array.from(
      document.querySelectorAll('h1[class*="group\\/query"], h1[class*="whitespace-pre-line"]')
    );
    if (byGroupQuery.length > 0) return byGroupQuery;
    // Fallback: any h1 containing a .min-w-0 span (the query bubble)
    return Array.from(document.querySelectorAll('h1')).filter(
      (h1) => h1.querySelector('span.min-w-0') !== null
    );
  }

  private findAssistantElements(): Element[] {
    // AI answers have id^="markdown-content-"
    const byId = Array.from(document.querySelectorAll('[id^="markdown-content-"]'));
    if (byId.length > 0) return byId;
    // Fallback: divs with data-renderer="lm"
    return Array.from(document.querySelectorAll('[data-renderer="lm"]'));
  }

  private extractUserText(el: Element): string {
    // The text is in the innermost span of the query bubble
    const span = el.querySelector('span.min-w-0, span[class*="font-sans"]');
    if (span) return (span.textContent ?? '').replace(/\u200b/g, '').trim();
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('button, svg, [role="button"]').forEach((n) => n.remove());
    return (clone.textContent ?? '').replace(/\u200b/g, '').trim();
  }

  private extractAssistantText(el: Element, removeSourceBlocks = true): string {
    const clone = el.cloneNode(true) as Element;

    clone
      .querySelectorAll('button, svg, [class*="action"], [class*="copy"], [role="button"]')
      .forEach((n) => n.remove());

    if (removeSourceBlocks) {
      clone
        .querySelectorAll('[class*="source"], [class*="citation"], [class*="reference"], cite, .citation, span.citation')
        .forEach((n) => n.remove());
    }

    const codeBlocks = Array.from(clone.querySelectorAll('pre code, pre'));
    for (const block of codeBlocks) {
      const code = block.querySelector('code');
      if (code) {
        const lang = code.className.match(/language-(\w+)/)?.[1] ?? '';
        const codeText = code.textContent?.trim() ?? '';
        block.textContent = `\`\`\`${lang}\n${codeText}\n\`\`\``;
      }
    }

    return (clone.textContent ?? '').replace(/\u200b/g, '').trim();
  }

  private hasImages(el: Element): boolean {
    return el.querySelectorAll('img:not([class*="icon"]):not([class*="logo"])').length > 0;
  }

  getInputElement(): HTMLElement | null {
    // #ask-input is in the follow-up bar; check for it first
    const askInput = document.getElementById('ask-input');
    if (askInput) return askInput as HTMLElement;
    return this.queryFirst(this.selectors.textInput) as HTMLElement | null;
  }

  isStreamingActive(): boolean {
    return this.isAnyVisible(this.selectors.streamingIndicator);
  }

  detectModel(): string | undefined {
    // The model button just shows "Model" generically; no specific model name in DOM
    const el = this.queryFirst(this.selectors.modelSelector);
    const text = el?.textContent?.trim();
    // Skip the generic "Model" label
    if (text && text.toLowerCase() !== 'model') return text;
    return undefined;
  }
}

registerPlatform('perplexity', PerplexityPlatform);
