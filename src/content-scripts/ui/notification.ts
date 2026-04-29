/**
 * Toast notification system using Shadow DOM to prevent style conflicts.
 * Adapts shadow/backdrop styles to match the host page's dark/light theme.
 */

import { detectPageTheme, watchPageTheme } from '../../shared/theme.js';

const NOTIFICATION_CSS = `
  :host {
    all: initial;
    position: fixed;
    top: 18px;
    right: 18px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
  }

  .toast {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 11px 14px;
    border-radius: 9px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.45;
    max-width: 320px;
    min-width: 180px;
    pointer-events: all;
    cursor: default;
    word-break: break-word;
    border: 1px solid rgba(255,255,255,0.1);
    -webkit-font-smoothing: antialiased;
    animation: acb-slideIn 0.22s cubic-bezier(0.34, 1.4, 0.64, 1) forwards;
    /* Shadow intensity set dynamically via --toast-shadow */
    box-shadow: var(--toast-shadow, 0 4px 20px rgba(0,0,0,0.28));
  }

  /* Toasts are always coloured — readable on both light and dark backgrounds */
  .toast.success { background: #15803d; color: #fff; border-color: rgba(134,239,172,0.2); }
  .toast.error   { background: #b91c1c; color: #fff; border-color: rgba(252,165,165,0.2); }
  .toast.warning { background: #b45309; color: #fff; border-color: rgba(253,224,71,0.2);  }
  .toast.info    { background: #1d4ed8; color: #fff; border-color: rgba(147,197,253,0.2); }

  .toast.hiding {
    animation: acb-slideOut 0.18s ease-in forwards;
  }

  .icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    margin-top: 1px;
    opacity: 0.9;
  }

  .message { flex: 1; }

  .close {
    background: none;
    border: none;
    color: rgba(255,255,255,0.6);
    cursor: pointer;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
    padding: 0;
    transition: color 0.12s, background 0.12s;
  }

  .close:hover {
    color: #fff;
    background: rgba(255,255,255,0.15);
  }

  @keyframes acb-slideIn {
    from { opacity: 0; transform: translateX(16px) scale(0.96); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
  }

  @keyframes acb-slideOut {
    from { opacity: 1; transform: translateX(0) scale(1); }
    to   { opacity: 0; transform: translateX(16px) scale(0.96); }
  }
`;

const SVG_ICONS: Record<string, string> = {
  success: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8l4 4 6-7"/></svg>`,
  error:   `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
  warning: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2L1.5 14h13L8 2z"/><path d="M8 7v3M8 11.5v.5"/></svg>`,
  info:    `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.5V11M8 5.5v.25"/></svg>`,
};

const CLOSE_ICON = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8"/></svg>`;

// Shadow values that look right on dark vs light host pages
const SHADOW_DARK  = '0 4px 20px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)';
const SHADOW_LIGHT = '0 4px 20px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)';

let host: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let _cleanupThemeWatcher: (() => void) | null = null;

function ensureContainer(): ShadowRoot {
  if (host && shadowRoot) return shadowRoot;

  host = document.createElement('div');
  host.id = 'acb-notifications';
  shadowRoot = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = NOTIFICATION_CSS;
  shadowRoot.appendChild(style);

  document.documentElement.appendChild(host);

  // Apply initial shadow depth and watch for changes
  applyShadowTheme(detectPageTheme());
  _cleanupThemeWatcher = watchPageTheme(applyShadowTheme);

  return shadowRoot;
}

function applyShadowTheme(theme: Parameters<typeof detectPageTheme>[0] extends never ? 'dark' | 'light' : ReturnType<typeof detectPageTheme>): void {
  const root = shadowRoot;
  if (!root) return;
  const shadow = theme === 'dark' ? SHADOW_DARK : SHADOW_LIGHT;
  // Set the CSS custom property on all existing and future toasts via the style element
  // We set it on the host element's style so it cascades into the shadow DOM
  if (host) {
    host.style.setProperty('--toast-shadow-value', shadow);
  }
  // Update all live toasts
  root.querySelectorAll<HTMLElement>('.toast').forEach((t) => {
    t.style.setProperty('--toast-shadow', shadow);
  });
}

export type NotificationKind = 'success' | 'error' | 'warning' | 'info';

export function showNotification(
  message: string,
  kind: NotificationKind = 'info',
  duration = 4000
): void {
  const root = ensureContainer();
  const theme = detectPageTheme();
  const shadow = theme === 'dark' ? SHADOW_DARK : SHADOW_LIGHT;

  const toast = document.createElement('div');
  toast.className = `toast ${kind}`;
  toast.setAttribute('role', 'alert');
  toast.style.setProperty('--toast-shadow', shadow);
  toast.innerHTML = `
    <span class="icon">${SVG_ICONS[kind] ?? SVG_ICONS.info}</span>
    <span class="message">${escapeHtml(message)}</span>
    <button class="close" aria-label="Dismiss">${CLOSE_ICON}</button>
  `;

  const dismiss = (): void => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 190);
  };

  toast.querySelector('.close')?.addEventListener('click', dismiss);
  root.appendChild(toast);

  if (duration > 0) setTimeout(dismiss, duration);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function cleanup(): void {
  _cleanupThemeWatcher?.();
  _cleanupThemeWatcher = null;
  host?.remove();
  host = null;
  shadowRoot = null;
}
