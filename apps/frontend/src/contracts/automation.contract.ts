import { z } from 'zod';

export const ManualTriggerContractSchema = z.object({
  action: z.literal('TRIGGER_WORKFLOW_NOW'),
  workflowId: z.string().min(1),
  requiresConfirmation: z.literal(true),
  feedbackToast: z.string().min(1),
});

export const ExecutionHistoryColumns = [
  'Execution ID',
  'Workflow',
  'Status',
  'Clients Processed',
  'Messages Queued',
  'Started At',
  'Completed At',
] as const;

export const ExecutionHistoryTableSchema = z.object({
  executionId: z.string().min(1),
  workflowName: z.string().min(1),
  status: z.enum(['SUCCESS', 'RUNNING', 'ERROR', 'CANCELLED']),
  clientsProcessed: z.number().int().nonnegative(),
  messagesQueued: z.number().int().nonnegative(),
  startedAt: z.union([z.string(), z.date()]),
  completedAt: z.union([z.string(), z.date()]).optional(),
});
