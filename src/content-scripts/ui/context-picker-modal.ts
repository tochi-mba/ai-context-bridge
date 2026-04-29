/**
 * Modal dialog for selecting a saved context to inject.
 * Uses Shadow DOM for style isolation and adapts to the host page's
 * dark/light theme dynamically via MutationObserver.
 */

import type { ChatContext } from '../../shared/types.js';
import { PLATFORM_COLORS, PLATFORM_DISPLAY_NAMES } from '../../shared/constants.js';
import type { InjectionFormat } from '../../shared/formatter.js';
import { detectPageTheme, watchPageTheme, type PageTheme } from '../../shared/theme.js';

// ── Icons ──────────────────────────────────────────────────────────────────────
const ICON_CLOSE  = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12"/></svg>`;
const ICON_INJECT = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="10" height="13" rx="1.5"/><path d="M7 7h4M7 10h3M13 13h4M15 11v4"/></svg>`;
const ICON_LOADING= `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 3a7 7 0 1 0 7 7" style="animation:acb-spin 0.7s linear infinite;transform-origin:10px 10px"/></svg>`;
const ICON_EMPTY  = `<svg width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="14" width="36" height="28" rx="3"/><path d="M6 26h10l3.5 4.5h9L32 26h10"/><path d="M18 8h12M24 8v6"/></svg>`;
const ICON_WARN   = `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2L2 17h16L10 2z"/><path d="M10 9v3.5M10 14.5v.5"/></svg>`;

// ── Theme tokens ───────────────────────────────────────────────────────────────
interface ModalThemeTokens {
  backdropBg: string;
  modalBg: string;
  modalBorder: string;
  shadow: string;
  titleColor: string;
  closeBtnBg: string;
  closeBtnColor: string;
  closeBtnHoverBg: string;
  closeBtnHoverColor: string;
  divider: string;
  inputBg: string;
  inputBorder: string;
  inputColor: string;
  inputPlaceholder: string;
  inputFocusBorder: string;
  inputFocusBg: string;
  cardHoverBg: string;
  cardHoverBorder: string;
  cardSelectedBg: string;
  cardSelectedBorder: string;
  cardTitleColor: string;
  cardMetaColor: string;
  cardWarnColor: string;
  cardPreviewColor: string;
  emptyColor: string;
  emptyTextColor: string;
  footerBg: string;
  selectBg: string;
  selectBorder: string;
  selectColor: string;
  scrollbarThumb: string;
  warnBarBg: string;
  warnBarBorder: string;
  warnBarColor: string;
}

const DARK_TOKENS: ModalThemeTokens = {
  backdropBg:         'rgba(0,0,0,0.65)',
  modalBg:            '#0d1117',
  modalBorder:        'rgba(255,255,255,0.09)',
  shadow:             '0 24px 72px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.3)',
  titleColor:         '#e8edf5',
  closeBtnBg:         'rgba(255,255,255,0.06)',
  closeBtnColor:      '#64748b',
  closeBtnHoverBg:    'rgba(255,255,255,0.12)',
  closeBtnHoverColor: '#e8edf5',
  divider:            'rgba(255,255,255,0.07)',
  inputBg:            'rgba(255,255,255,0.05)',
  inputBorder:        'rgba(255,255,255,0.09)',
  inputColor:         '#e8edf5',
  inputPlaceholder:   '#4a5568',
  inputFocusBorder:   'rgba(99,102,241,0.5)',
  inputFocusBg:       'rgba(99,102,241,0.06)',
  cardHoverBg:        'rgba(255,255,255,0.04)',
  cardHoverBorder:    'rgba(255,255,255,0.07)',
  cardSelectedBg:     'rgba(99,102,241,0.10)',
  cardSelectedBorder: 'rgba(99,102,241,0.35)',
  cardTitleColor:     '#dde4f0',
  cardMetaColor:      '#4a5568',
  cardWarnColor:      '#d97706',
  cardPreviewColor:   '#6b7a94',
  emptyColor:         '#374151',
  emptyTextColor:     '#4a5568',
  footerBg:           '#0b0f18',
  selectBg:           'rgba(255,255,255,0.05)',
  selectBorder:       'rgba(255,255,255,0.09)',
  selectColor:        '#8b9ab5',
  scrollbarThumb:     'rgba(255,255,255,0.12)',
  warnBarBg:          'rgba(180,83,9,0.12)',
  warnBarBorder:      'rgba(245,158,11,0.25)',
  warnBarColor:       '#fbbf24',
};

