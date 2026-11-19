export const CLIENT_CATEGORY_TIERS = [
  'HNI',
  'RETAIL',
  'CORPORATE',
  'PROSPECT',
] as const;

export type ClientCategoryTier = (typeof CLIENT_CATEGORY_TIERS)[number];

export const CLIENT_TIER_BADGES: Record<ClientCategoryTier, { label: string; color: string }> = {
  HNI: { label: 'HNI Client', color: 'purple' },
  RETAIL: { label: 'Retail Client', color: 'blue' },
  CORPORATE: { label: 'Corporate Client', color: 'indigo' },
  PROSPECT: { label: 'Prospect', color: 'amber' },
};
