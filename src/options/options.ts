/**
 * Options page script.
 */

import { MessageType, sendMessage } from '../shared/messages.js';
import type { ExtensionSettings } from '../shared/types.js';
import {
  PLATFORM_COLORS,
  PLATFORM_DISPLAY_NAMES,
  SUPPORTED_PLATFORMS,
  STORAGE_MAX_BYTES,
} from '../shared/constants.js';

// ──────────────────────────────────────────────────────────────────────────────
// DOM refs
// ──────────────────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const $input = (id: string) => document.getElementById(id) as HTMLInputElement;
const $select = (id: string) => document.getElementById(id) as HTMLSelectElement;

const saveBanner = $('save-banner');
const errorBanner = $('error-banner');
const platformGrid = $('platform-grid');
const storageSummary = $('storage-summary');
const btnSave = $<HTMLButtonElement>('btn-save');
const btnDeleteAll = $<HTMLButtonElement>('btn-delete-all');
const btnExportAll = $<HTMLButtonElement>('btn-export-all');
const btnImport = $<HTMLButtonElement>('btn-import');
const shortcutsLink = $<HTMLAnchorElement>('shortcuts-link');

// ──────────────────────────────────────────────────────────────────────────────
// Init
// ──────────────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const [settingsResp, statsResp] = await Promise.all([
    sendMessage<{ settings: ExtensionSettings }>({ type: MessageType.GET_SETTINGS }),
    sendMessage<{ stats: import('../shared/types.js').StorageStats }>({ type: MessageType.GET_STORAGE_STATS }),
  ]);

  populateForm(settingsResp.settings);
  renderPlatformGrid(settingsResp.settings);
  renderStorageSummary(statsResp.stats);
  bindEvents(settingsResp.settings);
}

// ──────────────────────────────────────────────────────────────────────────────
// Form population
// ──────────────────────────────────────────────────────────────────────────────

function populateForm(settings: ExtensionSettings): void {
  $input('showFloatingButton').checked = settings.showFloatingButton;
  $select('floatingButtonPosition').value = settings.floatingButtonPosition;
  $input('maxContexts').value = String(settings.maxContexts);
  $input('compressionEnabled').checked = settings.compressionEnabled;
  $input('notificationsEnabled').checked = settings.notificationsEnabled;
  $select('injectionFormat').value = settings.injectionFormat;
  $input('injectionCharWarnThreshold').value = String(settings.injectionCharWarnThreshold);
}

function renderPlatformGrid(settings: ExtensionSettings): void {
  platformGrid.innerHTML = '';
  for (const platformId of SUPPORTED_PLATFORMS) {
    const enabled = settings.platformEnabled[platformId] ?? true;
    const color = PLATFORM_COLORS[platformId];
    const name = PLATFORM_DISPLAY_NAMES[platformId];

    const el = document.createElement('label');
    el.className = `platform-toggle${enabled ? ' active' : ''}`;
    el.innerHTML = `
      <span class="platform-name">
        <span class="platform-dot" style="background:${color}"></span>
        ${name}
      </span>
      <div class="toggle-wrap">
        <input type="checkbox" class="toggle-input" id="platform-${platformId}" ${enabled ? 'checked' : ''} />
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </div>
    `;

    el.querySelector('input')?.addEventListener('change', (e) => {
      el.classList.toggle('active', (e.target as HTMLInputElement).checked);
    });

    platformGrid.appendChild(el);
  }
}

function renderStorageSummary(
  stats: import('../shared/types.js').StorageStats
): void {
  const pct = Math.round((stats.estimatedBytes / STORAGE_MAX_BYTES) * 100);
  const oldest = stats.oldestContext
    ? new Date(stats.oldestContext).toLocaleDateString()
    : '—';
  const newest = stats.newestContext
    ? new Date(stats.newestContext).toLocaleDateString()
    : '—';

  storageSummary.innerHTML = `
    <strong>${stats.totalContexts}</strong> saved contexts &nbsp;·&nbsp;
    <strong>${formatBytes(stats.estimatedBytes)}</strong> used (${pct}% of 5 MB limit)<br>
    Total chars stored: <strong>${stats.totalChars.toLocaleString()}</strong><br>
    Oldest: <strong>${oldest}</strong> &nbsp;·&nbsp; Newest: <strong>${newest}</strong>
  `;
}

