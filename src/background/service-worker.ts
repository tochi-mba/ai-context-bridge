/**
 * Service Worker (MV3 background script)
 * Handles all cross-component messaging and coordinates storage operations.
 */

import {
  deleteAllContexts,
  deleteContext,
  exportContexts,
  getAllContexts,
  getContextWithMessages,
  getSettings,
  getStorageStats,
  importContexts,
  saveContext,
  updateContextTitle,
  updateSettings,
} from '../shared/storage-manager.js';
import {
  MessageType,
  type ExtensionMessage,
  type GetContextsResponse,
  type GetContextByIdResponse,
  type GetStorageStatsResponse,
  type GetSettingsResponse,
  type SaveContextResponse,
  type ExportContextsResponse,
  type ImportContextsResponse,
  type InjectContextResponse,
  type PingContentScriptResponse,
} from '../shared/messages.js';
import { PLATFORM_DISPLAY_NAMES, PLATFORM_URLS } from '../shared/constants.js';
import type { PlatformId } from '../shared/types.js';
import { formatContextForInjection, truncateFormattedContext } from '../shared/formatter.js';

// ──────────────────────────────────────────────────────────────────────────────
// Service Worker lifecycle
// ──────────────────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  void (self as unknown as { skipWaiting(): void }).skipWaiting();
});

self.addEventListener('activate', () => {
  void (self as unknown as { clients: { claim(): Promise<void> } }).clients.claim();
});

// ──────────────────────────────────────────────────────────────────────────────
// Message router
// ──────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[AI Context Bridge SW] Error:', errMsg, message);
        sendResponse({ success: false, error: errMsg });
      });

    // Return true to keep the message channel open for async response
    return true;
  }
);

