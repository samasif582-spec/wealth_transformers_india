export const TEMPLATE_QUALITY_RATINGS = {
  GREEN: { color: 'green', label: 'High Quality', canDispatch: true },
  YELLOW: { color: 'yellow', label: 'Medium Quality', canDispatch: true },
  RED: { color: 'red', label: 'Low Quality (Blocked)', canDispatch: false },
} as const;

export type TemplateQualityKey = keyof typeof TEMPLATE_QUALITY_RATINGS;
