<script lang="ts">
  export let id: string | undefined = undefined;
  export let label: string | undefined = undefined;
  export let helperText: string | undefined = undefined;
  export let error: string | undefined = undefined;
  export let value: string | number | '' | undefined = '';
  export let type = 'text';
  export let required = false;
  export let disabled = false;
  export let readonly = false;

  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `atlas-input-${Math.random().toString(36).slice(2)}`;
  $: resolvedId = id ?? randomId;
  $: messageId = `${resolvedId}-message`;

  const describedBy = () => (error || helperText ? messageId : undefined);
  const messageVariant = () => (error ? 'error' : 'help');
  const messageContent = () => error ?? helperText ?? '';

  function handleInput(event: Event) {
    const inputEl = event.currentTarget as HTMLInputElement;
    if (type === 'number') {
      value = inputEl.value === '' ? '' : inputEl.valueAsNumber;
    } else {
      value = inputEl.value;
    }
  }
</script>

<div class="atlas-input" data-state={error ? 'error' : disabled ? 'disabled' : 'default'}>
  {#if label}
    <label class="atlas-input__label" for={resolvedId}>
      {label}
      {#if required}
        <span class="atlas-input__required" aria-hidden="true">*</span>
      {/if}
    </label>
  {/if}
  <div class="atlas-input__field atlas-focusable" data-invalid={error ? 'true' : 'false'}>
    <slot name="leading"></slot>
    <input
      id={resolvedId}
      class="atlas-input__control"
      value={value ?? ''}
      type={type}
      required={required}
      disabled={disabled}
      readonly={readonly}
      aria-invalid={error ? 'true' : 'false'}
      aria-describedby={describedBy()}
      on:input={handleInput}
      {...$$restProps}
    />
    <slot name="trailing"></slot>
  </div>
  {#if error || helperText}
    <p class="atlas-input__message" id={messageId} data-variant={messageVariant()}>
      {messageContent()}
    </p>
  {/if}
</div>

<style>
  .atlas-input {
    display: grid;
    gap: var(--atlas-space-2xs);
  }

  .atlas-input__label {
    font-size: var(--atlas-type-scale-sm-font-size);
    font-weight: var(--atlas-type-weight-medium);
    color: var(--atlas-color-content-secondary);
  }

  .atlas-input__required {
    color: var(--atlas-color-accent-critical);
    margin-left: var(--atlas-space-3xs);
  }

  .atlas-input__field {
    display: inline-flex;
    align-items: center;
    gap: var(--atlas-space-sm);
    border-radius: var(--atlas-radius-md);
    border: 1px solid var(--atlas-color-border-subtle);
    background: var(--atlas-color-background-inset);
    padding: 0 var(--atlas-space-md);
    min-height: 42px;
    transition:
      border-color var(--atlas-motion-duration-fast) var(--atlas-motion-easing-standard),
      box-shadow var(--atlas-motion-duration-fast) var(--atlas-motion-easing-emphasized),
      background-color var(--atlas-motion-duration-fast) var(--atlas-motion-easing-standard);
  }

  .atlas-input__field:hover {
    border-color: var(--atlas-color-border-default);
  }

  .atlas-input__field:focus-within {
    border-color: var(--atlas-color-accent-primary);
    box-shadow: var(--atlas-elevation-focus);
    background: color-mix(in srgb, var(--atlas-color-background-inset) 88%, var(--atlas-color-background-muted) 12%);
  }

  .atlas-input[data-state='error'] .atlas-input__field {
    border-color: var(--atlas-color-accent-critical);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--atlas-color-accent-critical) 45%, transparent);
  }

  .atlas-input[data-state='disabled'] .atlas-input__field {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .atlas-input__control {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font: inherit;
    color: inherit;
    min-width: 0;
  }

  .atlas-input__control::placeholder {
    color: var(--atlas-color-content-muted);
  }

  .atlas-input__control:disabled {
    cursor: not-allowed;
  }

  .atlas-input__message {
    margin: 0;
    font-size: var(--atlas-type-scale-xs-font-size);
    color: var(--atlas-color-content-muted);
  }

  .atlas-input__message[data-variant='error'] {
    color: var(--atlas-color-accent-critical);
  }

  ::slotted([slot='leading']),
  ::slotted([slot='trailing']) {
    display: inline-flex;
    align-items: center;
    color: var(--atlas-color-content-muted);
  }
</style>
