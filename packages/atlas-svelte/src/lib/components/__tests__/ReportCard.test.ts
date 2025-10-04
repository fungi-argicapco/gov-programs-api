import './setup-env';
import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
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
    const { getByText, getByRole } = render(AtlasReportCard, {
      props: {
        title: 'TechLand Labs',
        metrics,
        references: [{ label: 'Quarterly transparency report', href: 'https://example.com' }]
      }
    });

    expect(getByText('Scale')).toBeInTheDocument();
    expect(getByText('82')).toBeInTheDocument();
    expect(
      getByRole('link', { name: 'Quarterly transparency report' })
    ).toHaveAttribute('href', 'https://example.com');
  });

  it('expands details and emits toggle event', async () => {
    const events: Array<{ key: string | number; open: boolean }> = [];
    const { container } = render(AtlasReportCard, {
      props: {
        title: 'TechLand Labs',
        metrics
      },
      events: {
        toggle: (event: CustomEvent<{ key: string | number; open: boolean }>) => {
          events.push(event.detail);
        }
      }
    });

    const details = container.querySelector('details');
    expect(details).not.toBeNull();

    await fireEvent.click(details!.querySelector('summary')!);
    expect(events).toEqual([{ key: 'scale', open: true }]);
  });

  it('matches snapshot and passes axe checks when collapsed', async () => {
    const { container } = render(AtlasReportCard, {
      props: {
        title: 'Green Manufacturing Cohort',
        subtitle: 'Retrofit support for industrial corridors',
        metrics,
        references: [{ label: 'DOE FOA overview', href: 'https://energy.gov' }]
      }
    });

    expect(container).toMatchSnapshot('atlas-report-card-collapsed');
    const results = await axe(container);
    (expect(results) as any).toHaveNoViolations();
  });

  it('passes axe checks when detail sections are expanded', async () => {
    const { container, getByText } = render(AtlasReportCard, {
      props: {
        title: 'Green Manufacturing Cohort',
        metrics
      }
    });

    await fireEvent.click(getByText('Scale').closest('summary')!);
    await fireEvent.click(getByText('Reliability').closest('summary')!);

    const results = await axe(container);
    (expect(results) as any).toHaveNoViolations();
  });
});
