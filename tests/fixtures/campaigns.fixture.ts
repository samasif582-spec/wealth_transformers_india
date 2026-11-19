export interface CampaignWizardPayload {
  step1: {
    name: string;
    campaignType: 'PROMOTIONAL' | 'ANNOUNCEMENT' | 'FESTIVAL' | 'BIRTHDAY' | 'ANNIVERSARY' | 'SERVICE_NOTIFICATION';
    description?: string;
  };
  step2: {
    templateId: string;
    templateVersionId?: string;
    variableMapping: Record<string, string>;
  };
  step3: {
    segmentFilter: {
      categoryTiers?: Array<'RETAIL' | 'HNI' | 'CORPORATE' | 'PROSPECT'>;
      tags?: string[];
      preferredLanguages?: string[];
      requireConsent?: boolean;
    };
  };
  step4: {
    scheduledAt?: string;
    dispatchRatePerSecond?: number;
  };
  step5: {
    estimatedRecipientCount: number;
    estimatedCostInr: number;
    acknowledgedGst: boolean;
  };
}

export const SAMPLE_WIZARD_PAYLOAD: CampaignWizardPayload = {
  step1: {
    name: 'TEST_Diwali_Wealth_Advisory_2026',
    campaignType: 'PROMOTIONAL',
    description: 'Exclusive Diwali equity wealth baskets for HNI and Corporate clients',
  },
  step2: {
    templateId: '00000000-0000-0000-0000-000000000101',
    variableMapping: {
      '1': 'client.fullName',
      '2': '2026-11-20',
    },
  },
  step3: {
    segmentFilter: {
      categoryTiers: ['HNI', 'CORPORATE'],
      tags: ['Equity', 'HNI_Active'],
      preferredLanguages: ['en', 'hi'],
      requireConsent: true,
    },
  },
  step4: {
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    dispatchRatePerSecond: 80,
  },
  step5: {
    estimatedRecipientCount: 1500,
    estimatedCostInr: 1390.158, // 1500 * 0.7854 * 1.18
    acknowledgedGst: true,
  },
};

export const GST_RATE = 0.18;

export const META_PRICING_RATES = {
  MARKETING: 0.7854,
  UTILITY: 0.1258,
  AUTHENTICATION: 0.1258,
};

export interface PricingTestVector {
  description: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  recipients: number;
  expectedRatePerMsg: number;
  expectedPreGstCost: number;
  expectedGstAmount: number;
  expectedTotalCost: number;
}

export function computeCampaignCost(recipients: number, category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION') {
  const rate = META_PRICING_RATES[category];
  const preGst = recipients * rate;
  const gstAmount = preGst * GST_RATE;
  const totalCost = preGst + gstAmount;

  return {
    rate,
    preGst: Number(preGst.toFixed(4)),
    gstAmount: Number(gstAmount.toFixed(4)),
    totalCost: Number(totalCost.toFixed(4)),
  };
}

export const CAMPAIGN_PRICING_TEST_VECTORS: PricingTestVector[] = [
  {
    description: 'Single recipient Marketing broadcast',
    category: 'MARKETING',
    recipients: 1,
    expectedRatePerMsg: 0.7854,
    expectedPreGstCost: 0.7854,
    expectedGstAmount: 0.1414,
    expectedTotalCost: 0.9268,
  },
  {
    description: '100 recipients Marketing campaign',
    category: 'MARKETING',
    recipients: 100,
    expectedRatePerMsg: 0.7854,
    expectedPreGstCost: 78.54,
    expectedGstAmount: 14.1372,
    expectedTotalCost: 92.6772,
  },
  {
    description: '10,000 recipients large scale broadcast',
    category: 'MARKETING',
    recipients: 10000,
    expectedRatePerMsg: 0.7854,
    expectedPreGstCost: 7854.0,
    expectedGstAmount: 1413.72,
    expectedTotalCost: 9267.72,
  },
  {
    description: '500 recipients Utility notification',
    category: 'UTILITY',
    recipients: 500,
    expectedRatePerMsg: 0.1258,
    expectedPreGstCost: 62.9,
    expectedGstAmount: 11.322,
    expectedTotalCost: 74.222,
  },
  {
    description: '0 recipients boundary case',
    category: 'MARKETING',
    recipients: 0,
    expectedRatePerMsg: 0.7854,
    expectedPreGstCost: 0.0,
    expectedGstAmount: 0.0,
    expectedTotalCost: 0.0,
  },
];
