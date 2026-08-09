<script>
  let { size = 20, stroke = "currentColor", strokeWidth = 2, class: className = "" } = $props();
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" class={className}>
  <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
  <polyline points="16 16 12 12 8 16" />
  <line x1="12" y1="12" x2="12" y2="21" />
</svg>
