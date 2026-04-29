/**
 * Perplexity extractor tests.
 * Fixture: real Perplexity DOM with 1 user + 1 assistant message.
 *   - User query: "hey what can u do and who are u" (in h1 > div > span bubble)
 *   - AI answer: starts with "I'm Perplexity, an AI assistant..." (in #markdown-content-0)
 *   - Model: generic "Model" button (no specific model name returned)
 *   - Input: #ask-input (Lexical contenteditable, NOT a textarea)
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeEach } from 'vitest';
import { PerplexityPlatform } from '../../src/content-scripts/platforms/perplexity.js';

const FIXTURE = readFileSync(resolve(__dirname, '../fixtures/perplexity.html'), 'utf-8');

describe('PerplexityPlatform', () => {
  let platform: PerplexityPlatform;

  beforeEach(() => {
    document.body.innerHTML = FIXTURE;
    platform = new PerplexityPlatform();
  });

  // ── Identity ────────────────────────────────────────────────────────────────
  it('has id "perplexity"', () => expect(platform.id).toBe('perplexity'));
  it('has name "Perplexity"', () => expect(platform.name).toBe('Perplexity'));

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

  it('user message contains the query text', () => {
    const { messages } = platform.extractMessages();
    // "hey what can u do and who are u"
    expect(messages[0]!.content.toLowerCase()).toMatch(/hey|what|do|who/);
  });

  it('assistant message contains meaningful content', () => {
    const { messages } = platform.extractMessages();
    const assistantMsg = messages.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content.length).toBeGreaterThan(10);
  });

  it('assistant message mentions Perplexity as its identity', () => {
    const { messages } = platform.extractMessages();
    const assistantMsg = messages.find((m) => m.role === 'assistant');
    expect(assistantMsg?.content).toContain('Perplexity');
  });

  it('returns no error when messages found', () => {
    expect(platform.extractMessages().error).toBeUndefined();
  });

  it('returns error when DOM has no messages', () => {
    document.body.innerHTML = '<div></div>';
    const result = platform.extractMessages();
    expect(result.error).toBeTruthy();
  });

  // ── Model detection ─────────────────────────────────────────────────────────
  it('returns undefined when model button only shows generic "Model" label', () => {
    // The fixture only has a generic "Model" button — no specific model name
    const model = platform.detectModel();
    expect(model).toBeUndefined();
  });

  it('returns model name when specific model text is present', () => {
    // Replace existing "Model" buttons with one containing a real model name
    document.querySelectorAll('button[aria-label="Model"]').forEach((el) => el.remove());
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Model');
    btn.textContent = 'Sonar Pro';
    document.body.appendChild(btn);
    const model = platform.detectModel();
    expect(model).toBe('Sonar Pro');
  });

  // ── Input element ───────────────────────────────────────────────────────────
  it('finds the ask-input Lexical editor', () => {
    expect(platform.getInputElement()).not.toBeNull();
  });

  it('input is #ask-input (Lexical contenteditable)', () => {
    const input = platform.getInputElement();
    expect(input?.id).toBe('ask-input');
  });

  it('returns null when ask-input and all contenteditable inputs are absent', () => {
    document.getElementById('ask-input')?.remove();
    document.querySelectorAll('[data-lexical-editor], [contenteditable="true"]').forEach((el) =>
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
    el.style.width = '30px';
    el.style.height = '30px';
    document.body.appendChild(el);
    expect(platform.isStreamingActive()).toBe(true);
  });
});
