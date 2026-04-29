import type { ChatContext, ExtractionResult, InjectionResult, StorageStats, ExtensionSettings } from './types.js';

// ──────────────────────────────────────────────────────────────────────────────
// Message type registry
// ──────────────────────────────────────────────────────────────────────────────

export const MessageType = {
  // Context operations
  SAVE_CONTEXT: 'SAVE_CONTEXT',
  UPDATE_CONTEXT_TITLE: 'UPDATE_CONTEXT_TITLE',
  DELETE_CONTEXT: 'DELETE_CONTEXT',
  DELETE_ALL_CONTEXTS: 'DELETE_ALL_CONTEXTS',
  GET_CONTEXTS: 'GET_CONTEXTS',
  GET_CONTEXT_BY_ID: 'GET_CONTEXT_BY_ID',
  EXPORT_CONTEXTS: 'EXPORT_CONTEXTS',
  IMPORT_CONTEXTS: 'IMPORT_CONTEXTS',

  // Storage
  GET_STORAGE_STATS: 'GET_STORAGE_STATS',

  // Settings
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',

  // Content script ↔ popup/background
  EXTRACT_AND_SAVE: 'EXTRACT_AND_SAVE',
  INJECT_CONTEXT: 'INJECT_CONTEXT',
  PING_CONTENT_SCRIPT: 'PING_CONTENT_SCRIPT',

  // Notifications
  SHOW_NOTIFICATION: 'SHOW_NOTIFICATION',
} as const;

export type MessageTypeName = (typeof MessageType)[keyof typeof MessageType];

// ──────────────────────────────────────────────────────────────────────────────
// Request / Response pairs
// ──────────────────────────────────────────────────────────────────────────────

export interface SaveContextRequest {
  type: typeof MessageType.SAVE_CONTEXT;
  extraction: ExtractionResult;
  platformId: string;
  sourceUrl: string;
  title?: string;
}

export interface SaveContextResponse {
  success: boolean;
  context?: ChatContext;
  error?: string;
  storageWarning?: string;
}

export interface UpdateContextTitleRequest {
  type: typeof MessageType.UPDATE_CONTEXT_TITLE;
  id: string;
  title: string;
}

export interface DeleteContextRequest {
  type: typeof MessageType.DELETE_CONTEXT;
  id: string;
}

export interface DeleteAllContextsRequest {
  type: typeof MessageType.DELETE_ALL_CONTEXTS;
}

export interface GetContextsRequest {
  type: typeof MessageType.GET_CONTEXTS;
  search?: string;
}

export interface GetContextsResponse {
  contexts: ChatContext[];
}

export interface GetContextByIdRequest {
  type: typeof MessageType.GET_CONTEXT_BY_ID;
  id: string;
}

export interface GetContextByIdResponse {
  context?: ChatContext;
}

export interface ExportContextsRequest {
  type: typeof MessageType.EXPORT_CONTEXTS;
  ids?: string[];
}

export interface ExportContextsResponse {
  json: string;
}

export interface ImportContextsRequest {
  type: typeof MessageType.IMPORT_CONTEXTS;
  json: string;
}

export interface ImportContextsResponse {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface GetStorageStatsRequest {
  type: typeof MessageType.GET_STORAGE_STATS;
}

export interface GetStorageStatsResponse {
  stats: StorageStats;
}

export interface GetSettingsRequest {
  type: typeof MessageType.GET_SETTINGS;
}

export interface GetSettingsResponse {
  settings: ExtensionSettings;
}

export interface UpdateSettingsRequest {
  type: typeof MessageType.UPDATE_SETTINGS;
  settings: Partial<ExtensionSettings>;
}

export interface InjectContextRequest {
  type: typeof MessageType.INJECT_CONTEXT;
  contextId: string;
}

export interface InjectContextResponse {
  result: InjectionResult;
}

export interface PingContentScriptRequest {
  type: typeof MessageType.PING_CONTENT_SCRIPT;
}

export interface PingContentScriptResponse {
  alive: boolean;
  platformId?: string;
  /** True when the content script could not be injected and the user must reload the tab. */
  needsReload?: boolean;
  /** The AI page's current dark/light theme, used to theme the popup to match. */
  pageTheme?: 'dark' | 'light';
}

export interface ShowNotificationRequest {
  type: typeof MessageType.SHOW_NOTIFICATION;
  kind: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

// Union of all message requests
export type ExtensionMessage =
  | SaveContextRequest
  | UpdateContextTitleRequest
  | DeleteContextRequest
  | DeleteAllContextsRequest
  | GetContextsRequest
  | GetContextByIdRequest
  | ExportContextsRequest
  | ImportContextsRequest
  | GetStorageStatsRequest
  | GetSettingsRequest
  | UpdateSettingsRequest
  | InjectContextRequest
  | PingContentScriptRequest
  | ShowNotificationRequest;

// ──────────────────────────────────────────────────────────────────────────────
// Typed sendMessage helpers
// ──────────────────────────────────────────────────────────────────────────────

export function sendMessage<T>(message: ExtensionMessage, timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Message timeout: service worker did not respond in time.'));
      }
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage(message, (response: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(e);
      }
    }
  });
}

export function sendTabMessage<T>(tabId: number, message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
