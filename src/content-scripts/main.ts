/**
 * Content script entry point.
 * Injected into all supported AI platform pages.
 * Handles:
 *  - Platform detection and extractor initialization
 *  - SPA navigation detection via MutationObserver + popstate
 *  - Floating button UI injection
 *  - Context save / inject flows
 *  - Messages from background service worker and popup
 */

import { detectCurrentPlatform, getCurrentPlatformInstance } from './platforms/registry.js';
import { detectPageTheme } from '../shared/theme.js';
import { FloatingButton } from './ui/floating-button.js';
import { ContextPickerModal } from './ui/context-picker-modal.js';
import { showNotification } from './ui/notification.js';
import { sendMessage } from '../shared/messages.js';
import { MessageType } from '../shared/messages.js';
import { formatContextForInjection } from '../shared/formatter.js';
import type { InjectionFormat } from '../shared/formatter.js';
import type { ChatContext, PlatformId } from '../shared/types.js';

// Side-effect imports to register each platform
import './platforms/chatgpt.js';
import './platforms/claude.js';
import './platforms/gemini.js';
import './platforms/perplexity.js';
import './platforms/grok.js';

// ──────────────────────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────────────────────

let currentPlatformId: PlatformId | null = null;
let floatingButton: FloatingButton | null = null;
let modal: ContextPickerModal | null = null;
let streamingPollInterval: ReturnType<typeof setInterval> | null = null;
let currentUrl = location.href;

// ──────────────────────────────────────────────────────────────────────────────
// Initialization
// ──────────────────────────────────────────────────────────────────────────────

async function initialize(): Promise<void> {
  currentPlatformId = detectCurrentPlatform();
  if (!currentPlatformId) return; // Unsupported page; do nothing

  // Fetch settings to check if this platform is enabled and get UI preferences
  let settings;
  try {
    const response = await sendMessage<{ settings: import('../shared/types.js').ExtensionSettings }>(
      { type: MessageType.GET_SETTINGS }
    );
    settings = response.settings;
  } catch {
    // Service worker not ready yet — retry
    setTimeout(initialize, 1000);
    return;
  }

  if (!settings.platformEnabled[currentPlatformId]) return;

  if (settings.showFloatingButton) {
    mountFloatingButton(currentPlatformId, settings.floatingButtonPosition);
  }

  startStreamingPoll();
  refreshContextCount();
}

function mountFloatingButton(
  platformId: PlatformId,
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
): void {
  floatingButton?.remove();
  floatingButton = new FloatingButton({
    platformId,
    position,
    onSave: handleSave,
    onInject: openContextPicker,
  });
}

function teardown(): void {
  floatingButton?.remove();
  floatingButton = null;
  modal?.remove();
  modal = null;
  if (streamingPollInterval) {
    clearInterval(streamingPollInterval);
    streamingPollInterval = null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// SPA navigation detection
// ──────────────────────────────────────────────────────────────────────────────

const navigationObserver = new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    onNavigate();
  }
});

navigationObserver.observe(document.documentElement, {
  subtree: true,
  childList: true,
});

window.addEventListener('popstate', () => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    onNavigate();
  }
});

// Intercept pushState/replaceState for SPA routers that don't fire popstate
const origPush = history.pushState.bind(history);
const origReplace = history.replaceState.bind(history);

history.pushState = (...args) => {
  origPush(...args);
  setTimeout(onNavigate, 50);
};

history.replaceState = (...args) => {
  origReplace(...args);
  setTimeout(onNavigate, 50);
};

