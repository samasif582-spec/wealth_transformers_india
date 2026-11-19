import { isOptOutKeyword, OPT_OUT_KEYWORDS } from '../utils/optout-detector';

describe('Inbound Opt-Out Detector', () => {
  it('should recognize all configured opt-out keywords case-insensitively', () => {
    const keywords = ['STOP', 'stop', 'Stop', 'UNSUBSCRIBE', 'unsubscribe', 'OPT OUT', 'opt out', 'OPTOUT', 'CANCEL', 'रुकें'];
    keywords.forEach((kw) => {
      expect(isOptOutKeyword(kw)).toBe(true);
    });
  });

  it('should ignore non-optout messages', () => {
    const nonKeywords = [
      'Hello, please send research',
      'What is today market outlook?',
      'Please stop by the office tomorrow',
      'Cancelation question',
      'Yes, I want to subscribe',
      '',
    ];
    nonKeywords.forEach((text) => {
      expect(isOptOutKeyword(text)).toBe(false);
    });
  });

  it('should handle whitespace around keywords', () => {
    expect(isOptOutKeyword('  STOP  ')).toBe(true);
    expect(isOptOutKeyword('\tUNSUBSCRIBE\n')).toBe(true);
  });

  it('should recognize keywords with trailing and boundary punctuation', () => {
    const punctuationCases = [
      'STOP.',
      'STOP!',
      'stop,',
      'STOP?',
      'STOP;',
      'STOP:',
      'STOP!!!',
      'CANCEL.',
      'CANCEL!',
      'UNSUBSCRIBE!',
      'unsubscribe.',
      '!STOP!',
      '..STOP..',
    ];
    punctuationCases.forEach((text) => {
      expect(isOptOutKeyword(text)).toBe(true);
    });
  });

  it('should recognize hyphenated variations of OPT-OUT', () => {
    const hyphenCases = [
      'OPT-OUT',
      'opt-out',
      'Opt-Out',
      'OPT - OUT',
      'opt-out!',
      'OPT-OUT.',
    ];
    hyphenCases.forEach((text) => {
      expect(isOptOutKeyword(text)).toBe(true);
    });
  });

  it('should recognize multilingual keywords with boundary punctuation', () => {
    const multilingualCases = [
      'रुकें',
      'रुकें!',
      'रुकें.',
      'रुकें?',
      '  रुकें!  ',
    ];
    multilingualCases.forEach((text) => {
      expect(isOptOutKeyword(text)).toBe(true);
    });
  });

  it('should reject null or non-string inputs safely', () => {
    expect(isOptOutKeyword(null as any)).toBe(false);
    expect(isOptOutKeyword(undefined as any)).toBe(false);
  });
});
