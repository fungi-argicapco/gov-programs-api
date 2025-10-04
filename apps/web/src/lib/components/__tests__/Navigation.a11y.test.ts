import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import SideNav from '../SideNav.svelte';
import TopBar from '../TopBar.svelte';

const navItems = [
  { label: 'Discover', href: '/discover', icon: '🧭', description: 'Problem explorer' },
  { label: 'Capital', href: '/capital', icon: '💸', description: 'Funding finder' },
  { label: 'Partners', href: '/partners', icon: '🤝', description: 'Directory' }
];

describe('Navigation accessibility', () => {
  it('SideNav renders active state without axe violations', async () => {
    const { container, getByRole } = render(SideNav, {
      props: {
        items: navItems,
        currentPath: '/capital',
        open: true
      }
    });

    expect(getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(getByRole('link', { name: /Capital/ })).toHaveAttribute('aria-current', 'page');

    const results = await axe(container);
    (expect(results) as any).toHaveNoViolations();
  });

  it('TopBar provides search landmark without axe violations', async () => {
    const { container, getByRole, getByLabelText } = render(TopBar, {
      props: {
        title: 'TechLand Atlas',
        searchPlaceholder: 'Search',
        userName: 'Operator',
        notifications: 2
      }
    });

    expect(getByRole('banner')).toBeInTheDocument();
    expect(getByRole('search')).toBeInTheDocument();
    expect(getByLabelText('Search TechLand')).toBeInTheDocument();

    const results = await axe(container);
    (expect(results) as any).toHaveNoViolations();
  });
});
