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
