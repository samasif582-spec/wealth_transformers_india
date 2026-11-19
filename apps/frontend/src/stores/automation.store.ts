import { create } from 'zustand';

export type WorkflowStatus = 'ACTIVE' | 'INACTIVE';

export interface WorkflowCard {
  id: string;
  name: string;
  cron?: string;
  status: WorkflowStatus;
}

export const INITIAL_WORKFLOWS: WorkflowCard[] = [
  { id: '01-birthday-automation', name: 'Birthday Automation', cron: '0 9 * * *', status: 'ACTIVE' },
  { id: '02-anniversary-automation', name: 'Anniversary Automation', cron: '0 9 * * *', status: 'ACTIVE' },
  { id: '03-festival-dispatch', name: 'Festival Dispatch', cron: 'manual/calendar', status: 'ACTIVE' },
  { id: '04-campaign-execution', name: 'Campaign Execution', cron: 'event-driven', status: 'ACTIVE' },
  { id: '05-delivery-status', name: 'Delivery Status Processor', cron: 'webhook-driven', status: 'ACTIVE' },
  { id: '06-opt-out', name: 'Opt-Out Worker', cron: 'sub-60s webhook', status: 'ACTIVE' },
  { id: '07-template-quality', name: 'Template Quality Monitor', cron: '30 7 * * *', status: 'ACTIVE' },
  { id: '08-error-handler', name: 'Central Error Router', cron: 'catch-all', status: 'ACTIVE' },
];

interface AutomationState {
  workflows: WorkflowCard[];
  toggleWorkflow: (id: string) => void;
  setWorkflowStatus: (id: string, status: WorkflowStatus) => void;
  triggerManualRun: (id: string) => Promise<{ executionId: string; status: string }>;
}

export const useAutomationStore = create<AutomationState>((set: any, get: any) => ({
  workflows: INITIAL_WORKFLOWS,
  toggleWorkflow: (id: string) =>
    set((state: AutomationState) => ({
      workflows: state.workflows.map((w: WorkflowCard) =>
        w.id === id ? { ...w, status: w.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } : w,
      ),
    })),
  setWorkflowStatus: (id: string, status: WorkflowStatus) =>
    set((state: AutomationState) => ({
      workflows: state.workflows.map((w: WorkflowCard) => (w.id === id ? { ...w, status } : w)),
    })),
  triggerManualRun: async (id: string) => {
    return {
      executionId: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: 'QUEUED',
    };
  },
}));
