import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import CommandPalette from '../CommandPalette.svelte';

const goto = vi.fn();

vi.mock('$app/navigation', () => ({
  goto
}));

vi.mock('$app/environment', () => ({
  browser: true
}));

describe('CommandPalette', () => {
  const items = [
    { id: 'nav:/capital', title: 'Capital', href: '/capital', description: 'Funding programs' },
    { id: 'nav:/partners', title: 'Partners', href: '/partners', description: 'Delivery partners' },
    { id: 'action:view-design', title: 'View design preview', href: '/design/preview' }
  ];

  it('opens via keyboard shortcut and filters results', async () => {
    const { getByLabelText, getByText, queryByRole } = render(CommandPalette, {
      props: { items, open: false }
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    await tick();

    const input = getByLabelText('Command palette search');
    expect(input).toBeInTheDocument();

    await fireEvent.input(input, { target: { value: 'design' } });
    expect(getByText('View design preview')).toBeInTheDocument();

    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(goto).toHaveBeenCalledWith('/design/preview');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await tick();
    expect(queryByRole('dialog')).not.toBeInTheDocument();
  });
});
