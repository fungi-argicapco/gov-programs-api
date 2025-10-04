export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type CardVariant = 'raised' | 'outline' | 'muted';
export type CardPadding = 'sm' | 'md' | 'lg';

export type BadgeVariant = 'neutral' | 'primary' | 'positive' | 'warning' | 'critical' | 'info';
export type BadgeTone = 'solid' | 'soft';

export type ModalSize = 'sm' | 'md' | 'lg';

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type ReportMetricKey = 'scale' | 'focus' | 'speed' | 'reliability' | 'additionality' | string;

export type ReportMetric = {
  key: ReportMetricKey;
  label: string;
  score: number;
  summary: string;
  details?: string[];
};

export type ReportReference = {
  label: string;
  href?: string;
  description?: string;
};

export type ReportCardData = {
  title: string;
  subtitle?: string;
  metrics: ReportMetric[];
  references?: ReportReference[];
};

export type EvidenceBlockProps = {
  source: string;
  freshness: string;
  lineageHref?: string;
  icon?: string;
  description?: string;
};
