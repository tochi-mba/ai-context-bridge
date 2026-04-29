/**
 * ChatGPT extractor tests.
 * Fixture: real ChatGPT DOM with 2 user + 2 assistant messages.
 *   - Turn 1 (user): "hi"
 *   - Turn 2 (assistant): response from gpt-5-3
 *   - Turn 3 (user): "whats ur name and how are u doing? do u like fish? cna ai like stuff?"
 *   - Turn 4 (assistant): response
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeEach } from 'vitest';
import { ChatGPTPlatform } from '../../src/content-scripts/platforms/chatgpt.js';

const FIXTURE = readFileSync(resolve(__dirname, '../fixtures/chatgpt.html'), 'utf-8');

function loadFixture() {
  document.body.innerHTML = FIXTURE;
}

describe('ChatGPTPlatform', () => {
  let platform: ChatGPTPlatform;

  beforeEach(() => {
    loadFixture();
    platform = new ChatGPTPlatform();
  });

  // ── Identity ────────────────────────────────────────────────────────────────
  it('has id "chatgpt"', () => {
    expect(platform.id).toBe('chatgpt');
  });

  it('has name "ChatGPT"', () => {
    expect(platform.name).toBe('ChatGPT');
  });

  // ── Message extraction ──────────────────────────────────────────────────────
  it('extracts at least one message', () => {
    const result = platform.extractMessages();
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it('extracts 4 messages from the fixture (2 user + 2 assistant)', () => {
    const result = platform.extractMessages();
    expect(result.messages).toHaveLength(4);
  });

  it('first message is a user message', () => {
    const result = platform.extractMessages();
    expect(result.messages[0]!.role).toBe('user');
  });

  it('second message is an assistant message', () => {
    const result = platform.extractMessages();
    expect(result.messages[1]!.role).toBe('assistant');
  });

  it('alternates between user and assistant', () => {
    const result = platform.extractMessages();
    const roles = result.messages.map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('first user message is "hi"', () => {
    const result = platform.extractMessages();
    expect(result.messages[0]!.content.toLowerCase()).toContain('hi');
  });

  it('third message is a user message asking about name/fish', () => {
    const result = platform.extractMessages();
    expect(result.messages[2]!.role).toBe('user');
    expect(result.messages[2]!.content.toLowerCase()).toMatch(/name|fish/);
  });

  it('all messages have non-empty content', () => {
    const result = platform.extractMessages();
    for (const msg of result.messages) {
      expect(msg.content.length).toBeGreaterThan(0);
    }
  });

  it('does not report images when none present', () => {
    const result = platform.extractMessages();
    expect(result.hasImages).toBe(false);
  });

  it('reports hasImages true when img tag is present in a message', () => {
    const turn = document.querySelector('[data-testid="conversation-turn-2"]');
    if (turn) {
      const img = document.createElement('img');
      img.src = 'https://example.com/image.png';
      img.alt = 'diagram';
      turn.appendChild(img);
    }
    const result = platform.extractMessages();
    expect(result.hasImages).toBe(true);
  });

  it('produces no error string when messages are found', () => {
    const result = platform.extractMessages();
    expect(result.error).toBeUndefined();
  });

  it('produces an error string when DOM is empty', () => {
    document.body.innerHTML = '<main></main>';
    const result = platform.extractMessages();
    expect(result.error).toBeTruthy();
    expect(result.messages).toHaveLength(0);
  });

  // ── Model detection ─────────────────────────────────────────────────────────
  it('detects model slug from assistant message data attribute', () => {
    const model = platform.detectModel();
    // The fixture has data-message-model-slug="gpt-5-3" on the assistant message
    expect(model).toBeTruthy();
    expect(typeof model).toBe('string');
  });

  it('returns undefined when model selector is absent', () => {
    // Remove data-message-model-slug attributes and the model switcher button
    document.querySelectorAll('[data-message-model-slug]').forEach((el) =>
      el.removeAttribute('data-message-model-slug')
    );
    document.querySelector('[data-testid="model-switcher-dropdown-button"]')?.remove();
    expect(platform.detectModel()).toBeUndefined();
  });

  // ── Input element ───────────────────────────────────────────────────────────
  it('finds the text input element', () => {
    const input = platform.getInputElement();
    expect(input).not.toBeNull();
  });

  it('input element is the prompt-textarea ProseMirror div', () => {
    const input = platform.getInputElement();
    expect(input?.id).toBe('prompt-textarea');
  });

  it('returns null when all input elements are absent', () => {
    // Remove both the ProseMirror div AND the hidden fallback textarea
    document.getElementById('prompt-textarea')?.remove();
    document.querySelectorAll(
      'textarea[name="prompt-textarea"], [contenteditable="true"].ProseMirror, textarea[placeholder*="Ask"]'
    ).forEach((el) => el.remove());
    expect(platform.getInputElement()).toBeNull();
  });

  // ── Streaming detection ─────────────────────────────────────────────────────
  it('returns false for streaming when no stop button is present', () => {
    expect(platform.isStreamingActive()).toBe(false);
  });

  it('returns true for streaming when stop button is present and visible', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'stop-button');
    btn.style.width = '50px';
    btn.style.height = '30px';
    document.body.appendChild(btn);
    expect(platform.isStreamingActive()).toBe(true);
  });
});
