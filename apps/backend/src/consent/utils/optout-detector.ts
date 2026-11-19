/**
 * Inbound opt-out keyword detection.
 * Supports standard English and Hindi opt-out trigger keywords.
 */
export const OPT_OUT_KEYWORDS = [
  'STOP',
  'UNSUBSCRIBE',
  'OPT OUT',
  'OPTOUT',
  'CANCEL',
  'रुकें',
] as const;

/**
 * Checks whether an inbound message text matches any configured opt-out keyword.
 * Case-insensitive, trimmed, boundary-punctuation stripped, and hyphens normalized.
 */
export function isOptOutKeyword(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const normalized = text
    .trim()
    .toUpperCase()
    .replace(/^[\s.,!?;:]+|[\s.,!?;:]+$/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return OPT_OUT_KEYWORDS.some((kw) => kw === normalized);
}
