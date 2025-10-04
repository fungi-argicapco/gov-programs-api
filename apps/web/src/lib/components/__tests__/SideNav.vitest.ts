import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SideNav from '../SideNav.svelte';

const items = [
  { label: 'Capital', href: '/capital', icon: '💸', description: 'Funding finder' },
  { label: 'Partners', href: '/partners', icon: '🤝', description: 'Directory' }
];

describe('SideNav', () => {
  it('highlights active route and emits navigate events', async () => {
        const events: string[] = [];
    const { getByRole, component } = render(SideNav, {
      props: { items, currentPath: '/capital', open: true }
    });

    (component as unknown as {
      $on: (event: 'navigate', cb: (event: CustomEvent<{ href: string }>) => void) => void;
    }).$on('navigate', (event) => {
      events.push(event.detail.href);
    });

    const capitalLink = getByRole('link', { name: /Capital/ });
    expect(capitalLink).toHaveAttribute('aria-current', 'page');

    const partnersLink = getByRole('link', { name: /Partners/ });
    await fireEvent.click(partnersLink);

    expect(events).toEqual(['/partners']);
  });
});
