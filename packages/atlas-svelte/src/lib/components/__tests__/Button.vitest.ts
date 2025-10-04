import './setup-env';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ButtonHarness from './ButtonHarness.svelte';

describe('AtlasButton', () => {
  it('renders slot content', () => {
    const { getByRole } = render(ButtonHarness);
    expect(getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('sets loading state and disables interaction', async () => {
    const { getByRole, rerender } = render(ButtonHarness, { props: { loading: true } });
    const button = getByRole('button', { name: 'Click me' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    await rerender({ loading: false });
    expect(button).not.toBeDisabled();
  });
});
