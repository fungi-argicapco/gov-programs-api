import './setup-env';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Input from '../Input.svelte';
import Select from '../Select.svelte';
import InputHarness from './InputHarness.svelte';
import SelectHarness from './SelectHarness.svelte';

describe('AtlasInput', () => {
  it('binds value via two-way binding', async () => {
    const { getByRole, getByTestId } = render(InputHarness, { props: { initialValue: 'hello@example.com' } });
    const input = getByRole('textbox', { name: 'Email' }) as HTMLInputElement;
    expect(input.value).toBe('hello@example.com');

    input.value = 'new@example.com';
    input.dispatchEvent(new Event('input'));
    expect(getByTestId('value')).toHaveTextContent('new@example.com');
  });

  it('announces error state', () => {
    const { getByRole, getByText } = render(Input, {
      props: {
        label: 'Project name',
        error: 'Required field'
      }
    });
    const input = getByRole('textbox', { name: 'Project name' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(getByText('Required field')).toBeInTheDocument();
  });
});

describe('AtlasSelect', () => {
  const options = [
    { value: 'jp', label: 'Japan' },
    { value: 'de', label: 'Germany' },
    { value: 'pe', label: 'Peru' }
  ];

  it('renders options passed via props', () => {
    const { getAllByRole } = render(Select, {
      props: {
        label: 'Country',
        options
      }
    });
    const renderedOptions = getAllByRole('option');
    expect(renderedOptions.length).toBe(options.length);
    expect(renderedOptions[1]).toHaveTextContent('Germany');
  });

  it('supports bind:value using harness', async () => {
    const { getByRole, getByTestId } = render(SelectHarness, { props: { options } });
    const select = getByRole('combobox', { name: 'Country' });
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('Select element not found');
    }
    select.value = 'pe';
    select.dispatchEvent(new Event('change'));
    expect(getByTestId('value')).toHaveTextContent('pe');
  });
});
