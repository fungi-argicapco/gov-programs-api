export type NavigationItem = {
  label: string;
  href: string;
  icon: string;
  description: string;
};

export const NAV_ITEMS: NavigationItem[] = [
  {
    label: 'Discover',
    href: '/discover',
    icon: '🧭',
    description: 'Explore problems, signals and evidence across regions.'
  },
  {
    label: 'Capital',
    href: '/capital',
    icon: '💸',
    description: 'Find grants and incentives, compare eligibility, assemble stacks.'
  },
  {
    label: 'Partners',
    href: '/partners',
    icon: '🤝',
    description: 'Directory of delivery and technology partners with trust metrics.'
  },
  {
    label: 'Assets',
    href: '/assets',
    icon: '🗺️',
    description: 'Atlas of infrastructure assets, hazards and zoning overlays.'
  },
  {
    label: 'Plans',
    href: '/plans',
    icon: '🧩',
    description: 'Blueprint composer, plan drafts and export history.'
  },
  {
    label: 'Intelligence',
    href: '/intelligence',
    icon: '📊',
    description: 'Dashboards, alerts and ingestion health for operators.'
  },
  {
    label: 'Admin',
    href: '/admin',
    icon: '🛠️',
    description: 'Access controls, tenants and governance settings.'
  }
];

export const PALETTE_ITEMS = [
  ...NAV_ITEMS.map((item) => ({
    id: `nav:${item.href}`,
    title: item.label,
    description: item.description,
    href: item.href,
    group: 'Navigation'
  })),
  {
    id: 'action:request-intake',
    title: 'Open request intake form',
    description: 'Capture program requests with guided questions.',
    href: '/plans'
  },
  {
    id: 'action:view-design-preview',
    title: 'View design preview',
    description: 'Showcase Atlas primitives and tokens.',
    href: '/design/preview'
  }
];
