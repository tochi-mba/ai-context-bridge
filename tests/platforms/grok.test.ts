/**
 * Grok extractor tests.
 * Fixture: real Grok DOM with 1 user + 1 assistant message.
 *   - User: "hi who are u?" (in div[id^="response-"][items-end] .response-content-markdown)
 *   - Assistant: "Hey! I'm Grok, an AI built by xAI." (in div[id^="response-"][items-start])
 *   - Model: "Auto" (from #model-select-trigger span.truncate)
 *   - Input: div.tiptap.ProseMirror inside .query-bar
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeEach } from 'vitest';
import { GrokPlatform } from '../../src/content-scripts/platforms/grok.js';

const FIXTURE = readFileSync(resolve(__dirname, '../fixtures/grok.html'), 'utf-8');

describe('GrokPlatform', () => {
  let platform: GrokPlatform;

  beforeEach(() => {
    document.body.innerHTML = FIXTURE;
    platform = new GrokPlatform();
  });

  // ── Identity ────────────────────────────────────────────────────────────────
  it('has id "grok"', () => expect(platform.id).toBe('grok'));
  it('has name "Grok"', () => expect(platform.name).toBe('Grok'));

  // ── Message extraction ──────────────────────────────────────────────────────
  it('extracts messages', () => {
    const result = platform.extractMessages();
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it('extracts 2 messages (1 user + 1 assistant)', () => {
    const result = platform.extractMessages();
    expect(result.messages).toHaveLength(2);
  });

  it('first message is a user message', () => {
    expect(platform.extractMessages().messages[0]!.role).toBe('user');
  });

  it('second message is an assistant message', () => {
    expect(platform.extractMessages().messages[1]!.role).toBe('assistant');
  });

  it('user message contains "hi who are u"', () => {
    const { messages } = platform.extractMessages();
    expect(messages[0]!.content.toLowerCase()).toMatch(/hi|who/);
  });

  it('assistant message mentions xAI', () => {
    const { messages } = platform.extractMessages();
    expect(messages[1]!.content).toContain('xAI');
  });

  it('assistant message mentions Grok', () => {
    const { messages } = platform.extractMessages();
    expect(messages[1]!.content).toContain('Grok');
  });

  it('all messages have non-empty content', () => {
    const result = platform.extractMessages();
    for (const msg of result.messages) {
      expect(msg.content.length).toBeGreaterThan(0);
    }
  });

  it('returns no error when messages found', () => {
    expect(platform.extractMessages().error).toBeUndefined();
  });

  it('returns error when DOM has no messages', () => {
    document.body.innerHTML = '<div></div>';
    const result = platform.extractMessages();
    expect(result.error).toBeTruthy();
  });

  it('does not report images when none present', () => {
    expect(platform.extractMessages().hasImages).toBe(false);
  });

  // ── Model detection ─────────────────────────────────────────────────────────
  it('detects model name "Auto" from model-select-trigger', () => {
    const model = platform.detectModel();
    // The fixture shows "Auto" in #model-select-trigger span.truncate
    expect(model).toBe('Auto');
  });

  it('returns undefined when model select trigger is absent', () => {
    document.getElementById('model-select-trigger')?.remove();
    document.querySelectorAll('[data-query-bar-mode-select]').forEach((el) => el.remove());
    expect(platform.detectModel()).toBeUndefined();
  });

  // ── Input element ───────────────────────────────────────────────────────────
  it('finds the TipTap compose input inside query-bar', () => {
    expect(platform.getInputElement()).not.toBeNull();
  });

  it('input is a contenteditable tiptap ProseMirror', () => {
    const input = platform.getInputElement();
    const isTipTap =
      input?.classList.contains('tiptap') || input?.classList.contains('ProseMirror');
    expect(input?.getAttribute('contenteditable')).toBe('true');
    expect(isTipTap).toBe(true);
  });

  it('returns null when query-bar and all contenteditable inputs are absent', () => {
    document.querySelector('.query-bar')?.remove();
    document.querySelectorAll('.tiptap, .ProseMirror, [contenteditable="true"]').forEach((el) =>
      el.remove()
    );
    expect(platform.getInputElement()).toBeNull();
  });

  // ── Streaming ───────────────────────────────────────────────────────────────
  it('returns false when not streaming', () => {
    expect(platform.isStreamingActive()).toBe(false);
  });

  it('returns true when loading indicator present and visible', () => {
    const el = document.createElement('div');
    el.className = 'loading';
    el.style.width = '20px';
    el.style.height = '20px';
    document.body.appendChild(el);
    expect(platform.isStreamingActive()).toBe(true);
  });
});
