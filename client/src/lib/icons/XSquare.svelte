<script>
  let { size = 20, stroke = "currentColor", strokeWidth = 2, class: className = "" } = $props();
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" class={className}>
  <rect x="3" y="3" width="18" height="18" rx="2" />
  <line x1="9" y1="9" x2="15" y2="15" />
  <line x1="15" y1="9" x2="9" y2="15" />
</svg>
