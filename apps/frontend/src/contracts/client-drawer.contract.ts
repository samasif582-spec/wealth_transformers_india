import { z } from 'zod';

export const ClientDrawerSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1),
  whatsappNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Must be valid E.164 phone'),
  email: z.string().email(),
  categoryTier: z.enum(['HNI', 'RETAIL', 'CORPORATE', 'PROSPECT']),
  communicationConsent: z.enum(['OPTED_IN', 'OPTED_OUT', 'PENDING']),
  consentHistoryCount: z.number().int().nonnegative().optional(),
  messageHistoryCount: z.number().int().nonnegative().optional(),
});

export type ClientDrawerData = z.infer<typeof ClientDrawerSchema>;
