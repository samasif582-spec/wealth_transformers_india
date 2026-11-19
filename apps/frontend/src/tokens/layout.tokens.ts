export const DRAWER_LAYOUT_CONFIG = {
  position: 'fixed' as const,
  inset: 0,
  zIndex: 50,
  backdropFilter: 'blur(8px)',
};

export const TOAST_CONTAINER_CONFIG = {
  position: 'fixed' as const,
  bottom: '1.5rem',
  right: '1.5rem',
  zIndex: 100,
  display: 'flex' as const,
  flexDirection: 'column-reverse' as const,
  gap: '0.75rem',
};

export const RECHARTS_TIME_SERIES_CONFIG = {
  componentType: 'ResponsiveContainer',
  chartType: 'LineChart',
  dataKeyX: 'date',
  lines: [
    { dataKey: 'sent', stroke: '#3b82f6' },
    { dataKey: 'delivered', stroke: '#10b981' },
    { dataKey: 'read', stroke: '#6366f1' },
    { dataKey: 'failed', stroke: '#ef4444' },
  ],
};
