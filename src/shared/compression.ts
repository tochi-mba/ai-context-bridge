/**
 * Thin wrapper around lz-string for compressing/decompressing chat context data.
 * We use compressToUTF16 because Chrome storage stores strings as UTF-16,
 * making this the most space-efficient option for chrome.storage.local.
 */
import LZString from 'lz-string';
import type { ChatMessage } from './types.js';

export function compressMessages(messages: ChatMessage[]): string {
  const json = JSON.stringify(messages);
  return LZString.compressToUTF16(json);
}

export function decompressMessages(compressed: string): ChatMessage[] {
  const json = LZString.decompressFromUTF16(compressed);
  if (!json) {
    throw new Error('Failed to decompress messages — data may be corrupted.');
  }
  return JSON.parse(json) as ChatMessage[];
}

export function compressString(str: string): string {
  return LZString.compressToUTF16(str);
}

export function decompressString(compressed: string): string {
  const result = LZString.decompressFromUTF16(compressed);
  if (result === null) {
    throw new Error('Decompression returned null — data may be corrupted.');
  }
  return result;
}

/** Estimate savings ratio. Returns a number 0–1 (1 = no compression possible). */
export function estimateCompressionRatio(original: string): number {
  const compressed = LZString.compressToUTF16(original);
  // UTF-16 stores 2 bytes per char; calculate effective byte ratio
  const originalBytes = original.length * 2;
  const compressedBytes = compressed.length * 2;
  return compressedBytes / originalBytes;
}
