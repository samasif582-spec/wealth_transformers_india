/**
 * Utility for scrubbing PII (phones, emails) from logs, errors, and external monitors.
 */
export function scrubPiiFromErrorDetails(details: string): string {
  if (!details || typeof details !== 'string') return details;
  let scrubbed = details.replace(/\+?[0-9]{10,15}/g, '[REDACTED_PHONE]');
  scrubbed = scrubbed.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
  return scrubbed;
}
