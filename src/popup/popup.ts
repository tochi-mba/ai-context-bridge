/**
 * Popup script — the main "context library" UI.
 * Lists all saved contexts with search, load, delete, rename, export actions.
 */

import {
  MessageType,
  sendMessage,
  type GetContextsResponse,
  type GetStorageStatsResponse,
  type PingContentScriptResponse,
  type InjectContextResponse,
} from '../shared/messages.js';
import type { ChatContext } from '../shared/types.js';
import { PLATFORM_COLORS, PLATFORM_DISPLAY_NAMES, STORAGE_MAX_BYTES } from '../shared/constants.js';

// ──────────────────────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────────────────────

let allContexts: ChatContext[] = [];
let filteredContexts: ChatContext[] = [];
let isOnSupportedPlatform = false;

// ──────────────────────────────────────────────────────────────────────────────
// DOM refs
// ──────────────────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const platformStatus = $('platform-status');
const searchInput = $<HTMLInputElement>('search-input');
const contextList = $('context-list');
const loadingEl = $('loading');
const footerCount = $('footer-count');
const storageBarWrap = $('storage-bar-wrap');
const storageFill = $<HTMLDivElement>('storage-fill');
const storagePct = $('storage-pct');
const storageLabelText = $('storage-label-text');
const btnSaveCurrent = $<HTMLButtonElement>('btn-save-current');
const btnOptions = $<HTMLButtonElement>('btn-options');
const btnImport = $<HTMLButtonElement>('btn-import');
const btnExportAll = $<HTMLButtonElement>('btn-export-all');

// ──────────────────────────────────────────────────────────────────────────────
// Initialization
// ──────────────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  await Promise.all([loadContexts(), loadStorageStats(), detectPlatform()]);
  bindEvents();
}

async function loadContexts(): Promise<void> {
  try {
    const resp = await sendMessage<GetContextsResponse>({ type: MessageType.GET_CONTEXTS });
    allContexts = resp.contexts;
    filteredContexts = allContexts;
    renderList();
  } catch (e) {
    showError('Could not load contexts: ' + String(e));
  } finally {
    loadingEl.style.display = 'none';
  }
}

async function loadStorageStats(): Promise<void> {
  try {
    const resp = await sendMessage<GetStorageStatsResponse>({ type: MessageType.GET_STORAGE_STATS });
    const { stats } = resp;
    const pct = Math.min(100, Math.round((stats.estimatedBytes / STORAGE_MAX_BYTES) * 100));
    storageFill.style.width = `${pct}%`;
    storagePct.textContent = `${pct}%`;
    storageLabelText.textContent = `Storage · ${formatBytes(stats.estimatedBytes)}`;
    storageFill.className = 'storage-fill' + (pct >= 90 ? ' danger' : pct >= 70 ? ' warn' : '');
  } catch {
    storageBarWrap.style.display = 'none';
  }
}

async function detectPlatform(): Promise<void> {
  try {
    const resp = await sendMessage<PingContentScriptResponse>({
      type: MessageType.PING_CONTENT_SCRIPT,
    });

    // Mirror the AI page's theme in the popup so they always match
    applyTheme(resp.pageTheme ?? 'dark');

    if (resp.alive && resp.platformId) {
      isOnSupportedPlatform = true;
      const name = PLATFORM_DISPLAY_NAMES[resp.platformId as keyof typeof PLATFORM_DISPLAY_NAMES] ?? resp.platformId;
      platformStatus.textContent = `On ${name}`;
      platformStatus.className = 'app-sub on-platform';
      btnSaveCurrent.disabled = false;
    } else if (resp.platformId) {
      const name = PLATFORM_DISPLAY_NAMES[resp.platformId as keyof typeof PLATFORM_DISPLAY_NAMES] ?? resp.platformId;
      platformStatus.textContent = `${name} detected — reload tab to activate`;
      platformStatus.className = 'app-sub unsupported';
      btnSaveCurrent.disabled = true;
      showReloadButton();
    } else {
      platformStatus.textContent = 'Not on an AI platform';
      platformStatus.className = 'app-sub unsupported';
      btnSaveCurrent.disabled = true;
    }
  } catch {
    platformStatus.textContent = 'Not on an AI platform';
    platformStatus.className = 'app-sub unsupported';
    btnSaveCurrent.disabled = true;
  }
}

