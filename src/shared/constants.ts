import type { ExtensionSettings, PlatformId } from './types.js';

export const STORAGE_KEY = 'ai_context_bridge_state';
export const STORAGE_SCHEMA_VERSION = 1;

/** Soft cap: warn user when approaching this */
export const STORAGE_WARN_BYTES = 4 * 1024 * 1024; // 4 MB
/** Hard cap: refuse to save beyond this */
export const STORAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const MAX_PREVIEW_LENGTH = 200;
export const MAX_TITLE_LENGTH = 80;
export const MAX_CONTEXT_MESSAGE_COUNT = 500;

/** Warn user if injected text exceeds this */
export const DEFAULT_INJECTION_WARN_CHARS = 8000;

export const SUPPORTED_PLATFORMS: PlatformId[] = [
  'chatgpt',
  'claude',
  'gemini',
  'perplexity',
  'grok',
];

export const PLATFORM_DISPLAY_NAMES: Record<PlatformId, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  grok: 'Grok',
};

export const PLATFORM_COLORS: Record<PlatformId, string> = {
  chatgpt: '#10a37f',
  claude: '#d97706',
  gemini: '#4285f4',
  perplexity: '#20b2aa',
  grok: '#1d9bf0',
};

export const PLATFORM_URLS: Record<PlatformId, string[]> = {
  chatgpt: ['chat.openai.com', 'chatgpt.com'],
  claude: ['claude.ai'],
  gemini: ['gemini.google.com'],
  perplexity: ['perplexity.ai', 'www.perplexity.ai'],
  grok: ['grok.com', 'x.com'],
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  autoSave: false,
  autoSaveOnNavigate: false,
  maxContexts: 50,
  compressionEnabled: true,
  injectionFormat: 'verbose',
  showFloatingButton: true,
  floatingButtonPosition: 'bottom-right',
  platformEnabled: {
    chatgpt: true,
    claude: true,
    gemini: true,
    perplexity: true,
    grok: true,
  },
  notificationsEnabled: true,
  injectionCharWarnThreshold: DEFAULT_INJECTION_WARN_CHARS,
};

export const SHADOW_ROOT_ID = 'ai-context-bridge-root';
export const EXTENSION_PREFIX = 'acb';
