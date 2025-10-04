import './setup-env';
import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AtlasReportCard from '../ReportCard.svelte';

const metrics = [
  {
    key: 'scale',
    label: 'Scale',
    score: 82,
    summary: 'Strong nationwide reach across metro and rural regions.',
    details: ['Operating in 18 states with local delivery partnerships.']
  },
  {
    key: 'reliability',
    label: 'Reliability',
    score: 67,
    summary: 'Good track record with minor variance in reporting.'
  }
];

describe('AtlasReportCard', () => {
  it('renders metric summaries and scores', () => {
    const { getByText } = render(AtlasReportCard, {
      props: {
        title: 'TechLand Labs',
        metrics,
        references: [{ label: 'Quarterly transparency report', href: 'https://example.com' }]
      }
    });

    expect(getByText('Scale')).toBeInTheDocument();
    expect(getByText('82')).toBeInTheDocument();
    expect(getByText('Quarterly transparency report')).toHaveAttribute(
      'href',
      'https://example.com'
    );
  });

  it('expands details and emits toggle event', async () => {
    const { container, component } = render(AtlasReportCard, {
      props: {
        title: 'TechLand Labs',
        metrics
      }
    });

    const details = container.querySelector('details');
    expect(details).not.toBeNull();

    const events: Array<{ key: string | number; open: boolean }> = [];
    (component as unknown as {
      $on: (event: 'toggle', cb: (event: CustomEvent<{ key: string | number; open: boolean }>) => void) => void;
    }).$on('toggle', (event) => events.push(event.detail));

    await fireEvent.click(details!.querySelector('summary')!);
    expect(events).toEqual([{ key: 'scale', open: true }]);
  });
});
