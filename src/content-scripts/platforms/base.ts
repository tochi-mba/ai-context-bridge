import type { ExtractionResult, PlatformId, PlatformSelectors } from '../../shared/types.js';

export abstract class BasePlatform {
  abstract readonly id: PlatformId;
  abstract readonly name: string;
  abstract readonly selectors: PlatformSelectors;

  // ──────────────────────────────────────────────────────────────────────────
  // Abstract methods — each platform must implement these
  // ──────────────────────────────────────────────────────────────────────────

  abstract extractMessages(): ExtractionResult;
  abstract getInputElement(): HTMLElement | null;
  abstract isStreamingActive(): boolean;
  abstract detectModel(): string | undefined;

  // ──────────────────────────────────────────────────────────────────────────
  // Shared text injection (works for React-controlled inputs)
  // ──────────────────────────────────────────────────────────────────────────

  async injectText(text: string): Promise<boolean> {
    const el = this.getInputElement();
    if (!el) return false;

    el.focus();

    // React & Vue use synthetic events. We need to trigger their internal
    // state updates by using the native value setter, then dispatching events.
    const isTextarea = el instanceof HTMLTextAreaElement;
    const isDiv = el instanceof HTMLElement && el.contentEditable === 'true';

    if (isDiv) {
      return this.injectIntoContentEditable(el, text);
    } else if (isTextarea || el instanceof HTMLInputElement) {
      return this.injectIntoInput(el as HTMLTextAreaElement | HTMLInputElement, text);
    }

    return false;
  }

  private injectIntoInput(el: HTMLTextAreaElement | HTMLInputElement, text: string): boolean {
    // Get React's internal value setter to bypass synthetic event system
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, text);
    } else {
      el.value = text;
    }

    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));

    // Move cursor to end
    const len = text.length;
    if ('setSelectionRange' in el) {
      el.setSelectionRange(len, len);
    }

    return true;
  }

  private injectIntoContentEditable(el: HTMLElement, text: string): boolean {
    // For contenteditable divs (used by Claude, Gemini, Grok)
    el.focus();

    // Use execCommand as primary approach (deprecated but widely supported)
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
    document.execCommand('insertText', false, text);

    // Fallback: direct manipulation
    if (el.textContent !== text) {
      el.textContent = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    }

    // Place cursor at end
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);

    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Shared DOM query helpers with selector fallback
  // ──────────────────────────────────────────────────────────────────────────

  protected queryFirst(selectors: string[]): Element | null {
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) return el;
      } catch {
        // Invalid selector — skip
      }
    }
    return null;
  }

  protected queryAll(selectors: string[]): Element[] {
    for (const selector of selectors) {
      try {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) return Array.from(els);
      } catch {
        // Invalid selector — skip
      }
    }
    return [];
  }

  protected getTextContent(el: Element): string {
    // Prefer textContent but clean up whitespace artifacts from DOM structure
    return (el.textContent ?? '').replace(/\u200b/g, '').trim();
  }

  /**
   * Check if any of the streaming indicators are present and visible.
   * Returns true when the AI is actively generating a response.
   */
  protected isAnyVisible(selectors: string[]): boolean {
    for (const selector of selectors) {
      try {
        // Check ALL matching elements (not just first) — the first match may be
        // a pre-existing hidden element while a dynamically added one is visible.
        const els = document.querySelectorAll(selector);
        for (const el of Array.from(els)) {
          if (this.isVisible(el)) return true;
        }
      } catch {
        // Skip invalid selector
      }
    }
    return false;
  }

  private isVisible(el: Element): boolean {
    // In production, browsers perform real layout so getBoundingClientRect returns 0
    // for display:none/hidden elements. In tests, we mock getBoundingClientRect to
    // simulate visibility via inline style. This check is sufficient for both.
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;

    // Also check inline styles and computed style as a belt-and-suspenders approach.
    // We check inline style first since it is always reliable (both in tests and production).
    const htmlEl = el as HTMLElement;
    if (htmlEl.style?.display === 'none') return false;
    if (htmlEl.style?.visibility === 'hidden') return false;
    if (htmlEl.style?.opacity === '0') return false;

    // Computed style check (production only — may be unreliable in jsdom with
    // complex stylesheets, so we wrap in try/catch and ignore failures).
    try {
      const computed = window.getComputedStyle(el);
      if (computed.display === 'none') return false;
      if (computed.visibility === 'hidden') return false;
    } catch {
      // Ignore — fall through to return true
    }

    return true;
  }
}
