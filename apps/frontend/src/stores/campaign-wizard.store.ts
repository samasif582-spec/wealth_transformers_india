import { create } from 'zustand';

export type WizardStepId = 1 | 2 | 3 | 4 | 5;

export const WIZARD_STEPS = [
  { id: 1, name: 'Template Selection' },
  { id: 2, name: 'Audience Resolution' },
  { id: 3, name: 'Variable Mapping' },
  { id: 4, name: 'Schedule & Rate Limit' },
  { id: 5, name: 'Review & Cost Confirmation' },
] as const;

export interface WizardPricing {
  ratePerMessage: number;
  preGstCost: number;
  gstAmount: number;
  totalCost: number;
}

export function calculateFinalPricing(recipientCount: number, rate = 0.7854): WizardPricing {
  const preGstCost = Math.round(recipientCount * rate * 1000) / 1000;
  const gstAmount = Math.round(preGstCost * 0.18 * 1000) / 1000;
  const totalCost = Math.round((preGstCost + gstAmount) * 1000) / 1000;
  return {
    ratePerMessage: rate,
    preGstCost,
    gstAmount,
    totalCost,
  };
}

export interface WizardState {
  currentStep: WizardStepId;
  direction: -1 | 1;
  templateId?: string;
  templateCategory?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  targetCategoryTier?: 'HNI' | 'RETAIL' | 'CORPORATE' | 'PROSPECT' | 'ALL';
  resolvedRecipientCount: number;
  variableMappings: Record<string, string>;
  scheduledTime?: string;
  rateLimitPerSec: number;
  pricing: WizardPricing;
  setTemplate: (id: string, category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION') => void;
  setAudienceCount: (count: number) => void;
  nextStep: () => boolean;
  prevStep: () => boolean;
  reset: () => void;
}

const initialPricing: WizardPricing = {
  ratePerMessage: 0,
  preGstCost: 0,
  gstAmount: 0,
  totalCost: 0,
};

export const useCampaignWizardStore = create<WizardState>((set: any, get: any) => ({
  currentStep: 1,
  direction: 1,
  templateId: undefined,
  templateCategory: undefined,
  targetCategoryTier: undefined,
  resolvedRecipientCount: 0,
  variableMappings: {},
  scheduledTime: undefined,
  rateLimitPerSec: 80,
  pricing: initialPricing,

  setTemplate: (id: string, category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION') =>
    set({
      templateId: id,
      templateCategory: category,
      pricing: calculateFinalPricing(get().resolvedRecipientCount, category === 'UTILITY' ? 0.1258 : 0.7854),
    }),

  setAudienceCount: (count: number) =>
    set({
      resolvedRecipientCount: count,
      pricing: calculateFinalPricing(count, get().templateCategory === 'UTILITY' ? 0.1258 : 0.7854),
    }),

  nextStep: () => {
    const state = get();
    if (state.currentStep === 1) {
      if (!state.templateId || !state.templateCategory) return false;
      set({ currentStep: 2, direction: 1 });
      return true;
    }
    if (state.currentStep === 2) {
      if (state.resolvedRecipientCount <= 0) return false;
      set({ currentStep: 3, direction: 1 });
      return true;
    }
    if (state.currentStep === 3) {
      set({ currentStep: 4, direction: 1 });
      return true;
    }
    if (state.currentStep === 4) {
      const rate = state.templateCategory === 'UTILITY' ? 0.1258 : 0.7854;
      set({
        currentStep: 5,
        direction: 1,
        pricing: calculateFinalPricing(state.resolvedRecipientCount, rate),
      });
      return true;
    }
    return false;
  },

  prevStep: () => {
    const state = get();
    if (state.currentStep > 1) {
      const nextStep = (state.currentStep - 1) as WizardStepId;
      set({ currentStep: nextStep, direction: -1 });
      return true;
    }
    return false;
  },

  reset: () =>
    set({
      currentStep: 1,
      direction: 1,
      templateId: undefined,
      templateCategory: undefined,
      targetCategoryTier: undefined,
      resolvedRecipientCount: 0,
      variableMappings: {},
      scheduledTime: undefined,
      rateLimitPerSec: 80,
      pricing: initialPricing,
    }),
}));
