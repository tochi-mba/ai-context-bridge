export type PlatformId = 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'grok';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp?: string;
}

export interface ChatContextMetadata {
  model?: string;
  sourceUrl?: string;
  hasImages: boolean;
  hasFiles: boolean;
  schemaVersion: number;
}

export interface ChatContext {
  id: string;
  title: string;
  sourcePlatform: PlatformId;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  charCount: number;
  /** First 200 chars of first user message — for display in lists */
  preview: string;
  /** Whether messages are LZ-string compressed */
  compressed: boolean;
  messages: ChatMessage[];
  metadata: ChatContextMetadata;
}

export interface StorageState {
  contexts: ChatContext[];
  settings: ExtensionSettings;
  /** Storage schema version for migrations */
  version: number;
}

export interface ExtensionSettings {
  autoSave: boolean;
  autoSaveOnNavigate: boolean;
  maxContexts: number;
  compressionEnabled: boolean;
  injectionFormat: 'verbose' | 'compact';
  showFloatingButton: boolean;
  floatingButtonPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  platformEnabled: Record<PlatformId, boolean>;
  notificationsEnabled: boolean;
  /** Warn when injected context exceeds this many chars */
  injectionCharWarnThreshold: number;
}

export interface StorageStats {
  totalContexts: number;
  totalChars: number;
  estimatedBytes: number;
  estimatedBytesCompressed: number;
  oldestContext?: string;
  newestContext?: string;
}

export interface ExtractionResult {
  messages: ChatMessage[];
  model?: string;
  hasImages: boolean;
  hasFiles: boolean;
  error?: string;
}

export interface InjectionResult {
  success: boolean;
  charsInjected: number;
  truncated: boolean;
  error?: string;
}

export interface PlatformSelectors {
  /** Ordered list of selectors to try for message containers */
  messageContainers: string[];
  /** Ordered list of selectors for user messages */
  userMessages: string[];
  /** Ordered list of selectors for assistant messages */
  assistantMessages: string[];
  /** Text input / textarea selectors */
  textInput: string[];
  /** Selector for streaming indicator */
  streamingIndicator: string[];
  /** Selector to detect active model name */
  modelSelector: string[];
}
