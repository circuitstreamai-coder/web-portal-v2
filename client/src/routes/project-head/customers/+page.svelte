<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { fetchProjectHeadCustomers, type ProjectHeadCustomerRow } from '$lib/api/project-head';
  import Pagination from '$lib/components/Pagination.svelte';

  let loading = $state(true);
  let customers = $state<ProjectHeadCustomerRow[]>([]);

  onMount(async () => {
    try {
      const data = await fetchProjectHeadCustomers();
      customers = data.customers;
    } catch (err) {
      toast.error(`Failed to load customers: ${(err as Error).message}`);
    } finally {
      loading = false;
    }
  });

  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  const totalPages      = $derived(Math.max(1, Math.ceil(customers.length / PAGE_SIZE)));
  const pagedCustomers  = $derived(customers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  function statusBadge(status: string): string {
    const value = String(status ?? '').toLowerCase();
    if (value === 'active') return 'bg-green-50 text-green-700';
    if (value === 'pending' || value === 'pending_approval') return 'bg-amber-50 text-amber-700';
    return 'bg-gray-100 text-gray-700';
  }
</script>

<svelte:head><title>Project Customers · Innoserve Techsol</title></svelte:head>

<div class="bg-white rounded-2xl p-6 shadow">
  <div class="flex items-center gap-3 mb-4">
    <h3 class="text-[18px] font-semibold text-[#0B182A]">Linked Customers</h3>
    <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{customers.length} Total</span>
  </div>

  <div class="overflow-x-auto">
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="border-b border-gray-100">
          {#each ['COMPANY', 'EMAIL', 'PHONE', 'STATUS', 'PROJECTS'] as col}
            <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#if loading}
          <tr><td colspan="5" class="py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
        {:else if customers.length === 0}
          <tr><td colspan="5" class="py-10 text-center text-[13px] text-gray-400">No customers are linked to your projects yet</td></tr>
        {:else}
          {#each pagedCustomers as customer}
            <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td class="py-3 px-3 text-[13px] font-medium text-[#0B182A]">{customer.companyName}</td>
              <td class="py-3 px-3 text-[13px] text-gray-600">{customer.email}</td>
              <td class="py-3 px-3 text-[13px] text-gray-600">{customer.phone}</td>
              <td class="py-3 px-3">
                <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(customer.status)}">
                  {customer.status}
                </span>
              </td>
              <td class="py-3 px-3">
                <div class="flex flex-wrap gap-2">
                  {#each customer.projectNames as projectName}
                    <span class="text-[11px] px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-medium">{projectName}</span>
                  {/each}
                </div>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
  <Pagination
    currentPage={currentPage}
    totalPages={totalPages}
    totalItems={customers.length}
    pageSize={PAGE_SIZE}
    itemLabel="customers"
    loading={loading}
    onchange={(p) => (currentPage = p)}
  />
</div>
