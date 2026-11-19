import { z } from 'zod';

export const ManualConsentReasonSchema = z
  .string()
  .min(1, 'Reason is mandatory')
  .max(500, 'Reason exceeds 500 characters');

export function validateManualConsentReason(reason?: string): { valid: boolean; error?: string } {
  const result = ManualConsentReasonSchema.safeParse(reason?.trim());
  if (!result.success) {
    return { valid: false, error: result.error.errors[0]?.message };
  }
  return { valid: true };
}
