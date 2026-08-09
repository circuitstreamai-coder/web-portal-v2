<script lang="ts">
	interface Props {
		type?: string;
		id?: string;
		name?: string;
		placeholder?: string;
		value?: string;
		label?: string;
		error?: string;
		required?: boolean;
		disabled?: boolean;
		autocomplete?: HTMLInputElement['autocomplete'];
		class?: string;
	}

	let {
		type = 'text',
		id,
		name,
		placeholder = '',
		value = $bindable(''),
		label,
		error,
		required = false,
		disabled = false,
		autocomplete,
		class: className = ''
	}: Props = $props();
</script>

<div class="flex flex-col gap-1.5 w-full">
	{#if label}
		<label for={id} class="text-[13px] font-medium text-[#444] leading-none">
			{label}{#if required}<span class="text-red-500 ml-0.5">*</span>{/if}
		</label>
	{/if}

	<input
		{type}
		{id}
		{name}
		{placeholder}
		{required}
		{disabled}
		{autocomplete}
		bind:value
		class="w-full py-3.5 px-4.5 bg-[#ededed] rounded-lg text-sm text-[#333] outline-none
		       transition-all duration-200 placeholder:text-[#999]
		       focus:bg-[#e3e3e3] focus:shadow-[0_0_0_2px_rgba(24,62,88,0.15)]
		       disabled:opacity-50 disabled:cursor-not-allowed
		       border {error
			? 'border-red-400 focus:shadow-[0_0_0_2px_rgba(239,68,68,0.2)]'
			: 'border-transparent'}
		       {className}"
	/>

	{#if error}
		<p class="text-red-500 text-[12px] leading-none">{error}</p>
	{/if}
</div>