async function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case MessageType.SAVE_CONTEXT: {
      const platformId = message.platformId as PlatformId;
      const platformName = PLATFORM_DISPLAY_NAMES[platformId] ?? platformId;
      try {
        const result = await saveContext({
          extraction: message.extraction,
          platformId,
          platformName,
          sourceUrl: message.sourceUrl,
          customTitle: message.title,
        });
        const response: SaveContextResponse = {
          success: true,
          context: result.context,
          storageWarning: result.storageWarning,
        };
        return response;
      } catch (e) {
        const response: SaveContextResponse = {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
        return response;
      }
    }

    case MessageType.UPDATE_CONTEXT_TITLE: {
      await updateContextTitle(message.id, message.title);
      return { success: true };
    }

    case MessageType.DELETE_CONTEXT: {
      await deleteContext(message.id);
      return { success: true };
    }

    case MessageType.DELETE_ALL_CONTEXTS: {
      await deleteAllContexts();
      return { success: true };
    }

    case MessageType.GET_CONTEXTS: {
      const contexts = await getAllContexts(message.search);
      const response: GetContextsResponse = { contexts };
      return response;
    }

    case MessageType.GET_CONTEXT_BY_ID: {
      const context = await getContextWithMessages(message.id);
      const response: GetContextByIdResponse = { context };
      return response;
    }

    case MessageType.EXPORT_CONTEXTS: {
      const json = await exportContexts(message.ids);
      const response: ExportContextsResponse = { json };
      return response;
    }

    case MessageType.IMPORT_CONTEXTS: {
      const result = await importContexts(message.json);
      const response: ImportContextsResponse = {
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
      };
      return response;
    }

    case MessageType.GET_STORAGE_STATS: {
      const stats = await getStorageStats();
      const response: GetStorageStatsResponse = { stats };
      return response;
    }

    case MessageType.GET_SETTINGS: {
      const settings = await getSettings();
      const response: GetSettingsResponse = { settings };
      return response;
    }

    case MessageType.UPDATE_SETTINGS: {
      await updateSettings(message.settings);
      return { success: true };
    }

    case MessageType.INJECT_CONTEXT: {
      // Forward inject request to the active tab's content script
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (!activeTab?.id) {
        const response: InjectContextResponse = {
          result: { success: false, charsInjected: 0, truncated: false, error: 'No active tab found.' },
        };
        return response;
      }

      const context = await getContextWithMessages(message.contextId);
      if (!context) {
        const response: InjectContextResponse = {
          result: { success: false, charsInjected: 0, truncated: false, error: 'Context not found.' },
        };
        return response;
      }

      const settings = await getSettings();
      let formatted = formatContextForInjection(context, settings.injectionFormat);
      let truncated = false;

      if (formatted.length > settings.injectionCharWarnThreshold * 2) {
        formatted = truncateFormattedContext(formatted, settings.injectionCharWarnThreshold * 2);
        truncated = true;
      }

      try {
        const result = await chrome.tabs.sendMessage(activeTab.id, {
          type: 'INJECT_TEXT',
          text: formatted,
        });
        const response: InjectContextResponse = {
          result: {
            success: (result as { success?: boolean }).success ?? false,
            charsInjected: formatted.length,
            truncated,
          },
        };
        return response;
      } catch (e) {
        const response: InjectContextResponse = {
          result: {
            success: false,
            charsInjected: 0,
            truncated,
            error: e instanceof Error ? e.message : String(e),
          },
        };
        return response;
      }
    }

    case MessageType.PING_CONTENT_SCRIPT: {
      // Ping the active tab's content script to check if it's alive
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (!activeTab?.id || !activeTab.url) {
        const response: PingContentScriptResponse = { alive: false };
        return response;
      }

      const platformId = detectPlatformFromUrl(activeTab.url);

      // First attempt: ping any already-running content script
      try {
        await chrome.tabs.sendMessage(activeTab.id, { type: 'PING' });
        const response: PingContentScriptResponse = { alive: true, platformId: platformId ?? undefined };
        return response;
      } catch {
        // Content script not yet injected — fall through to try programmatic injection
      }

      // If not a supported platform, nothing to inject
      if (!platformId) {
        const response: PingContentScriptResponse = { alive: false };
        return response;
      }

      // Second attempt: programmatically inject the content script into existing tabs.
      // This handles the case where the extension was just installed and already-open
      // tabs never received the content script via the manifest's content_scripts rules.
      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['src/content-scripts/main.js'],
        });
        // Give the script a moment to initialise its async setup
        await new Promise<void>((r) => setTimeout(r, 400));
        // Second ping
        await chrome.tabs.sendMessage(activeTab.id, { type: 'PING' });
        const response: PingContentScriptResponse = { alive: true, platformId };
        return response;
      } catch {
        // Injection failed (e.g. restricted page) or script errored — tell popup to reload
        const response: PingContentScriptResponse = { alive: false, platformId, needsReload: true };
        return response;
      }
    }

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Context menu
// ──────────────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-context',
    title: 'Save AI Chat Context',
    contexts: ['page'],
    documentUrlPatterns: buildAllUrlPatterns(),
  });
});

chrome.contextMenus.onClicked.addListener((_info, tab) => {
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_SAVE' }).catch(() => {
    // Content script may not be ready yet
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Keyboard commands
// ──────────────────────────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab?.id) return;

  if (command === 'save-context') {
    chrome.tabs.sendMessage(activeTab.id, { type: 'TRIGGER_SAVE' }).catch(() => {});
  } else if (command === 'inject-context') {
    chrome.tabs.sendMessage(activeTab.id, { type: 'TRIGGER_INJECT_PICKER' }).catch(() => {});
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function detectPlatformFromUrl(url: string): PlatformId | null {
  try {
    const hostname = new URL(url).hostname;
    for (const [id, urls] of Object.entries(PLATFORM_URLS)) {
      if (urls.some((u) => hostname === u || hostname.endsWith('.' + u))) {
        return id as PlatformId;
      }
    }
  } catch {
    // Invalid URL
  }
  return null;
}

function buildAllUrlPatterns(): string[] {
  return Object.values(PLATFORM_URLS)
    .flat()
    .map((u) => `*://${u}/*`);
}