// ──────────────────────────────────────────────────────────────────────────────
// Collect form values
// ──────────────────────────────────────────────────────────────────────────────

function collectSettings(): ExtensionSettings {
  const platformEnabled = {} as Record<string, boolean>;
  for (const platformId of SUPPORTED_PLATFORMS) {
    const checkbox = document.getElementById(`platform-${platformId}`) as HTMLInputElement | null;
    platformEnabled[platformId] = checkbox?.checked ?? true;
  }

  return {
    showFloatingButton: $input('showFloatingButton').checked,
    floatingButtonPosition: $select('floatingButtonPosition').value as ExtensionSettings['floatingButtonPosition'],
    maxContexts: Math.max(1, Math.min(200, parseInt($input('maxContexts').value, 10) || 50)),
    compressionEnabled: $input('compressionEnabled').checked,
    notificationsEnabled: $input('notificationsEnabled').checked,
    injectionFormat: $select('injectionFormat').value as 'verbose' | 'compact',
    injectionCharWarnThreshold: Math.max(
      1000,
      parseInt($input('injectionCharWarnThreshold').value, 10) || 8000
    ),
    platformEnabled: platformEnabled as ExtensionSettings['platformEnabled'],
    autoSave: false,
    autoSaveOnNavigate: false,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Save settings
// ──────────────────────────────────────────────────────────────────────────────

async function saveSettings(): Promise<void> {
  const settings = collectSettings();

  try {
    await sendMessage({ type: MessageType.UPDATE_SETTINGS, settings });

    // Notify all AI platform tabs to update
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED' }).catch(() => {});
      }
    }

    showSaveBanner();
  } catch (e) {
    showError('Save failed: ' + String(e));
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Data management
// ──────────────────────────────────────────────────────────────────────────────

async function deleteAll(): Promise<void> {
  if (!confirm('Delete ALL saved contexts? This cannot be undone.')) return;
  try {
    await sendMessage({ type: MessageType.DELETE_ALL_CONTEXTS });
    const statsResp = await sendMessage<{ stats: import('../shared/types.js').StorageStats }>(
      { type: MessageType.GET_STORAGE_STATS }
    );
    renderStorageSummary(statsResp.stats);
    showSaveBanner('All contexts deleted.');
  } catch (e) {
    showError('Delete failed: ' + String(e));
  }
}

async function exportAll(): Promise<void> {
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
      const msg = `Imported ${resp.imported} context${resp.imported !== 1 ? 's' : ''}${
        resp.skipped ? `, skipped ${resp.skipped} duplicates` : ''
      }.${resp.errors.length ? ' Errors: ' + resp.errors.join('; ') : ''}`;
      showSaveBanner(msg);
      const statsResp = await sendMessage<{ stats: import('../shared/types.js').StorageStats }>(
        { type: MessageType.GET_STORAGE_STATS }
      );
      renderStorageSummary(statsResp.stats);
    } catch (e) {
      showError('Import failed: ' + String(e));
    }
  });
  input.click();
}

// ──────────────────────────────────────────────────────────────────────────────
// Event binding
// ──────────────────────────────────────────────────────────────────────────────

function bindEvents(_settings: ExtensionSettings): void {
  btnSave.addEventListener('click', saveSettings);
  btnDeleteAll.addEventListener('click', deleteAll);
  btnExportAll.addEventListener('click', exportAll);
  btnImport.addEventListener('click', importContexts);

  // Shortcuts link — must open via chrome.tabs since it's a privileged URL
  shortcutsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  // Save on Enter in inputs
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) saveSettings();
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Feedback
// ──────────────────────────────────────────────────────────────────────────────

function showSaveBanner(text = '✓ Settings saved!'): void {
  errorBanner.classList.add('hidden');
  saveBanner.textContent = text;
  saveBanner.classList.remove('hidden');
  setTimeout(() => saveBanner.classList.add('hidden'), 3000);
}

function showError(msg: string): void {
  saveBanner.classList.add('hidden');
  errorBanner.textContent = msg;
  errorBanner.classList.remove('hidden');
  setTimeout(() => errorBanner.classList.add('hidden'), 6000);
}

// ──────────────────────────────────────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────────────────────────────────────

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

// Boot
init();