const LIGHT_TOKENS: ModalThemeTokens = {
  backdropBg:         'rgba(0,0,0,0.35)',
  modalBg:            '#ffffff',
  modalBorder:        'rgba(0,0,0,0.08)',
  shadow:             '0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.1)',
  titleColor:         '#0d1117',
  closeBtnBg:         'rgba(0,0,0,0.05)',
  closeBtnColor:      '#6b7280',
  closeBtnHoverBg:    'rgba(0,0,0,0.09)',
  closeBtnHoverColor: '#111827',
  divider:            'rgba(0,0,0,0.07)',
  inputBg:            'rgba(0,0,0,0.03)',
  inputBorder:        'rgba(0,0,0,0.1)',
  inputColor:         '#111827',
  inputPlaceholder:   '#9ca3af',
  inputFocusBorder:   'rgba(99,102,241,0.5)',
  inputFocusBg:       'rgba(99,102,241,0.04)',
  cardHoverBg:        'rgba(0,0,0,0.025)',
  cardHoverBorder:    'rgba(0,0,0,0.08)',
  cardSelectedBg:     'rgba(99,102,241,0.07)',
  cardSelectedBorder: 'rgba(99,102,241,0.3)',
  cardTitleColor:     '#111827',
  cardMetaColor:      '#9ca3af',
  cardWarnColor:      '#b45309',
  cardPreviewColor:   '#6b7280',
  emptyColor:         '#d1d5db',
  emptyTextColor:     '#6b7280',
  footerBg:           '#f9fafb',
  selectBg:           'rgba(0,0,0,0.03)',
  selectBorder:       'rgba(0,0,0,0.1)',
  selectColor:        '#374151',
  scrollbarThumb:     'rgba(0,0,0,0.15)',
  warnBarBg:          'rgba(254,243,199,0.9)',
  warnBarBorder:      'rgba(217,119,6,0.3)',
  warnBarColor:       '#92400e',
};

