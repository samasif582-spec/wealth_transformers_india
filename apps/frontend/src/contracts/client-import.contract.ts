export const CLIENT_IMPORT_CONFIG = {
  allowedFormats: ['.csv', '.xlsx'] as const,
  maxFileSizeMb: 25,
  defaultConsentStatus: 'OPTED_IN' as const,
  requiredHeaders: ['mobileNumber', 'fullName', 'dateOfBirth'] as const,
  supportedHeaders: [
    'mobileNumber',
    'whatsappNumber',
    'phone',
    'fullName',
    'firstName',
    'lastName',
    'dateOfBirth',
    'dob',
    'email',
    'categoryTier',
  ] as const,
};
