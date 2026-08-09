<script>
  let { size = 20, stroke = "currentColor", strokeWidth = 2, class: className = "" } = $props();
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" class={className}>
  <rect x="3" y="3" width="7" height="7" rx="1" />
  <rect x="14" y="3" width="7" height="7" rx="1" />
  <rect x="3" y="14" width="7" height="7" rx="1" />
  <rect x="14" y="14" width="7" height="7" rx="1" />
</svg>
