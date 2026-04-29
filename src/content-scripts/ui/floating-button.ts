/**
 * Floating action button injected into AI chat pages via Shadow DOM.
 * Provides "Save" and "Inject Context" actions directly on the page.
 *
 * Theme-awareness: detects each platform's dark/light mode via their specific
 * DOM signals and re-styles on theme change via MutationObserver.
 */

import { SHADOW_ROOT_ID, PLATFORM_COLORS } from '../../shared/constants.js';
import type { PlatformId } from '../../shared/types.js';
import { detectPageTheme, watchPageTheme } from '../../shared/theme.js';

// ── Icons ──────────────────────────────────────────────────────────────────────
const ICON_SAVE = `<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3v10M7 10l3 3 3-3M3 16v1h14v-1"/></svg>`;
const ICON_INJECT = `<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="10" height="13" rx="1.5"/><path d="M7 7h4M7 10h3M13 13h4M15 11v4"/></svg>`;
const ICON_LOADING = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 3a7 7 0 1 0 7 7" style="animation:acb-spin 0.7s linear infinite;transform-origin:10px 10px"/></svg>`;

export type { PageTheme } from '../../shared/theme.js';

// ── Theme token maps ───────────────────────────────────────────────────────────

interface ThemeTokens {
  injectBg: string;
  injectBgHover: string;
  injectColor: string;
  injectBorder: string;
  warningBg: string;
  warningColor: string;
  warningBorder: string;
  badgeBg: string;
  shadow: string;
  shadowHover: string;
}

const THEME_DARK: ThemeTokens = {
  injectBg:       'rgba(15, 23, 42, 0.88)',
  injectBgHover:  'rgba(22, 34, 58, 0.96)',
  injectColor:    '#94a3b8',
  injectBorder:   'rgba(255, 255, 255, 0.09)',
  warningBg:      'rgba(12, 19, 34, 0.93)',
  warningColor:   '#fbbf24',
  warningBorder:  'rgba(245, 158, 11, 0.22)',
  badgeBg:        'rgba(255, 255, 255, 0.2)',
  shadow:         '0 3px 12px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)',
  shadowHover:    '0 6px 20px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.35)',
};

const THEME_LIGHT: ThemeTokens = {
  injectBg:       'rgba(255, 255, 255, 0.92)',
  injectBgHover:  'rgba(255, 255, 255, 1)',
  injectColor:    '#374151',
  injectBorder:   'rgba(0, 0, 0, 0.12)',
  warningBg:      'rgba(255, 251, 235, 0.97)',
  warningColor:   '#92400e',
  warningBorder:  'rgba(217, 119, 6, 0.3)',
  badgeBg:        'rgba(0, 0, 0, 0.12)',
  shadow:         '0 3px 12px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
  shadowHover:    '0 6px 20px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.1)',
};

// ── Styles ─────────────────────────────────────────────────────────────────────

const BUTTON_CSS = `
  @keyframes acb-spin { to { transform: rotate(360deg); } }

  :host {
    all: initial;
    position: fixed;
    z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }

  .fab-container {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-end;
  }

  .fab {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 15px;
    border-radius: 22px;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    letter-spacing: 0.01em;
    line-height: 1;
    -webkit-font-smoothing: antialiased;
    transition:
      transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 0.15s ease,
      background 0.2s ease,
      color 0.2s ease,
      border-color 0.2s ease;
  }

  .fab:hover { transform: translateY(-2px); }
  .fab:active { transform: translateY(0) scale(0.97); }
  .fab:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }

  /* ── Save button: always platform brand color ──────────────────────────── */
  .fab-save {
    background: var(--platform-color, #6366f1);
    border: none;
    color: #fff;
    box-shadow: var(--fab-shadow);
  }

  .fab-save:hover { box-shadow: var(--fab-shadow-hover); }

  /* ── Inject button: adapts to page theme ──────────────────────────────── */
  .fab-inject {
    background: var(--fab-inject-bg);
    border: 1px solid var(--fab-inject-border);
    color: var(--fab-inject-color);
    box-shadow: var(--fab-shadow);
  }

  .fab-inject:hover {
    background: var(--fab-inject-bg-hover);
    color: var(--fab-inject-color-hover, var(--fab-inject-color));
    box-shadow: var(--fab-shadow-hover);
  }

  .fab-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  /* ── Streaming warning banner ─────────────────────────────────────────── */
  .streaming-warning {
    background: var(--fab-warning-bg);
    color: var(--fab-warning-color);
    border: 1px solid var(--fab-warning-border);
    font-size: 11.5px;
    font-weight: 500;
    padding: 6px 12px;
    border-radius: 10px;
    pointer-events: none;
    backdrop-filter: blur(10px);
    letter-spacing: 0.01em;
    transition: background 0.2s ease, color 0.2s ease;
  }

  /* ── Count badge ─────────────────────────────────────────────────────── */
  .badge {
    background: var(--fab-badge-bg);
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.02em;
    transition: background 0.2s ease;
  }
`;

// ── Types ──────────────────────────────────────────────────────────────────────

export type FloatingButtonPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

