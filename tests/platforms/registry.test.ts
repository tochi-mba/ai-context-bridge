import { describe, it, expect, beforeEach } from 'vitest';
import { detectCurrentPlatform } from '../../src/content-scripts/platforms/registry.js';

/**
 * Helper — override window.location.hostname in jsdom.
 * jsdom doesn't allow direct `window.location = ...` assignment,
 * so we use Object.defineProperty on the location object.
 */
function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, hostname },
    writable: true,
    configurable: true,
  });
}

describe('detectCurrentPlatform', () => {
  beforeEach(() => {
    setHostname('localhost');
  });

  it('detects chat.openai.com as chatgpt', () => {
    setHostname('chat.openai.com');
    expect(detectCurrentPlatform()).toBe('chatgpt');
  });

  it('detects chatgpt.com as chatgpt', () => {
    setHostname('chatgpt.com');
    expect(detectCurrentPlatform()).toBe('chatgpt');
  });

  it('detects claude.ai as claude', () => {
    setHostname('claude.ai');
    expect(detectCurrentPlatform()).toBe('claude');
  });

  it('detects gemini.google.com as gemini', () => {
    setHostname('gemini.google.com');
    expect(detectCurrentPlatform()).toBe('gemini');
  });

  it('detects perplexity.ai as perplexity', () => {
    setHostname('perplexity.ai');
    expect(detectCurrentPlatform()).toBe('perplexity');
  });

  it('detects www.perplexity.ai as perplexity', () => {
    setHostname('www.perplexity.ai');
    expect(detectCurrentPlatform()).toBe('perplexity');
  });

  it('detects grok.com as grok', () => {
    setHostname('grok.com');
    expect(detectCurrentPlatform()).toBe('grok');
  });

  it('detects x.com as grok', () => {
    setHostname('x.com');
    expect(detectCurrentPlatform()).toBe('grok');
  });

  it('returns null for unknown hostname', () => {
    setHostname('google.com');
    expect(detectCurrentPlatform()).toBeNull();
  });

  it('returns null for localhost', () => {
    setHostname('localhost');
    expect(detectCurrentPlatform()).toBeNull();
  });

  it('returns null for empty hostname', () => {
    setHostname('');
    expect(detectCurrentPlatform()).toBeNull();
  });

  it('returns null for a similar-looking but unsupported domain', () => {
    setHostname('notchatgpt.com');
    expect(detectCurrentPlatform()).toBeNull();
  });
});
