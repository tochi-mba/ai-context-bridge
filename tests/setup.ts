/**
 * Global test setup — runs before every test file.
 * Provides a realistic Chrome API mock so shared utilities and
 * platform extractors can be tested without a real browser.
 */
import { vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// In-memory chrome.storage.local mock
// ──────────────────────────────────────────────────────────────────────────────

const storageStore: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn((keys: string | string[] | null) => {
        if (keys === null) return Promise.resolve({ ...storageStore });
        const keyList = Array.isArray(keys) ? keys : [keys];
        const result: Record<string, unknown> = {};
        for (const k of keyList) {
          if (k in storageStore) result[k] = storageStore[k];
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(storageStore, items);
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[]) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) delete storageStore[k];
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        for (const k of Object.keys(storageStore)) delete storageStore[k];
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    lastError: null as chrome.runtime.LastError | null,
    openOptionsPage: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
  },
  commands: {
    onCommand: { addListener: vi.fn() },
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: { addListener: vi.fn() },
  },
};

// Attach to global so source files importing `chrome.*` find the mock
(global as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

// ──────────────────────────────────────────────────────────────────────────────
// Reset state between tests
// ──────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Clear in-memory storage
  for (const k of Object.keys(storageStore)) delete storageStore[k];

  // Clear all mock call histories (but keep implementations)
  vi.clearAllMocks();

  // Reset DOM to a clean slate
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

// ──────────────────────────────────────────────────────────────────────────────
// jsdom polyfills
// ──────────────────────────────────────────────────────────────────────────────

// execCommand is not implemented in jsdom — stub it
document.execCommand = vi.fn(() => true);

// jsdom never does layout so getBoundingClientRect always returns zeros.
// Override the prototype so isVisible() works in streaming-detection tests.
// We check inline styles to simulate visibility correctly.
Element.prototype.getBoundingClientRect = function () {
  const style = (this as HTMLElement).style;
  if (style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0') {
    return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 } as DOMRect;
  }
  return { width: 50, height: 50, top: 0, left: 0, right: 50, bottom: 50 } as DOMRect;
};

// jsdom's getComputedStyle may apply CSS rules from large fixture files
// (e.g. Gemini's 43k-line HTML) in unexpected ways, interfering with visibility
// checks. Override to prefer inline styles — this matches real browser behavior
// where inline styles always win for display/visibility/opacity.
const _origGetComputedStyle = window.getComputedStyle.bind(window);
(window as Window & typeof globalThis).getComputedStyle = (
  el: Element,
  pseudoEl?: string | null
): CSSStyleDeclaration => {
  const computed = _origGetComputedStyle(el, pseudoEl);
  const htmlEl = el as HTMLElement;
  // If the element has an explicit inline style value, use that over computed
  return new Proxy(computed, {
    get(target, prop: string) {
      if (prop === 'display' && htmlEl.style?.display) return htmlEl.style.display;
      if (prop === 'visibility' && htmlEl.style?.visibility) return htmlEl.style.visibility;
      if (prop === 'opacity' && htmlEl.style?.opacity) return htmlEl.style.opacity;
      const val = (target as unknown as Record<string, unknown>)[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    },
  }) as CSSStyleDeclaration;
};

// crypto.randomUUID — jsdom may not have it in older versions
if (!globalThis.crypto?.randomUUID) {
  let counter = 0;
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: () => `test-uuid-${++counter}`,
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return arr;
      },
    },
    configurable: true,
  });
}

export { chromeMock };
