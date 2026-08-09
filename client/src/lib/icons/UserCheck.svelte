<script>
  let { size = 20, stroke = "currentColor", strokeWidth = 2, class: className = "" } = $props();
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" class={className}>
  <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
  <circle cx="8.5" cy="7" r="4" />
  <polyline points="17 11 19 13 23 9" />
</svg>