interface FloatingButtonCallbacks {
  onSave: () => Promise<void>;
  onInject: () => void;
  platformId: PlatformId;
  position?: FloatingButtonPosition;
}

// ── Class ──────────────────────────────────────────────────────────────────────

export class FloatingButton {
  private host: HTMLElement;
  private shadowRoot: ShadowRoot;
  private container!: HTMLDivElement;
  private saveBtn!: HTMLButtonElement;
  private injectBtn!: HTMLButtonElement;
  private streamingWarning!: HTMLDivElement;
  private _cleanupThemeWatcher: (() => void) | null = null;

  constructor(private callbacks: FloatingButtonCallbacks) {
    this.host = document.createElement('div');
    this.host.id = SHADOW_ROOT_ID;
    this.shadowRoot = this.host.attachShadow({ mode: 'open' });
    this.render();
    this.setPosition(callbacks.position ?? 'bottom-right');
    this.applyTheme(detectPageTheme());
    this.watchThemeChanges();
    document.documentElement.appendChild(this.host);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  private render(): void {
    const color = PLATFORM_COLORS[this.callbacks.platformId] ?? '#6366f1';

    const style = document.createElement('style');
    style.textContent = BUTTON_CSS;

    this.container = document.createElement('div');
    this.container.className = 'fab-container';
    this.container.style.setProperty('--platform-color', color);

    this.streamingWarning = document.createElement('div');
    this.streamingWarning.className = 'streaming-warning';
    this.streamingWarning.textContent = 'Waiting for response to finish…';
    this.streamingWarning.style.display = 'none';

    this.saveBtn = document.createElement('button');
    this.saveBtn.className = 'fab fab-save';
    this.saveBtn.innerHTML = `<span class="fab-icon">${ICON_SAVE}</span>Save Context`;
    this.saveBtn.title = 'Save this conversation (Ctrl+Shift+S)';
    this.saveBtn.addEventListener('click', () => this.handleSave());

    this.injectBtn = document.createElement('button');
    this.injectBtn.className = 'fab fab-inject';
    this.injectBtn.innerHTML = `<span class="fab-icon">${ICON_INJECT}</span>Inject Context<span class="badge" id="acb-count" style="display:none">0</span>`;
    this.injectBtn.title = 'Insert a saved context into this chat (Ctrl+Shift+V)';
    this.injectBtn.addEventListener('click', () => this.callbacks.onInject());

    this.container.append(this.streamingWarning, this.saveBtn, this.injectBtn);
    this.shadowRoot.append(style, this.container);
  }

  // ── Theme ──────────────────────────────────────────────────────────────────

  private applyTheme(theme: PageTheme): void {
    const t = theme === 'dark' ? THEME_DARK : THEME_LIGHT;
    const c = this.container.style;

    c.setProperty('--fab-inject-bg',        t.injectBg);
    c.setProperty('--fab-inject-bg-hover',  t.injectBgHover);
    c.setProperty('--fab-inject-color',     t.injectColor);
    c.setProperty('--fab-inject-color-hover', theme === 'dark' ? '#e2e8f0' : '#111827');
    c.setProperty('--fab-inject-border',    t.injectBorder);
    c.setProperty('--fab-warning-bg',       t.warningBg);
    c.setProperty('--fab-warning-color',    t.warningColor);
    c.setProperty('--fab-warning-border',   t.warningBorder);
    c.setProperty('--fab-badge-bg',         t.badgeBg);
    c.setProperty('--fab-shadow',           t.shadow);
    c.setProperty('--fab-shadow-hover',     t.shadowHover);
  }

  private watchThemeChanges(): void {
    this._cleanupThemeWatcher = watchPageTheme((theme) => this.applyTheme(theme));
  }

  // ── Position ───────────────────────────────────────────────────────────────

  private setPosition(position: FloatingButtonPosition): void {
    const [v, h] = position.split('-') as ['bottom' | 'top', 'right' | 'left'];
    Object.assign(this.host.style, {
      top:    v === 'top'    ? '80px' : 'auto',
      bottom: v === 'bottom' ? '80px' : 'auto',
      left:   h === 'left'  ? '20px' : 'auto',
      right:  h === 'right' ? '20px' : 'auto',
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  private async handleSave(): Promise<void> {
    this.saveBtn.disabled = true;
    this.saveBtn.innerHTML = `<span class="fab-icon">${ICON_LOADING}</span>Saving…`;
    try {
      await this.callbacks.onSave();
    } finally {
      this.saveBtn.disabled = false;
      this.saveBtn.innerHTML = `<span class="fab-icon">${ICON_SAVE}</span>Save Context`;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  setStreaming(isStreaming: boolean): void {
    this.saveBtn.disabled = isStreaming;
    this.streamingWarning.style.display = isStreaming ? 'block' : 'none';
  }

  updateContextCount(count: number): void {
    const badge = this.shadowRoot.querySelector('#acb-count') as HTMLElement | null;
    if (badge) {
      badge.textContent = String(count);
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  remove(): void {
    this._cleanupThemeWatcher?.();
    this._cleanupThemeWatcher = null;
    this.host.remove();
  }

  show(): void { this.host.style.display = ''; }
  hide(): void { this.host.style.display = 'none'; }
}
