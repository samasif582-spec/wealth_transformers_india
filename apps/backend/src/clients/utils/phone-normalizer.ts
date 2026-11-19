import { parsePhoneNumberFromString } from 'libphonenumber-js';

export interface PhoneNormalizationResult {
  valid: boolean;
  e164?: string;
  error?: string;
}

/**
 * Normalizes a phone number into strict E.164 format.
 * Implements platform phone normalization contract using libphonenumber-js.
 *
 * @param input Raw phone number string
 * @param defaultCountry Default two-letter ISO country code (e.g. 'IN')
 */
export function normalizeToE164(
  input: string,
  defaultCountry = 'IN',
): PhoneNormalizationResult {
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'Phone number cannot be empty' };
  }

  const trimmed = input.trim();

  // Reject numbers containing spaces, hyphens, tabs, newlines, or letters
  if (/[ \-\t\r\na-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      error: `Phone number contains disallowed formatting or letters: ${input}`,
    };
  }

  // If no defaultCountry is provided and no +, reject
  if (!defaultCountry && !trimmed.startsWith('+')) {
    return { valid: false, error: 'Missing country code prefix +' };
  }

  const parsed = parsePhoneNumberFromString(
    trimmed,
    (defaultCountry || undefined) as any,
  );

  if (!parsed || !parsed.isValid()) {
    return { valid: false, error: `Invalid phone number format: ${input}` };
  }

  return { valid: true, e164: parsed.format('E.164') };
}
