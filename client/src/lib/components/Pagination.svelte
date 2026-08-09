<script lang="ts">
  interface Props {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    itemLabel?: string;
    loading?: boolean;
    onchange: (page: number) => void;
  }

  const {
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    itemLabel = 'items',
    loading = false,
    onchange,
  }: Props = $props();

  function pageNumbers(): (number | '...')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++)
      pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  }

  const from = $derived((currentPage - 1) * pageSize + 1);
  const to   = $derived(Math.min(currentPage * pageSize, totalItems));
</script>

<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-4 border-t border-gray-100 mt-2 gap-3">
  <span class="text-[13px] text-gray-500">
    {#if loading}
      <div class="h-4 w-48 bg-gray-200 rounded animate-pulse"></div>
    {:else if totalItems === 0}
      No {itemLabel} to show
    {:else}
      Showing <strong>{from}–{to}</strong> of {totalItems} {itemLabel}
    {/if}
  </span>

  {#if !loading && totalPages > 1}
    <div class="flex items-center gap-1">
      <button
        disabled={currentPage === 1}
        onclick={() => onchange(currentPage - 1)}
        class="px-3 py-1.5 text-[12px] rounded-md border transition-all bg-white text-gray-500 border-gray-200 hover:border-[#0B182A] hover:text-[#0B182A] active:scale-95
               {currentPage === 1 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}"
      >← Prev</button>
      {#each pageNumbers() as page}
        {#if page === '...'}
          <span class="px-2 py-1.5 text-[12px] text-gray-400">…</span>
        {:else}
          <button
            onclick={() => onchange(page as number)}
            class="px-3 py-1.5 text-[12px] rounded-md border transition-all cursor-pointer active:scale-95
                   {page === currentPage
                     ? 'bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white border-[#0B182A]'
                     : 'bg-white text-gray-500 border-gray-200 hover:border-[#0B182A] hover:text-[#0B182A]'}"
          >{page}</button>
        {/if}
      {/each}
      <button
        disabled={currentPage === totalPages}
        onclick={() => onchange(currentPage + 1)}
        class="px-3 py-1.5 text-[12px] rounded-md border transition-all bg-white text-gray-500 border-gray-200 hover:border-[#0B182A] hover:text-[#0B182A] active:scale-95
               {currentPage === totalPages ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}"
      >Next →</button>
    </div>
  {/if}
</div>
