import { BadRequestException } from '@nestjs/common';
import { TemplatesService } from '../templates.service';

describe('Property P6: Variable Completeness Automated Test Suite', () => {
  let service: TemplatesService;

  beforeEach(() => {
    // Instantiate TemplatesService with dummy dependencies for pure validation tests
    service = new TemplatesService({} as any, {} as any);
  });

  const validTestCases = [
    {
      description: 'Single variable {{1}} with matching sample definition',
      bodyText: 'Hello {{1}}, welcome to Wealth Trade.',
      schema: { '1': 'Aarav' },
      expectedExtracted: ['1'],
    },
    {
      description: 'Multiple sequential variables {{1}}, {{2}}, {{3}} with all defined samples',
      bodyText: 'Dear {{1}}, your SIP of INR {{2}} has been confirmed for folio {{3}}.',
      schema: { '1': 'Rohan', '2': '25000', '3': 'WT-88712' },
      expectedExtracted: ['1', '2', '3'],
    },
    {
      description: 'Zero variables (static text)',
      bodyText: 'Equity markets will remain closed tomorrow on account of Gandhi Jayanti.',
      schema: {},
      expectedExtracted: [],
    },
  ];

  validTestCases.forEach(({ description, bodyText, schema, expectedExtracted }) => {
    it(`should PASS for valid case: ${description}`, () => {
      const res = service.validatePropertyP6(bodyText, schema);
      expect(res.valid).toBe(true);
      expect(res.extractedPlaceholders).toEqual(expectedExtracted);
    });
  });

  const invalidPlaceholderTestCases = [
    {
      description: 'Gap in numbering sequence: {{1}} and {{3}} (missing {{2}})',
      bodyText: 'Hello {{1}}, your net asset value is {{3}}.',
      schema: { '1': 'Aarav', '3': '150.25' },
      expectedErrorRegex: /gap or out of order/i,
    },
    {
      description: 'Non-sequential out of order numbering: {{2}} before {{1}}',
      bodyText: 'Your balance is {{2}}, dear {{1}}.',
      schema: { '1': 'Aarav', '2': '50000' },
      expectedErrorRegex: /gap or out of order/i,
    },
    {
      description: 'Alphanumeric / named placeholder {{client_name}}',
      bodyText: 'Hello {{client_name}}, your portfolio gained 12%.',
      schema: { client_name: 'Rahul' },
      expectedErrorRegex: /alphanumeric names/i,
    },
    {
      description: 'Malformed unclosed bracket {{1 without closing }}',
      bodyText: 'Hello {{1, please review your monthly statement.',
      schema: { '1': 'User' },
      expectedErrorRegex: /malformed unclosed placeholder/i,
    },
    {
      description: 'Dangling closing bracket without opening }}',
      bodyText: 'Hello 1}}, your OTP is verified.',
      schema: {},
      expectedErrorRegex: /malformed unclosed placeholder/i,
    },
    {
      description: 'Repeated placeholders causing gap in sequential expectation: {{1}} then {{1}}',
      bodyText: 'Hello {{1}}, please re-verify {{1}} before submitting {{2}}.',
      schema: { '1': 'Investor', '2': 'KYC Form' },
      expectedErrorRegex: /gap or out of order/i,
    },
  ];

  invalidPlaceholderTestCases.forEach(({ description, bodyText, schema, expectedErrorRegex }) => {
    it(`should REJECT with 400 for placeholder violation: ${description}`, () => {
      expect(() => {
        service.validatePropertyP6(bodyText, schema);
      }).toThrow(BadRequestException);

      try {
        service.validatePropertyP6(bodyText, schema);
      } catch (err: any) {
        expect(err.message).toMatch(expectedErrorRegex);
      }
    });
  });

  const missingDefinitionTestCases = [
    {
      description: 'Placeholder {{2}} defined in body but missing from variable schema',
      bodyText: 'Hello {{1}}, your portfolio allocation is {{2}}.',
      schema: { '1': 'Sneha' },
      missingPlaceholder: '{{2}}',
    },
    {
      description: 'Empty string definition for placeholder {{1}}',
      bodyText: 'Order {{1}} is pending.',
      schema: { '1': '' },
      missingPlaceholder: '{{1}}',
    },
    {
      description: 'Null value definition for placeholder {{1}}',
      bodyText: 'Welcome {{1}}.',
      schema: { '1': null },
      missingPlaceholder: '{{1}}',
    },
  ];

  missingDefinitionTestCases.forEach(({ description, bodyText, schema, missingPlaceholder }) => {
    it(`should REJECT when variable definition is incomplete: ${description}`, () => {
      expect(() => {
        service.validatePropertyP6(bodyText, schema);
      }).toThrow(BadRequestException);

      try {
        service.validatePropertyP6(bodyText, schema);
      } catch (err: any) {
        expect(err.message).toContain(missingPlaceholder);
      }
    });
  });
});
