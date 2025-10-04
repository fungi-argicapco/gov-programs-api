import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import CommandPalette from '../CommandPalette.svelte';

vi.mock('$app/navigation', () => ({
  goto: vi.fn()
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

  it('opens via keyboard shortcut, focuses input, and filters results', async () => {
    const { getByLabelText, getByText, queryByRole } = render(CommandPalette, {
      props: { items, open: false }
    });

    const navigation = await import('$app/navigation');
    const goto = navigation.goto as ReturnType<typeof vi.fn>;
    goto.mockClear();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    await tick();

    const input = getByLabelText('Command palette search');
    expect(input).toBeInTheDocument();
    expect(document.activeElement).toBe(input);

    await fireEvent.input(input, { target: { value: 'design' } });
    expect(getByText('View design preview')).toBeInTheDocument();

    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(goto).toHaveBeenCalledWith('/design/preview');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await tick();
    expect(queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has no axe violations when open', async () => {
    const { container } = render(CommandPalette, {
      props: { items, open: true }
    });

    await tick();
    const results = await axe(container);
    (expect(results) as any).toHaveNoViolations();
  });
});
