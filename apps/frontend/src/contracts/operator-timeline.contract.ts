import { z } from 'zod';

export const TimelineMessageSchema = z.object({
  id: z.string().min(1),
  metaMessageId: z.string().optional(),
  bodyText: z.string(),
  deliveryStatus: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNDELIVERABLE']),
  dispatchedAt: z.union([z.string(), z.date()]),
  costInr: z.number().optional(),
});

export const TimelineConversationContractSchema = z.object({
  messagesPerPage: z.literal(25).default(25),
  infiniteScroll: z.boolean().default(true),
  showsDeliveryStatusTicks: z.boolean().default(true),
  messages: z.array(TimelineMessageSchema).max(25).optional(),
});

export const SearchBoxContract = {
  placeholder: 'Search clients by name, phone (+91), or email...',
  debounceMs: 250,
  targetLatencyMs: 500,
  minQueryLength: 2,
};
