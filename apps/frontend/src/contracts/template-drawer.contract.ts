import { z } from 'zod';

export const TemplateDrawerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  language: z.string().min(2),
  status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']),
  qualityRating: z.enum(['GREEN', 'YELLOW', 'RED', 'UNKNOWN']).optional(),
  bodyText: z.string().min(1),
  footerText: z.string().optional(),
  hasPhonePreview: z.boolean().default(true),
});

export type TemplateDrawerData = z.infer<typeof TemplateDrawerSchema>;