// ── CSS template ───────────────────────────────────────────────────────────────
const MODAL_CSS = `
  @keyframes acb-spin { to { transform: rotate(360deg); } }

  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  *, *::before, *::after { box-sizing: border-box; }

  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--m-backdrop-bg);
    backdrop-filter: blur(4px);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: acb-fadeIn 0.15s ease;
    transition: background 0.2s ease;
  }

  .modal {
    background: var(--m-bg);
    border: 1px solid var(--m-border);
    border-radius: 14px;
    width: min(580px, 95vw);
    max-height: 82vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--m-shadow);
    animation: acb-slideUp 0.2s cubic-bezier(0.34, 1.2, 0.64, 1);
    overflow: hidden;
    transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }

  /* ── Header ── */
  .modal-header {
    padding: 18px 20px 14px;
    border-bottom: 1px solid var(--m-divider);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    transition: border-color 0.2s ease;
  }

  .modal-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--m-title-color);
    margin: 0;
    transition: color 0.2s ease;
  }

  .close-btn {
    background: var(--m-close-bg);
    border: none;
    color: var(--m-close-color);
    cursor: pointer;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.12s, color 0.12s;
  }

  .close-btn:hover {
    background: var(--m-close-hover-bg);
    color: var(--m-close-hover-color);
  }

  /* ── Search ── */
  .search-wrap {
    padding: 10px 16px;
    border-bottom: 1px solid var(--m-divider);
    flex-shrink: 0;
    transition: border-color 0.2s ease;
  }

  .search-input {
    width: 100%;
    background: var(--m-input-bg);
    border: 1px solid var(--m-input-border);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: var(--m-input-color);
    outline: none;
    transition: border-color 0.12s, background 0.12s, color 0.2s;
  }

  .search-input::placeholder { color: var(--m-input-placeholder); }

  .search-input:focus {
    border-color: var(--m-input-focus-border);
    background: var(--m-input-focus-bg);
  }

  /* ── List ── */
  .context-list {
    overflow-y: auto;
    flex: 1;
    padding: 6px 8px;
  }

  .context-list::-webkit-scrollbar { width: 5px; }
  .context-list::-webkit-scrollbar-track { background: transparent; }
  .context-list::-webkit-scrollbar-thumb {
    background: var(--m-scrollbar);
    border-radius: 3px;
  }

  /* ── Cards ── */
  .context-card {
    padding: 12px 14px;
    border-radius: 9px;
    cursor: pointer;
    border: 1px solid transparent;
    margin-bottom: 3px;
    transition: background 0.1s, border-color 0.1s;
  }

  .context-card:hover {
    background: var(--m-card-hover-bg);
    border-color: var(--m-card-hover-border);
  }

  .context-card.selected {
    background: var(--m-card-selected-bg);
    border-color: var(--m-card-selected-border);
  }

  .card-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 5px;
  }

  .platform-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 20px;
    flex-shrink: 0;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .card-title {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--m-card-title);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 0.2s ease;
  }

  .card-meta {
    font-size: 11.5px;
    color: var(--m-card-meta);
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    transition: color 0.2s ease;
  }

  .card-meta .warn { color: var(--m-card-warn); }

  .card-preview {
    font-size: 12px;
    color: var(--m-card-preview);
    margin-top: 5px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.5;
    transition: color 0.2s ease;
  }

  /* ── Empty state ── */
  .empty-state {
    text-align: center;
    padding: 52px 24px;
    color: var(--m-empty-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    transition: color 0.2s ease;
  }

  .empty-text {
    font-size: 13px;
    color: var(--m-empty-text);
    line-height: 1.5;
    transition: color 0.2s ease;
  }

  /* ── Footer ── */
  .modal-footer {
    padding: 14px 20px;
    border-top: 1px solid var(--m-divider);
    background: var(--m-footer-bg);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  .format-select {
    background: var(--m-select-bg);
    border: 1px solid var(--m-select-border);
    border-radius: 7px;
    padding: 7px 10px;
    font-size: 12.5px;
    color: var(--m-select-color);
    cursor: pointer;
    outline: none;
    transition: border-color 0.12s, background 0.2s, color 0.2s;
  }

  .format-select:focus { border-color: var(--m-input-focus-border); }

  .btn-inject {
    background: #6366f1;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 9px 18px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s, transform 0.1s;
    display: flex;
    align-items: center;
    gap: 7px;
    -webkit-font-smoothing: antialiased;
  }

  .btn-inject:hover { background: #4f46e5; }
  .btn-inject:active { transform: scale(0.97); }
  .btn-inject:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

  /* ── Warning bar ── */
  .warning-bar {
    margin: 0 8px 10px;
    background: var(--m-warn-bg);
    border: 1px solid var(--m-warn-border);
    border-radius: 7px;
    padding: 8px 13px;
    font-size: 12px;
    color: var(--m-warn-color);
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
  }

  @keyframes acb-fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes acb-slideUp {
    from { opacity: 0; transform: translateY(16px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
`;

// ── Public types ───────────────────────────────────────────────────────────────
export interface ContextPickerCallbacks {
  onInject: (context: ChatContext, format: InjectionFormat) => Promise<void>;
  onClose: () => void;
}

// ── Class ──────────────────────────────────────────────────────────────────────
export class ContextPickerModal {
  private host: HTMLElement;
  private shadowRoot: ShadowRoot;
  private contexts: ChatContext[] = [];
  private selectedId: string | null = null;
  private format: InjectionFormat = 'verbose';
  private searchTerm = '';
  private _cleanupThemeWatcher: (() => void) | null = null;

  constructor(private callbacks: ContextPickerCallbacks) {
    this.host = document.createElement('div');
    this.host.id = 'acb-modal-root';
    this.shadowRoot = this.host.attachShadow({ mode: 'open' });
    this.render();
    document.documentElement.appendChild(this.host);

    // Apply initial theme then watch for changes
    this.applyTheme(detectPageTheme());
    this._cleanupThemeWatcher = watchPageTheme((theme) => this.applyTheme(theme));

    requestAnimationFrame(() => {
      (this.shadowRoot.querySelector('.search-input') as HTMLInputElement | null)?.focus();
    });
  }

  // ── Theme ──────────────────────────────────────────────────────────────────

