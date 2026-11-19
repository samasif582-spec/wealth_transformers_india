export const CLIENT_IMPORT_CONFIG = {
  allowedFormats: ['.csv', '.xlsx'] as const,
  maxFileSizeMb: 25,
  defaultConsentStatus: 'OPTED_IN' as const,
  requiredHeaders: ['full_name', 'whatsapp_number', 'category_tier'] as const,
};