function onNavigate(): void {
  // Close any open modals on navigation
  modal?.remove();
  modal = null;
  // Re-check platform and re-mount if needed
  const newPlatform = detectCurrentPlatform();
  if (newPlatform !== currentPlatformId) {
    teardown();
    currentPlatformId = newPlatform;
    if (newPlatform) {
      setTimeout(initialize, 300); // Give the SPA DOM time to settle
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Save flow
// ──────────────────────────────────────────────────────────────────────────────

async function handleSave(): Promise<void> {
  const platform = getCurrentPlatformInstance();
  if (!platform || !currentPlatformId) {
    showNotification('Could not detect the current AI platform.', 'error');
    return;
  }

  if (platform.isStreamingActive()) {
    showNotification('Please wait for the AI to finish responding before saving.', 'warning');
    return;
  }

  const extraction = platform.extractMessages();

  if (extraction.messages.length === 0) {
    showNotification(extraction.error ?? 'No messages found to save.', 'warning');
    return;
  }

  try {
    const response = await sendMessage<{ success: boolean; storageWarning?: string; error?: string }>(
      {
        type: MessageType.SAVE_CONTEXT,
        extraction,
        platformId: currentPlatformId,
        sourceUrl: location.href,
      }
    );

    if (response.success) {
      showNotification(
        `Saved ${extraction.messages.length} messages from ${platform.name}!`,
        'success'
      );
      if (response.storageWarning) {
        setTimeout(() => showNotification(response.storageWarning!, 'warning', 6000), 1500);
      }
      refreshContextCount();
    } else {
      showNotification(response.error ?? 'Failed to save context.', 'error');
    }
  } catch (e) {
    showNotification(`Save failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Inject flow
// ──────────────────────────────────────────────────────────────────────────────

async function openContextPicker(): Promise<void> {
  if (modal) {
    modal.remove();
    modal = null;
    return;
  }

  let contexts: ChatContext[] = [];
  let format: InjectionFormat = 'verbose';

  try {
    const [ctxResp, settingsResp] = await Promise.all([
      sendMessage<{ contexts: ChatContext[] }>({ type: MessageType.GET_CONTEXTS }),
      sendMessage<{ settings: import('../shared/types.js').ExtensionSettings }>(
        { type: MessageType.GET_SETTINGS }
      ),
    ]);
    contexts = ctxResp.contexts;
    format = settingsResp.settings.injectionFormat;
  } catch {
    showNotification('Could not load saved contexts.', 'error');
    return;
  }

  modal = new ContextPickerModal({
    onClose: () => {
      modal?.remove();
      modal = null;
    },
    onInject: handleInject,
  });

  modal.setContexts(contexts);
  modal.setFormat(format);
}

async function handleInject(context: ChatContext, format: InjectionFormat): Promise<void> {
  const platform = getCurrentPlatformInstance();
  if (!platform) {
    showNotification('Could not detect the current platform.', 'error');
    return;
  }

  // Fetch full (decompressed) context from background
  let fullContext: ChatContext | undefined;
  try {
    const resp = await sendMessage<{ context?: ChatContext }>({
      type: MessageType.GET_CONTEXT_BY_ID,
      id: context.id,
    });
    fullContext = resp.context;
  } catch {
    showNotification('Failed to load context data.', 'error');
    return;
  }

  if (!fullContext) {
    showNotification('Context not found.', 'error');
    return;
  }

  let text = formatContextForInjection(fullContext, format);

  const settings = await sendMessage<{ settings: import('../shared/types.js').ExtensionSettings }>(
    { type: MessageType.GET_SETTINGS }
  ).then((r) => r.settings);

  let truncated = false;
  const maxChars = settings.injectionCharWarnThreshold * 2;
  if (text.length > maxChars) {
    const { truncateFormattedContext } = await import('../shared/formatter.js');
    text = truncateFormattedContext(text, maxChars);
    truncated = true;
    modal?.showWarning('Context was truncated to fit the platform\'s input limit.');
  }

  const success = await platform.injectText(text);

  if (success) {
    modal?.remove();
    modal = null;
    const msg = truncated
      ? `Context injected (truncated — ${text.length.toLocaleString()} chars).`
      : `Context injected — ${text.length.toLocaleString()} chars.`;
    showNotification(msg, 'success');

    // Warn about non-transferable content
    if (fullContext.metadata.hasImages || fullContext.metadata.hasFiles) {
      setTimeout(() => {
        showNotification(
          'Note: Images and file attachments from the original conversation could not be transferred.',
          'warning',
          8000
        );
      }, 1500);
    }
  } else {
    showNotification('Failed to inject text into the chat input.', 'error');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Streaming poll — updates the floating button state
// ──────────────────────────────────────────────────────────────────────────────

function startStreamingPoll(): void {
  if (streamingPollInterval) return;
  streamingPollInterval = setInterval(() => {
    const platform = getCurrentPlatformInstance();
    if (!platform || !floatingButton) return;
    floatingButton.setStreaming(platform.isStreamingActive());
  }, 800);
}

async function refreshContextCount(): Promise<void> {
  try {
    const resp = await sendMessage<{ contexts: import('../shared/types.js').ChatContext[] }>(
      { type: MessageType.GET_CONTEXTS }
    );
    floatingButton?.updateContextCount(resp.contexts.length);
  } catch {
    // Non-critical
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Message listener — receives commands from background / popup
// ──────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; text?: string },
    _sender,
    sendResponse: (r: unknown) => void
  ) => {
    switch (message.type) {
      case 'PING':
        sendResponse({ alive: true, platformId: currentPlatformId, pageTheme: detectPageTheme() });
        break;

      case 'TRIGGER_SAVE':
        handleSave().then(() => sendResponse({ success: true }));
        return true;

      case 'TRIGGER_INJECT_PICKER':
        openContextPicker().then(() => sendResponse({ success: true }));
        return true;

      case 'INJECT_TEXT': {
        const platform = getCurrentPlatformInstance();
        if (!platform || !message.text) {
          sendResponse({ success: false, error: 'No platform or text' });
          break;
        }
        platform.injectText(message.text).then((ok) => sendResponse({ success: ok }));
        return true;
      }

      case 'SETTINGS_UPDATED':
        // Re-initialize to pick up new settings (e.g. button position change)
        teardown();
        initialize();
        sendResponse({ success: true });
        break;
    }

    return false;
  }
);

// ──────────────────────────────────────────────────────────────────────────────
// Boot
// ──────────────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
