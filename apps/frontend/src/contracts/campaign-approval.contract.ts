import { z } from 'zod';

export const CampaignApprovalInboxSchema = z.object({
  campaignId: z.string().min(1),
  campaignName: z.string().min(1),
  requestedBy: z.string().email(),
  recipientCount: z.number().int().positive(),
  estimatedCostPreGst: z.number().positive(),
  gstRatePercent: z.literal('18%').default('18%'),
  gstAmountInr: z.number().nonnegative(),
  totalCostInr: z.number().positive(),
  actions: z.array(z.enum(['APPROVE', 'REJECT'])).default(['APPROVE', 'REJECT']),
});

export type CampaignApprovalInboxItem = z.infer<typeof CampaignApprovalInboxSchema>;
