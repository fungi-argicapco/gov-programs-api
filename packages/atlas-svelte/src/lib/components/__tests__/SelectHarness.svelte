<script lang="ts">
  import Select from '../Select.svelte';
  import type { SelectOption } from '../Select.svelte';

export let options: SelectOption[] = [];
export let initialValue: string | undefined = undefined;

  let value = initialValue;
</script>

<Select bind:value {options} label="Country" placeholder="Select a country" />
<p data-testid="value">{value ?? ''}</p>
