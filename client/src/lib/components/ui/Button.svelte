<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

	interface Props {
		type?: 'button' | 'submit' | 'reset';
		variant?: Variant;
		loading?: boolean;
		disabled?: boolean;
		class?: string;
		onclick?: (e: MouseEvent) => void;
		children?: Snippet;
	}

	let {
		type = 'button',
		variant = 'primary',
		loading = false,
		disabled = false,
		class: className = '',
		onclick,
		children
	}: Props = $props();

	const base =
		'inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-lg text-[15px] font-semibold tracking-[1px] transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

	const variants: Record<Variant, string> = {
		primary: 'bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white hover:opacity-90 active:opacity-80',
		secondary: 'bg-[#ededed] text-[#333] hover:bg-[#e3e3e3] active:bg-[#d8d8d8]',
		danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
		ghost: 'bg-transparent text-[#0B182A] hover:bg-[#ededed] active:bg-[#e3e3e3]'
	};
</script>

<button
	{type}
	{onclick}
	disabled={disabled || loading}
	class="{base} {variants[variant]} {className}"
>
	{#if loading}
		<!-- Spinner -->
		<svg
			class="animate-spin h-4 w-4 shrink-0"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
			<path
				class="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
			/>
		</svg>
	{/if}
	{#if children}{@render children()}{/if}
</button>
