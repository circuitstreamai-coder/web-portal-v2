<script>
  let { size = 20, stroke = "currentColor", strokeWidth = 2, class: className = "" } = $props();
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" class={className}>
  <polyline points="6 9 12 15 18 9" />
</svg>
