// Global query invalidation registry.
//
// Usage:
//   • In actions.ts — call invalidate('customers') after a successful REST mutation.
//   • In view components — react to $queryVersion.<key> with $effect to re-fetch.
//
// Example (view):
//   import { queryVersion } from '$lib/stores/query';
//   $effect(() => {
//     $queryVersion.customers;       // reactive dependency
//     loadCustomers();
//   });

import { writable, derived } from 'svelte/store';

// ── Keys ───────────────────────────────────────────────────────────────────

export type QueryKey = 'availability' | 'customers' | 'engineers' | 'inventory' | 'projects' | 'tickets';

// ── Internal version counter ───────────────────────────────────────────────

const _versions = writable<Record<QueryKey, number>>({
  availability: 0,
  customers: 0,
  engineers: 0,
  inventory: 0,
  projects:  0,
  tickets:   0,
});

// ── Public API ─────────────────────────────────────────────────────────────

/** Bump the version for one or more keys to signal staleness. */
export function invalidate(...keys: QueryKey[]): void {
  _versions.update((v) => {
    const next = { ...v };
    for (const k of keys) next[k] = v[k] + 1;
    return next;
  });
}

/** Read-only store of version counters — subscribe in components. */
export const queryVersion = derived(_versions, ($v) => $v);
