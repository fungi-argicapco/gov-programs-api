import './setup-env';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import Modal from '../Modal.svelte';

describe('AtlasModal', () => {
  it('emits close event when Escape is pressed', async () => {
    const { getByRole, queryByRole, component } = render(Modal, {
      props: { open: true, title: 'Session timeout' }
    });

    const spy = vi.fn();
    (component as any).$on('close', spy);

    const dialog = getByRole('dialog');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when clicking the backdrop', async () => {
    const { container, component } = render(Modal, {
      props: {
        open: true,
        title: 'Backdrop close demo'
      }
    });

    const spy = vi.fn();
    (component as any).$on('close', spy);

    const backdrop = container.querySelector('.atlas-modal__backdrop');
    expect(backdrop).toBeTruthy();
    (backdrop as Element).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
