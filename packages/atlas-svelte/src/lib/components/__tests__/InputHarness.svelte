<script lang="ts">
  import Input from '../Input.svelte';

  export let initialValue = '';
export let error: string | undefined = undefined;

  let value = initialValue;
</script>

<Input bind:value label="Email" helperText="We will never spam" {error} id="email-input" />

<p data-testid="value">{value}</p>
