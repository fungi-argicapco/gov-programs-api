import './setup-env';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AtlasEvidenceBlock from '../EvidenceBlock.svelte';

describe('AtlasEvidenceBlock', () => {
  it('renders source, freshness and lineage link', () => {
    const { getByText } = render(AtlasEvidenceBlock, {
      props: {
        source: 'DOE Grants Catalog',
        freshness: '3d ago',
        lineageHref: 'https://example.com/lineage'
      }
    });

    expect(getByText('DOE Grants Catalog')).toBeInTheDocument();
    expect(getByText('3d ago')).toBeInTheDocument();
    expect(getByText('View lineage')).toHaveAttribute('href', 'https://example.com/lineage');
  });
});
