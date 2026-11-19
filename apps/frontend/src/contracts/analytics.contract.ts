import { z } from 'zod';

export const AnalyticsKpiCardSchema = z.object({
  id: z.string(),
  label: z.string(),
  format: z.enum(['number', 'percentage', 'currency']),
});

export const AnalyticsKpiCardsSchema = z.array(AnalyticsKpiCardSchema);

export const ANALYTICS_KPI_CONFIG = [
  { id: 'total-dispatched', label: 'Total Dispatched', format: 'number' as const },
  { id: 'delivery-rate', label: 'Delivery Rate', format: 'percentage' as const },
  { id: 'read-rate', label: 'Read Rate', format: 'percentage' as const },
  { id: 'total-cost', label: 'Total Cost (INR)', format: 'currency' as const },
];

export const ANALYTICS_EXPORT_CONFIG = {
  label: 'Export CSV',
  mimeType: 'text/csv' as const,
  filenamePattern: 'campaign_analytics_report_YYYY-MM-DD.csv',
};