  private applyTheme(theme: PageTheme): void {
    const t = theme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
    const backdrop = this.shadowRoot.querySelector('.backdrop') as HTMLElement | null;
    if (!backdrop) return;

    // Set all CSS custom properties on the backdrop (root of our shadow tree)
    const s = backdrop.style;
    s.setProperty('--m-backdrop-bg',          t.backdropBg);
    s.setProperty('--m-bg',                   t.modalBg);
    s.setProperty('--m-border',               t.modalBorder);
    s.setProperty('--m-shadow',               t.shadow);
    s.setProperty('--m-title-color',          t.titleColor);
    s.setProperty('--m-close-bg',             t.closeBtnBg);
    s.setProperty('--m-close-color',          t.closeBtnColor);
    s.setProperty('--m-close-hover-bg',       t.closeBtnHoverBg);
    s.setProperty('--m-close-hover-color',    t.closeBtnHoverColor);
    s.setProperty('--m-divider',              t.divider);
    s.setProperty('--m-input-bg',             t.inputBg);
    s.setProperty('--m-input-border',         t.inputBorder);
    s.setProperty('--m-input-color',          t.inputColor);
    s.setProperty('--m-input-placeholder',    t.inputPlaceholder);
    s.setProperty('--m-input-focus-border',   t.inputFocusBorder);
    s.setProperty('--m-input-focus-bg',       t.inputFocusBg);
    s.setProperty('--m-card-hover-bg',        t.cardHoverBg);
    s.setProperty('--m-card-hover-border',    t.cardHoverBorder);
    s.setProperty('--m-card-selected-bg',     t.cardSelectedBg);
    s.setProperty('--m-card-selected-border', t.cardSelectedBorder);
    s.setProperty('--m-card-title',           t.cardTitleColor);
    s.setProperty('--m-card-meta',            t.cardMetaColor);
    s.setProperty('--m-card-warn',            t.cardWarnColor);
    s.setProperty('--m-card-preview',         t.cardPreviewColor);
    s.setProperty('--m-empty-color',          t.emptyColor);
    s.setProperty('--m-empty-text',           t.emptyTextColor);
    s.setProperty('--m-footer-bg',            t.footerBg);
    s.setProperty('--m-select-bg',            t.selectBg);
    s.setProperty('--m-select-border',        t.selectBorder);
    s.setProperty('--m-select-color',         t.selectColor);
    s.setProperty('--m-scrollbar',            t.scrollbarThumb);
    s.setProperty('--m-warn-bg',              t.warnBarBg);
    s.setProperty('--m-warn-border',          t.warnBarBorder);
    s.setProperty('--m-warn-color',           t.warnBarColor);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  private render(): void {
    const style = document.createElement('style');
    style.textContent = MODAL_CSS;

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.callbacks.onClose();
    });

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Select a context to inject');

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h2 class="modal-title">Inject Saved Context</h2>
      <button class="close-btn" aria-label="Close dialog">${ICON_CLOSE}</button>
    `;
    header.querySelector('.close-btn')?.addEventListener('click', () => this.callbacks.onClose());

    // Search
    const searchWrap = document.createElement('div');
    searchWrap.className = 'search-wrap';
    const searchInput = document.createElement('input');
    searchInput.className = 'search-input';
    searchInput.type = 'search';
    searchInput.placeholder = 'Search contexts…';
    searchInput.addEventListener('input', () => {
      this.searchTerm = searchInput.value;
      this.renderList();
    });
    searchWrap.appendChild(searchInput);

    // List
    const list = document.createElement('div');
    list.className = 'context-list';

    // Footer
    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const formatSelect = document.createElement('select');
    formatSelect.className = 'format-select';
    formatSelect.innerHTML = `
      <option value="verbose">Format: Verbose</option>
      <option value="compact">Format: Compact</option>
    `;
    formatSelect.value = this.format;
    formatSelect.addEventListener('change', () => {
      this.format = formatSelect.value as InjectionFormat;
    });

    const injectBtn = document.createElement('button');
    injectBtn.className = 'btn-inject';
    injectBtn.innerHTML = `${ICON_INJECT} Inject into Chat`;
    injectBtn.disabled = true;
    injectBtn.addEventListener('click', () => this.handleInject());

    footer.append(formatSelect, injectBtn);
    modal.append(header, searchWrap, list, footer);
    backdrop.appendChild(modal);
    this.shadowRoot.append(style, backdrop);

    document.addEventListener('keydown', this.handleKeyDown);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  setContexts(contexts: ChatContext[]): void {
    this.contexts = contexts;
    this.renderList();
  }

  setFormat(format: InjectionFormat): void {
    this.format = format;
    const sel = this.shadowRoot.querySelector('.format-select') as HTMLSelectElement | null;
    if (sel) sel.value = format;
  }

  showWarning(message: string): void {
    let bar = this.shadowRoot.querySelector('.warning-bar') as HTMLDivElement | null;
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'warning-bar';
      const footer = this.shadowRoot.querySelector('.modal-footer');
      footer?.parentElement?.insertBefore(bar, footer);
    }
    bar.innerHTML = `${ICON_WARN}<span>${escapeHtml(message)}</span>`;
    bar.style.display = 'flex';
  }

  remove(): void {
    this._cleanupThemeWatcher?.();
    this._cleanupThemeWatcher = null;
    document.removeEventListener('keydown', this.handleKeyDown);
    this.host.remove();
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.callbacks.onClose();
  };

  private renderList(): void {
    const list = this.shadowRoot.querySelector('.context-list');
    if (!list) return;
    list.innerHTML = '';

    const filtered = this.searchTerm
      ? this.contexts.filter(
          (c) =>
            c.title.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
            c.preview.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
            PLATFORM_DISPLAY_NAMES[c.sourcePlatform]
              ?.toLowerCase()
              .includes(this.searchTerm.toLowerCase())
        )
      : this.contexts;

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        ${ICON_EMPTY}
        <div class="empty-text">${
          this.contexts.length === 0
            ? 'No saved contexts yet. Save a conversation first.'
            : 'No contexts match your search.'
        }</div>
      `;
      list.appendChild(empty);
      return;
    }

    for (const ctx of filtered) {
      list.appendChild(this.createCard(ctx));
    }
    this.updateInjectButton();
  }

  private createCard(ctx: ChatContext): HTMLElement {
    const card = document.createElement('div');
    card.className = `context-card${this.selectedId === ctx.id ? ' selected' : ''}`;
    card.dataset['id'] = ctx.id;

    const color = PLATFORM_COLORS[ctx.sourcePlatform] ?? '#6366f1';
    const platformName = PLATFORM_DISPLAY_NAMES[ctx.sourcePlatform] ?? ctx.sourcePlatform;
    const date = new Date(ctx.createdAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

    const warnParts: string[] = [];
    if (ctx.metadata.hasImages) warnParts.push('images not transferable');
    if (ctx.metadata.hasFiles)  warnParts.push('files not transferable');

    card.innerHTML = `
      <div class="card-top">
        <span class="platform-badge" style="background:${color}">${platformName}</span>
        <span class="card-title">${escapeHtml(ctx.title)}</span>
      </div>
      <div class="card-meta">
        <span>${date}</span>
        <span>${ctx.messageCount} msg${ctx.messageCount !== 1 ? 's' : ''}</span>
        ${ctx.metadata.model ? `<span>${escapeHtml(ctx.metadata.model)}</span>` : ''}
        ${warnParts.length ? `<span class="warn">${warnParts.join(', ')}</span>` : ''}
      </div>
      ${ctx.preview ? `<div class="card-preview">${escapeHtml(ctx.preview)}</div>` : ''}
    `;

    card.addEventListener('click', () => {
      this.selectedId = ctx.id;
      this.shadowRoot.querySelectorAll('.context-card').forEach((c) => {
        c.classList.toggle('selected', c === card);
      });
      this.updateInjectButton();
    });

    return card;
  }

  private updateInjectButton(): void {
    const btn = this.shadowRoot.querySelector('.btn-inject') as HTMLButtonElement | null;
    if (btn) btn.disabled = !this.selectedId;
  }

  private async handleInject(): Promise<void> {
    if (!this.selectedId) return;
    const context = this.contexts.find((c) => c.id === this.selectedId);
    if (!context) return;

    const btn = this.shadowRoot.querySelector('.btn-inject') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.innerHTML = `${ICON_LOADING} Injecting…`; }

    try {
      await this.callbacks.onInject(context, this.format);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = `${ICON_INJECT} Inject into Chat`; }
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
