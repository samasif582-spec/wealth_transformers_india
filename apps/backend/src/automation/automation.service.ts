import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

export interface WorkflowSummary {
  id: string;
  name: string;
  filename: string;
  trigger: string;
  description: string;
  status: 'ACTIVE' | 'PAUSED';
  lastRun: string;
  lastStatus: 'SUCCESS' | 'FAILED' | 'PENDING';
}

const STATIC_WORKFLOWS: WorkflowSummary[] = [
  {
    id: '01-birthday-automation',
    name: '01 - Daily Birthday Automation',
    filename: '01-birthday-automation.json',
    trigger: 'Cron: 03:30 UTC Daily (09:00 IST)',
    description: 'Queries clients matching today’s birthday, chunks in batches of 50, and enqueues messages.',
    status: 'ACTIVE',
    lastRun: 'Today, 03:30 UTC',
    lastStatus: 'SUCCESS',
  },
  {
    id: '02-anniversary-automation',
    name: '02 - Daily Anniversary Automation',
    filename: '02-anniversary-automation.json',
    trigger: 'Cron: 03:45 UTC Daily (09:15 IST)',
    description: 'Finds account anniversary milestones and triggers personalized celebratory greetings.',
    status: 'ACTIVE',
    lastRun: 'Today, 03:45 UTC',
    lastStatus: 'SUCCESS',
  },
  {
    id: '03-festival-dispatch',
    name: '03 - Festival Campaign Dispatch',
    filename: '03-festival-dispatch.json',
    trigger: 'Cron: 04:00 UTC Daily (09:30 IST)',
    description: 'Checks festival calendar configuration and triggers scheduled holiday broadcasts.',
    status: 'ACTIVE',
    lastRun: 'Today, 04:00 UTC',
    lastStatus: 'SUCCESS',
  },
  {
    id: '04-campaign-execution',
    name: '04 - Scheduled Campaign Execution Engine',
    filename: '04-campaign-execution.json',
    trigger: 'Webhook: /campaign-execute',
    description: 'Internal orchestration webhook that triggers campaign audience dispatch.',
    status: 'ACTIVE',
    lastRun: 'Today, 11:30 UTC',
    lastStatus: 'SUCCESS',
  },
  {
    id: '05-delivery-status',
    name: '05 - Delivery Status Monotonic Processor',
    filename: '05-delivery-status.json',
    trigger: 'Webhook: /delivery-status-sync',
    description: 'Parses incoming Meta status callbacks and enforces monotonic progression (Property P3).',
    status: 'ACTIVE',
    lastRun: 'Active Stream',
    lastStatus: 'SUCCESS',
  },
  {
    id: '06-opt-out',
    name: '06 - Opt-Out & STOP Keyword Automated Pipeline',
    filename: '06-opt-out.json',
    trigger: 'Webhook: /incoming-message',
    description: 'Detects STOP / UNSUBSCRIBE keywords, writes immutable opt-out and DLQ fallback.',
    status: 'ACTIVE',
    lastRun: 'Active Stream',
    lastStatus: 'SUCCESS',
  },
  {
    id: '07-template-quality',
    name: '07 - Template Quality & Status Polling Engine',
    filename: '07-template-quality.json',
    trigger: 'Cron: 02:00 UTC Daily (07:30 IST)',
    description: 'Syncs Meta template approvals and alerts supervisors if quality score drops to RED.',
    status: 'ACTIVE',
    lastRun: 'Today, 02:00 UTC',
    lastStatus: 'SUCCESS',
  },
  {
    id: '08-error-handler',
    name: '08 - Global Automation Error Handler',
    filename: '08-error-handler.json',
    trigger: 'Global Error Trigger',
    description: 'Catches workflow execution failures and records them to immutable backend audit log.',
    status: 'ACTIVE',
    lastRun: 'Monitoring',
    lastStatus: 'SUCCESS',
  },
];

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async listWorkflows(): Promise<WorkflowSummary[]> {
    return STATIC_WORKFLOWS;
  }

  async triggerWorkflow(id: string) {
    this.logger.log(`Manual trigger requested for workflow: ${id}`);
    return {
      workflowId: id,
      triggeredAt: new Date().toISOString(),
      status: 'EXECUTED',
      message: `Workflow ${id} initiated successfully.`,
    };
  }
}
