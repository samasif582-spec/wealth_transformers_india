export const SEBI_AMFI_MANDATORY_FOOTER =
  'Wealth Trade Securities Pvt. Ltd. | SEBI Reg: INZ000123456 | AMFI: ARN-98765';

export interface TemplateFixture {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  headerType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerText?: string;
  bodyText: string;
  footerText?: string;
  variableSchema: Record<string, { name: string; example: string }>;
  buttons?: Array<{
    type: 'CALL_TO_ACTION' | 'QUICK_REPLY';
    text: string;
    url?: string;
    phoneNumber?: string;
  }>;
}

export const COMPLIANT_MARKETING_TEMPLATE: TemplateFixture = {
  name: 'test_market_briefing_compliant',
  category: 'MARKETING',
  language: 'en',
  headerType: 'TEXT',
  headerText: 'Daily Market Intelligence',
  bodyText: 'Hello {{1}}, here is your market snapshot for {{2}}. SENSEX is trading at new highs. Explore customized wealth strategies today.',
  footerText: SEBI_AMFI_MANDATORY_FOOTER,
  variableSchema: {
    '1': { name: 'client_name', example: 'Rahul' },
    '2': { name: 'date', example: '19-Nov-2026' },
  },
  buttons: [
    {
      type: 'CALL_TO_ACTION',
      text: 'View Research',
      url: 'https://wealthtrade.in/research',
    },
  ],
};

export const NON_COMPLIANT_MARKETING_TEMPLATE_NO_FOOTER: TemplateFixture = {
  name: 'test_market_briefing_no_footer',
  category: 'MARKETING',
  language: 'en',
  bodyText: 'Hello {{1}}, huge market gains today! Buy stocks now.',
  // Missing mandatory SEBI/AMFI footer
  variableSchema: {
    '1': { name: 'client_name', example: 'Rahul' },
  },
};

export const NON_COMPLIANT_MARKETING_TEMPLATE_BAD_FOOTER: TemplateFixture = {
  name: 'test_market_briefing_bad_footer',
  category: 'MARKETING',
  language: 'en',
  bodyText: 'Hello {{1}}, explore new investment opportunities.',
  footerText: 'Informational Only - Not Financial Advice',
  variableSchema: {
    '1': { name: 'client_name', example: 'Rahul' },
  },
};

export const COMPLIANT_UTILITY_TEMPLATE: TemplateFixture = {
  name: 'test_sip_execution_alert',
  category: 'UTILITY',
  language: 'en',
  headerType: 'TEXT',
  headerText: 'SIP Execution Notice',
  bodyText: 'Dear {{1}}, your SIP installment of INR {{2}} for folio {{3}} was processed successfully.',
  footerText: 'Wealth Trade Customer Service',
  variableSchema: {
    '1': { name: 'client_name', example: 'Priya' },
    '2': { name: 'amount', example: '15000' },
    '3': { name: 'folio_number', example: 'WT-99214' },
  },
};

export const VARIABLE_REGEX_TEST_CASES = [
  {
    description: 'Strict sequential numeric placeholders',
    bodyText: 'Hello {{1}}, your account balance is {{2}} as of {{3}}.',
    expectedPlaceholders: ['1', '2', '3'],
    isValid: true,
  },
  {
    description: 'Single numeric placeholder',
    bodyText: 'Dear {{1}}, happy birthday from Wealth Trade!',
    expectedPlaceholders: ['1'],
    isValid: true,
  },
  {
    description: 'No placeholders',
    bodyText: 'Markets are closed today on account of Diwali.',
    expectedPlaceholders: [],
    isValid: true,
  },
  {
    description: 'Non-numeric named placeholder (Meta violation)',
    bodyText: 'Hello {{client_name}}, your portfolio value is {{value}}.',
    expectedPlaceholders: [],
    isValid: false,
    reason: 'Placeholders must be sequential numbers {{1}}, {{2}}, not alphanumeric names',
  },
  {
    description: 'Gap in sequential numbering (Meta violation)',
    bodyText: 'Hello {{1}}, your balance is {{3}}.',
    expectedPlaceholders: ['1', '3'],
    isValid: false,
    reason: 'Numbering sequence has a gap: missing {{2}}',
  },
  {
    description: 'Unclosed opening braces',
    bodyText: 'Hello {{1, welcome to the platform.',
    expectedPlaceholders: [],
    isValid: false,
    reason: 'Malformed unclosed placeholder',
  },
];
