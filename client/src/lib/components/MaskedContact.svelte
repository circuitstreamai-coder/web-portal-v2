<script lang="ts">
  let {
    value,
    type = "text",
    class: className = "",
  }: {
    value: string | null | undefined;
    type?: "email" | "phone" | "text";
    class?: string;
  } = $props();

  let revealed = $state(false);

  function maskEmail(v: string): string {
    const at = v.indexOf("@");
    if (at < 0) return maskText(v);
    const local = v.slice(0, at);
    const domain = v.slice(at + 1);
    const dotIdx = domain.lastIndexOf(".");
    const domainName = dotIdx > 0 ? domain.slice(0, dotIdx) : domain;
    const tld = dotIdx > 0 ? domain.slice(dotIdx) : "";
    const maskedLocal =
      local.slice(0, Math.min(2, local.length)) +
      "•".repeat(Math.max(3, local.length - 2));
    const maskedDomain =
      domainName.slice(0, Math.min(2, domainName.length)) +
      "•".repeat(Math.max(3, domainName.length - 2));
    return `${maskedLocal}@${maskedDomain}${tld}`;
  }

  function maskPhone(v: string): string {
    const digits = v.replace(/\D/g, "");
    if (digits.length <= 4) return "•".repeat(digits.length);
    return digits.slice(0, 2) + "•".repeat(digits.length - 5) + digits.slice(-3);
  }

  function maskText(v: string): string {
    if (v.length <= 3) return "•".repeat(v.length);
    return v.slice(0, 2) + "•".repeat(Math.max(3, v.length - 4)) + v.slice(-2);
  }

  const display = $derived(
    !value
      ? "—"
      : revealed
        ? value
        : type === "email"
          ? maskEmail(value)
          : type === "phone"
            ? maskPhone(value)
            : maskText(value),
  );
</script>

<span class="inline-flex items-center gap-1.5 {className}">
  <span class="font-mono">{display}</span>
  {#if value}
    <button
      onclick={() => (revealed = !revealed)}
      class="shrink-0 text-gray-400 hover:text-gray-600 transition-colors rounded p-0.5 cursor-pointer"
      aria-label={revealed ? "Hide" : "Reveal"}
      type="button"
    >
      {#if revealed}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
          />
          <path
            d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
          />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      {:else}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      {/if}
    </button>
  {/if}
</span>
