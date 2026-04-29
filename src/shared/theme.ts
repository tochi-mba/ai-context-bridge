/**
 * Page-theme detection shared by all injected content-script UI components.
 *
 * Detection priority (most-reliable → fallback):
 *   1. html[data-mode]           — Claude
 *   2. html[data-color-scheme]   — Perplexity
 *   3. html.dark / html.light    — ChatGPT, Grok
 *   4. body.dark-theme           — Gemini
 *   5. html inline color-scheme  — ChatGPT variants
 *   6. Computed body luminance   — generic
 *   7. prefers-color-scheme      — last resort
 */

export type PageTheme = 'dark' | 'light';

export function detectPageTheme(): PageTheme {
  const html = document.documentElement;
  const body = document.body;

  const dataMode = html.getAttribute('data-mode');
  if (dataMode === 'dark') return 'dark';
  if (dataMode === 'light') return 'light';

  const dataCS = html.getAttribute('data-color-scheme');
  if (dataCS === 'dark') return 'dark';
  if (dataCS === 'light') return 'light';

  if (html.classList.contains('dark')) return 'dark';
  if (html.classList.contains('light')) return 'light';

  if (body.classList.contains('dark-theme')) return 'dark';
  if (body.classList.contains('light-theme')) return 'light';

  const inlineCS = html.style.colorScheme;
  if (inlineCS === 'dark') return 'dark';
  if (inlineCS === 'light') return 'light';

  // Generic: computed background — check body then html, skip transparent values
  try {
    for (const el of [body, html]) {
      const bg = window.getComputedStyle(el).backgroundColor;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?/);
      if (m) {
        const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
        if (alpha < 0.05) continue; // skip fully transparent
        const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
        if (lum < 0.45) return 'dark';
        if (lum > 0.55) return 'light';
      }
    }
  } catch { /* ignore */ }

  // Check if the page uses a known dark CSS colour-scheme value
  try {
    const cs = window.getComputedStyle(html).colorScheme;
    if (cs && cs.includes('dark'))  return 'dark';
    if (cs && cs.includes('light')) return 'light';
  } catch { /* ignore */ }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Watches all theme-relevant DOM attributes across every supported platform
 * and calls `callback` whenever any of them change.
 * Returns a cleanup function that disconnects the observer.
 */
export function watchPageTheme(callback: (theme: PageTheme) => void): () => void {
  const fire = (): void => callback(detectPageTheme());

  const observer = new MutationObserver(fire);

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-mode', 'data-color-scheme', 'style'],
  });

  if (document.body) {
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', fire);

  return () => {
    observer.disconnect();
    mq.removeEventListener('change', fire);
  };
}
