<script>
  let { size = 20, stroke = "currentColor", strokeWidth = 2, class: className = "" } = $props();
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" class={className}>
  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
  <polyline points="22 4 12 14.01 9 11.01" />
</svg>
