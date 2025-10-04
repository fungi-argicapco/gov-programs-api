<script lang="ts">
  import type { SelectOption } from './types';

  export let id: string | undefined = undefined;
  export let label: string | undefined = undefined;
  export let helperText: string | undefined = undefined;
  export let error: string | undefined = undefined;
  export let placeholder: string | undefined = undefined;
  export let value: string | undefined = undefined;
  export let options: SelectOption[] = [];
  export let required = false;
  export let disabled = false;

  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `atlas-select-${Math.random().toString(36).slice(2)}`;
  $: resolvedId = id ?? randomId;
  $: messageId = `${resolvedId}-message`;

  const describedBy = () => (error || helperText ? messageId : undefined);
  const messageVariant = () => (error ? 'error' : 'help');
  const messageContent = () => error ?? helperText ?? '';

  function handleChange(event: Event) {
    const selectEl = event.currentTarget as HTMLSelectElement;
    value = selectEl.value;
  }
</script>

<div class="atlas-select" data-state={error ? 'error' : disabled ? 'disabled' : 'default'}>
  {#if label}
    <label class="atlas-select__label" for={resolvedId}>
      {label}
      {#if required}
        <span class="atlas-select__required" aria-hidden="true">*</span>
      {/if}
    </label>
  {/if}
  <div class="atlas-select__field atlas-focusable" data-invalid={error ? 'true' : 'false'}>
    <select
      id={resolvedId}
      class="atlas-select__control"
      value={value ?? ''}
      required={required}
      disabled={disabled}
      aria-invalid={error ? 'true' : 'false'}
      aria-describedby={describedBy()}
      on:change={handleChange}
      {...$$restProps}
    >
      {#if placeholder}
        <option value="" disabled hidden selected={value === undefined || value === ''}>{placeholder}</option>
      {/if}
      {#if options.length > 0}
        {#each options as option}
          <option value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        {/each}
      {/if}
      <slot />
    </select>
    <span class="atlas-select__chevron" aria-hidden="true">▾</span>
  </div>
  {#if error || helperText}
    <p class="atlas-select__message" id={messageId} data-variant={messageVariant()}>
      {messageContent()}
    </p>
  {/if}
</div>

<style>
  .atlas-select {
    display: grid;
    gap: var(--atlas-space-2xs);
  }

  .atlas-select__label {
    font-size: var(--atlas-type-scale-sm-font-size);
    font-weight: var(--atlas-type-weight-medium);
    color: var(--atlas-color-content-secondary);
  }

  .atlas-select__required {
    color: var(--atlas-color-accent-critical);
    margin-left: var(--atlas-space-3xs);
  }

  .atlas-select__field {
    position: relative;
    border-radius: var(--atlas-radius-md);
    border: 1px solid var(--atlas-color-border-subtle);
    background: var(--atlas-color-background-inset);
    transition:
      border-color var(--atlas-motion-duration-fast) var(--atlas-motion-easing-standard),
      box-shadow var(--atlas-motion-duration-fast) var(--atlas-motion-easing-emphasized),
      background-color var(--atlas-motion-duration-fast) var(--atlas-motion-easing-standard);
  }

  .atlas-select__field:hover {
    border-color: var(--atlas-color-border-default);
  }

  .atlas-select__field:focus-within {
    border-color: var(--atlas-color-accent-primary);
    box-shadow: var(--atlas-elevation-focus);
  }

  .atlas-select[data-state='error'] .atlas-select__field {
    border-color: var(--atlas-color-accent-critical);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--atlas-color-accent-critical) 45%, transparent);
  }

  .atlas-select[data-state='disabled'] .atlas-select__field {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .atlas-select__control {
    appearance: none;
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    font: inherit;
    color: inherit;
    padding: 0 var(--atlas-space-xl) 0 var(--atlas-space-md);
    min-height: 42px;
  }

  .atlas-select__control:disabled {
    cursor: not-allowed;
  }

  .atlas-select__message {
    margin: 0;
    font-size: var(--atlas-type-scale-xs-font-size);
    color: var(--atlas-color-content-muted);
  }

  .atlas-select__message[data-variant='error'] {
    color: var(--atlas-color-accent-critical);
  }

  .atlas-select__chevron {
    position: absolute;
    right: var(--atlas-space-md);
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    font-size: 0.8em;
    color: var(--atlas-color-content-muted);
  }
</style>
