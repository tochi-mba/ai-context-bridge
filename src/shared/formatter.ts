import type { ChatContext, ChatMessage } from './types.js';
import { PLATFORM_DISPLAY_NAMES } from './constants.js';

export type InjectionFormat = 'verbose' | 'compact';

/**
 * Formats a ChatContext into a string ready to be injected into an AI chat input.
 * The format is designed to be self-explanatory to the receiving AI model.
 */
export function formatContextForInjection(
  context: ChatContext,
  format: InjectionFormat = 'verbose'
): string {
  const platformName = PLATFORM_DISPLAY_NAMES[context.sourcePlatform] ?? context.sourcePlatform;
  const savedDate = new Date(context.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const warnings: string[] = [];
  if (context.metadata.hasImages) {
    warnings.push('⚠️ Note: The original conversation contained images that could not be transferred.');
  }
  if (context.metadata.hasFiles) {
    warnings.push('⚠️ Note: The original conversation had file attachments that could not be transferred.');
  }

  if (format === 'compact') {
    return buildCompactFormat(context.messages, platformName, savedDate, warnings);
  }
  return buildVerboseFormat(context, platformName, savedDate, warnings);
}

function buildVerboseFormat(
  context: ChatContext,
  platformName: string,
  savedDate: string,
  warnings: string[]
): string {
  const lines: string[] = [];

  lines.push(`[AI Context Bridge — Transferred from ${platformName}]`);

  const meta: string[] = [];
  if (context.metadata.model) meta.push(`Model: ${context.metadata.model}`);
  meta.push(`Messages: ${context.messageCount}`);
  meta.push(`Saved: ${savedDate}`);
  lines.push(meta.join(' | '));

  if (warnings.length > 0) {
    lines.push('');
    lines.push(...warnings);
  }

  lines.push('');
  lines.push('--- BEGIN CONTEXT ---');
  lines.push('');

  for (const msg of context.messages) {
    const label = roleLabel(msg.role);
    lines.push(`${label}: ${msg.content}`);
    lines.push('');
  }

  lines.push('--- END CONTEXT ---');
  lines.push('');
  lines.push(
    'Please treat the above as our prior conversation history and continue from where we left off.'
  );

  return lines.join('\n');
}

function buildCompactFormat(
  messages: ChatMessage[],
  platformName: string,
  savedDate: string,
  warnings: string[]
): string {
  const lines: string[] = [];

  lines.push(`[Context from ${platformName} — ${savedDate}]`);

  if (warnings.length > 0) {
    lines.push(...warnings);
  }

  for (const msg of messages) {
    const prefix = msg.role === 'user' ? 'Me' : msg.role === 'assistant' ? 'AI' : 'System';
    lines.push(`${prefix}: ${msg.content}`);
  }

  lines.push('[End of context. Please continue our conversation.]');
  return lines.join('\n');
}

function roleLabel(role: ChatMessage['role']): string {
  switch (role) {
    case 'user': return 'Human';
    case 'assistant': return 'Assistant';
    case 'system': return 'System';
  }
}

/** Truncate a formatted string to fit within a character limit, preserving structure. */
export function truncateFormattedContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const suffix = '\n\n[... earlier messages truncated to fit length limit ...]\n\n--- END CONTEXT ---\n\nPlease treat the above as our prior conversation history and continue from where we left off.';
  const available = maxChars - suffix.length;
  if (available <= 0) return text.slice(0, maxChars);

  return text.slice(0, available) + suffix;
}

/** Count approximate tokens (rough estimate: 4 chars ≈ 1 token) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
