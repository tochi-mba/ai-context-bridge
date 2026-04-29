/**
 * Claude extractor tests.
 * Fixture: real Claude DOM with an actual conversation ("hey" / "Hi Tochi! How can I help you today?")
 * Confirmed selectors from live fixture:
 *   User messages  → [data-testid="user-message"]
 *   AI responses   → [data-is-streaming]
 *   Input          → [data-testid="chat-input"]
 *   Model          → [data-testid="model-selector-dropdown"]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudePlatform } from '../../src/content-scripts/platforms/claude.js';

const FIXTURE = readFileSync(resolve(__dirname, '../fixtures/claude.html'), 'utf-8');

describe('ClaudePlatform', () => {
  let platform: ClaudePlatform;

  beforeEach(() => {
    document.body.innerHTML = FIXTURE;
    platform = new ClaudePlatform();
  });

  // ── Identity ────────────────────────────────────────────────────────────────
  it('has id "claude"', () => expect(platform.id).toBe('claude'));
  it('has name "Claude"', () => expect(platform.name).toBe('Claude'));

  // ── Message extraction ───────────────────────────────────────────────────────
  it('extracts 2 messages from the fixture conversation', () => {
    const result = platform.extractMessages();
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
    expect(result.error).toBeUndefined();
  });

  it('first message is from user', () => {
    const result = platform.extractMessages();
    expect(result.messages[0]!.role).toBe('user');
  });

  it('second message is from assistant', () => {
    const result = platform.extractMessages();
    expect(result.messages[1]!.role).toBe('assistant');
  });

  it('user message contains "hey"', () => {
    const result = platform.extractMessages();
    expect(result.messages[0]!.content.toLowerCase()).toMatch(/hey/);
  });

  it('assistant message contains "Hi Tochi"', () => {
    const result = platform.extractMessages();
    const aiMsg = result.messages.find((m) => m.role === 'assistant');
    expect(aiMsg?.content).toMatch(/Hi Tochi/i);
  });

  it('returns error and 0 messages on empty page', () => {
    document.body.innerHTML = '<div></div>';
    const result = platform.extractMessages();
    expect(result.error).toBeTruthy();
    expect(result.messages).toHaveLength(0);
  });

  it('does not report images when no images present', () => {
    expect(platform.extractMessages().hasImages).toBe(false);
  });

  it('reports hasImages when img is inside an assistant element', () => {
    const ai = document.createElement('div');
    ai.setAttribute('data-is-streaming', 'false');
    ai.innerHTML = '<img src="https://example.com/image.png" /><p>Here is an image</p>';
    document.body.appendChild(ai);
    expect(platform.extractMessages().hasImages).toBe(true);
  });

  // ── Model detection ─────────────────────────────────────────────────────────
  it('detects model from model-selector-dropdown', () => {
    const model = platform.detectModel();
    expect(model).toBeTruthy();
    expect(model).toMatch(/Sonnet|Claude|claude/i);
  });

  it('returns undefined when model selector is absent', () => {
    document.querySelector('[data-testid="model-selector-dropdown"]')?.remove();
    expect(platform.detectModel()).toBeUndefined();
  });

  // ── Input element ───────────────────────────────────────────────────────────
  it('finds the TipTap chat input', () => {
    const input = platform.getInputElement();
    expect(input).not.toBeNull();
  });

  it('found input has data-testid="chat-input" or is ProseMirror', () => {
    const input = platform.getInputElement();
    const isChatInput = input?.getAttribute('data-testid') === 'chat-input';
    const isTipTap = input?.classList.contains('tiptap') || input?.classList.contains('ProseMirror');
    expect(isChatInput || isTipTap).toBe(true);
  });

  it('returns null when all input elements are absent', () => {
    document.querySelector('[data-testid="chat-input"]')?.remove();
    document.querySelectorAll('.tiptap, .ProseMirror, [contenteditable="true"]').forEach((el) =>
      el.remove()
    );
    expect(platform.getInputElement()).toBeNull();
  });

  // ── Streaming ───────────────────────────────────────────────────────────────
  it('returns false when not streaming', () => {
    expect(platform.isStreamingActive()).toBe(false);
  });

  it('returns true when data-is-streaming="true" is present', () => {
    const el = document.createElement('div');
    el.setAttribute('data-is-streaming', 'true');
    el.style.cssText = 'width:20px;height:20px;display:block';
    document.body.appendChild(el);
    expect(platform.isStreamingActive()).toBe(true);
  });

  it('returns true when Stop button is visible', () => {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Stop');
    btn.style.cssText = 'width:40px;height:40px;display:block';
    document.body.appendChild(btn);
    expect(platform.isStreamingActive()).toBe(true);
  });
});