/** Apply dark or light theme to the popup document. */
function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.setAttribute('data-theme', theme);
}

function showReloadButton(): void {
  if (document.getElementById('btn-reload-tab')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-reload-tab';
  btn.className = 'icon-btn';
  btn.title = 'Reload the active tab to activate the extension';
  btn.setAttribute('aria-label', 'Reload tab');
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10a8 8 0 1 0 8-8 8 8 0 0 0-5.66 2.34L2 7"/><path d="M2 3v4h4"/></svg>`;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (tabId) {
      await chrome.tabs.reload(tabId);
      window.close();
    }
  });
  btnOptions.parentElement?.insertBefore(btn, btnOptions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Render
// ──────────────────────────────────────────────────────────────────────────────

function renderList(): void {
  contextList.innerHTML = '';
  footerCount.textContent = `${filteredContexts.length} context${filteredContexts.length !== 1 ? 's' : ''}`;

  if (filteredContexts.length === 0) {
    contextList.appendChild(buildEmptyState());
    return;
  }

  const frag = document.createDocumentFragment();
  for (const ctx of filteredContexts) {
    frag.appendChild(buildCard(ctx));
  }
  contextList.appendChild(frag);
}

function buildEmptyState(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'empty-state';

  const emptyInbox = `<svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="12" width="34" height="26" rx="3"/><path d="M5 24h9l3 4h10l3-4h9"/><path d="M16 6h12M22 6v6"/></svg>`;
  const emptySearch = `<svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="20" cy="20" r="11"/><path d="M29 29L39 39"/><path d="M16 20h8M20 16v8"/></svg>`;

  div.innerHTML = allContexts.length === 0
    ? `<div class="empty-icon">${emptyInbox}</div>
       <div class="empty-title">No saved contexts yet</div>
       <div class="empty-sub">Navigate to ChatGPT, Claude, Gemini, Perplexity, or Grok and use the <strong>Save</strong> button to capture a conversation.</div>`
    : `<div class="empty-icon">${emptySearch}</div>
       <div class="empty-title">No results</div>
       <div class="empty-sub">Try a different search term.</div>`;
  return div;
}

function buildCard(ctx: ChatContext): HTMLElement {
  const card = document.createElement('div');
  card.className = 'ctx-card';
  card.dataset['id'] = ctx.id;

  const color = PLATFORM_COLORS[ctx.sourcePlatform] ?? '#6366f1';
  const platformName = PLATFORM_DISPLAY_NAMES[ctx.sourcePlatform] ?? ctx.sourcePlatform;
  const date = new Date(ctx.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const warnTags: string[] = [];
  if (ctx.metadata.hasImages) warnTags.push('images not transferable');
  if (ctx.metadata.hasFiles) warnTags.push('files not transferable');

  card.innerHTML = `
    <div class="ctx-top">
      <span class="platform-chip" style="background:${color}">${platformName}</span>
      <span class="ctx-title" title="${escapeHtml(ctx.title)}">${escapeHtml(ctx.title)}</span>
    </div>
    <div class="ctx-meta">
      <span>${date}</span>
      <span>${ctx.messageCount} msg${ctx.messageCount !== 1 ? 's' : ''}</span>
      ${ctx.metadata.model ? `<span>${escapeHtml(ctx.metadata.model)}</span>` : ''}
      ${ctx.compressed ? '<span class="compressed-tag">compressed</span>' : ''}
      ${warnTags.length ? `<span class="warn-tag">${warnTags.join(', ')}</span>` : ''}
    </div>
    ${ctx.preview ? `<div class="ctx-preview">${escapeHtml(ctx.preview)}</div>` : ''}
    <div class="ctx-actions">
      <button class="action-btn primary btn-inject" title="Inject into active chat">Inject</button>
      <button class="action-btn btn-rename" title="Rename">Rename</button>
      <button class="action-btn btn-export" title="Export as JSON">Export</button>
      <button class="action-btn danger btn-delete" title="Delete this context">Delete</button>
    </div>
  `;

  // Title click → rename
  card.querySelector('.ctx-title')?.addEventListener('click', () => startRename(ctx, card));
  card.querySelector('.btn-rename')?.addEventListener('click', () => startRename(ctx, card));
  card.querySelector('.btn-inject')?.addEventListener('click', () => injectContext(ctx.id));
  card.querySelector('.btn-export')?.addEventListener('click', () => exportContext(ctx.id));
  card.querySelector('.btn-delete')?.addEventListener('click', () => deleteContext(ctx.id, card));

  return card;
}

// ──────────────────────────────────────────────────────────────────────────────
// Actions
// ──────────────────────────────────────────────────────────────────────────────

async function saveCurrentPage(): Promise<void> {
  btnSaveCurrent.disabled = true;
  const origInnerHTML = btnSaveCurrent.innerHTML;
  btnSaveCurrent.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke-dasharray="44" stroke-dashoffset="44"><animate attributeName="stroke-dashoffset" dur="0.8s" repeatCount="indefinite" values="44;0"/></circle></svg>`;

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) {
      showError('No active tab found.');
      return;
    }
    await chrome.tabs.sendMessage(tabId, { type: 'TRIGGER_SAVE' });
    await new Promise((r) => setTimeout(r, 800));
    await loadContexts();
    await loadStorageStats();
  } catch (e) {
    showError('Could not save: ' + String(e));
  } finally {
    btnSaveCurrent.innerHTML = origInnerHTML;
    if (isOnSupportedPlatform) btnSaveCurrent.disabled = false;
  }
}

async function injectContext(id: string): Promise<void> {
  if (!isOnSupportedPlatform) {
    showBanner('Navigate to an AI platform first to inject context.', 'warn');
    return;
  }

  try {
    const resp = await sendMessage<InjectContextResponse>({
      type: MessageType.INJECT_CONTEXT,
      contextId: id,
    });

    if (resp.result.success) {
      const msg = resp.result.truncated
        ? `Injected (truncated to ${resp.result.charsInjected.toLocaleString()} chars)`
        : `Injected ${resp.result.charsInjected.toLocaleString()} chars`;
      showBanner(msg, undefined);
      window.close();
    } else {
      showError(resp.result.error ?? 'Injection failed.');
    }
  } catch (e) {
    showError('Inject error: ' + String(e));
  }
}

function startRename(ctx: ChatContext, card: HTMLElement): void {
  const titleEl = card.querySelector('.ctx-title') as HTMLElement;
  const input = document.createElement('input');
  input.className = 'title-input';
  input.value = ctx.title;
  input.maxLength = 80;

  const finish = async (save: boolean): Promise<void> => {
    const newTitle = input.value.trim();
    if (save && newTitle && newTitle !== ctx.title) {
      try {
        await sendMessage({ type: MessageType.UPDATE_CONTEXT_TITLE, id: ctx.id, title: newTitle });
        ctx.title = newTitle;
        titleEl.textContent = newTitle;
        titleEl.title = newTitle;
      } catch (e) {
        showError('Rename failed: ' + String(e));
      }
    }
    input.replaceWith(titleEl);
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { finish(false); }
  });

  titleEl.replaceWith(input);
  input.select();
}

async function deleteContext(id: string, card: HTMLElement): Promise<void> {
  if (!confirm('Delete this saved context? This cannot be undone.')) return;
  try {
    await sendMessage({ type: MessageType.DELETE_CONTEXT, id });
    card.style.opacity = '0';
    card.style.transform = 'scaleY(0)';
    card.style.transition = 'opacity 0.2s, transform 0.2s';
    setTimeout(() => {
      card.remove();
      allContexts = allContexts.filter((c) => c.id !== id);
      filteredContexts = filteredContexts.filter((c) => c.id !== id);
      footerCount.textContent = `${filteredContexts.length} contexts`;
      if (filteredContexts.length === 0) contextList.appendChild(buildEmptyState());
    }, 220);
    await loadStorageStats();
  } catch (e) {
    showError('Delete failed: ' + String(e));
  }
}

async function exportContext(id: string): Promise<void> {
  try {
    const resp = await sendMessage<{ json: string }>({
      type: MessageType.EXPORT_CONTEXTS,
      ids: [id],
    });
    downloadJson(resp.json, `context-${id.slice(0, 8)}.json`);
  } catch (e) {
    showError('Export failed: ' + String(e));
  }
}

async function exportAll(): Promise<void> {
  if (allContexts.length === 0) return;
  try {
    const resp = await sendMessage<{ json: string }>({ type: MessageType.EXPORT_CONTEXTS });
    downloadJson(resp.json, `ai-context-bridge-export-${Date.now()}.json`);
  } catch (e) {
    showError('Export failed: ' + String(e));
  }
}

async function importContexts(): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const resp = await sendMessage<{ imported: number; skipped: number; errors: string[] }>({
        type: MessageType.IMPORT_CONTEXTS,
        json: text,
      });
      if (resp.errors.length > 0) {
        showBanner(`Imported ${resp.imported}, skipped ${resp.skipped}. Errors: ${resp.errors.join('; ')}`, 'warn');
      } else {
        showBanner(`Imported ${resp.imported} context${resp.imported !== 1 ? 's' : ''}${resp.skipped ? `, skipped ${resp.skipped} duplicates` : ''}.`, undefined);
      }
      await loadContexts();
      await loadStorageStats();
    } catch (e) {
      showError('Import failed: ' + String(e));
    }
  });
  input.click();
}

// ──────────────────────────────────────────────────────────────────────────────
// Search filter
// ──────────────────────────────────────────────────────────────────────────────

function filterContexts(term: string): void {
  if (!term.trim()) {
    filteredContexts = allContexts;
  } else {
    const t = term.toLowerCase();
    filteredContexts = allContexts.filter(
      (c) =>
        c.title.toLowerCase().includes(t) ||
        c.preview.toLowerCase().includes(t) ||
        (PLATFORM_DISPLAY_NAMES[c.sourcePlatform] ?? '').toLowerCase().includes(t) ||
        (c.metadata.model ?? '').toLowerCase().includes(t)
    );
  }
  renderList();
}

// ──────────────────────────────────────────────────────────────────────────────
// Event binding
// ──────────────────────────────────────────────────────────────────────────────

function bindEvents(): void {
  searchInput.addEventListener('input', () => filterContexts(searchInput.value));

  btnSaveCurrent.addEventListener('click', saveCurrentPage);

  btnOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  btnImport.addEventListener('click', importContexts);
  btnExportAll.addEventListener('click', exportAll);
}

// ──────────────────────────────────────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────────────────────────────────────

function showError(msg: string): void {
  showBanner(msg, 'error');
}

function showBanner(msg: string, kind: 'warn' | 'error' | undefined): void {
  const existing = document.querySelector('.banner');
  existing?.remove();

  const banner = document.createElement('div');
  banner.className = `banner ${kind === 'error' ? 'error' : kind === 'warn' ? 'warn' : ''}`;
  banner.innerHTML = `<span>${escapeHtml(msg)}</span>`;
  contextList.parentElement?.insertBefore(banner, contextList);

  setTimeout(() => banner.remove(), 6000);
}

function downloadJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Boot
init();
