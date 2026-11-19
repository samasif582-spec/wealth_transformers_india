import { normalizeToE164 } from '../utils/phone-normalizer';

describe('Phone Normalizer Utility (libphonenumber-js)', () => {
  it('should normalize standard Indian mobile numbers with +91 prefix to valid E.164', () => {
    const phones = ['+919876543210', '+919823456789', '+919123456780'];
    phones.forEach((phone) => {
      const result = normalizeToE164(phone);
      expect(result.valid).toBe(true);
      expect(result.e164).toBe(phone);
      expect(result.e164).toMatch(/^\+91[6-9]\d{9}$/);
    });
  });

  it('should normalize 10-digit Indian numbers without country code using default +91', () => {
    const rawNumbers = ['9876543210', '9823456789', '9123456780'];
    rawNumbers.forEach((raw) => {
      const result = normalizeToE164(raw, 'IN');
      expect(result.valid).toBe(true);
      expect(result.e164).toBe(`+91${raw}`);
      expect(result.e164).toMatch(/^\+91[6-9]\d{9}$/);
    });
  });

  it('should normalize international phone numbers (e.g. US +1) to valid E.164', () => {
    const international = '+14155552671';
    const result = normalizeToE164(international, 'US');
    expect(result.valid).toBe(true);
    expect(result.e164).toBe('+14155552671');
    expect(result.e164).toMatch(/^\+1\d{10}$/);
  });

  it('should reject numbers with disallowed formatting (spaces, hyphens, letters)', () => {
    const formatted = [
      '+91 9876543210',
      '+91-98765-43210',
      '+91987654321A',
      '98765-43210',
      '+91\t9876543210',
    ];
    formatted.forEach((item) => {
      const result = normalizeToE164(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('disallowed formatting or letters');
    });
  });

  it('should reject numbers missing country code prefix when defaultCountry is empty', () => {
    const result = normalizeToE164('9876543210', '' as any);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing country code prefix +');
  });

  it('should reject empty or non-string inputs', () => {
    expect(normalizeToE164('').valid).toBe(false);
    expect(normalizeToE164(null as any).valid).toBe(false);
    expect(normalizeToE164(undefined as any).valid).toBe(false);
  });

  it('should reject invalid phone lengths', () => {
    const invalidLengths = ['+91123', '+91999999999999999', '+910000000000'];
    invalidLengths.forEach((phone) => {
      const result = normalizeToE164(phone);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
