/**
 * createQuery — lightweight reactive data-fetching primitive for Svelte 5.
 *
 * Usage (inside a .svelte component or .svelte.ts file):
 *
 *   const tickets = createQuery(() => fetchTickets());
 *   // tickets.data, tickets.loading, tickets.error, tickets.refetch()
 */

export interface QueryState<T> {
  readonly data: T | null;
  readonly loading: boolean;
  readonly error: string | null;
  refetch(): Promise<void>;
}

export function createQuery<T>(fetcher: () => Promise<T>): QueryState<T> {
  let data = $state<T | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function run() {
    loading = true;
    error = null;
    try {
      data = await fetcher();
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
      data = null;
    } finally {
      loading = false;
    }
  }

  run();

  return {
    get data() { return data; },
    get loading() { return loading; },
    get error() { return error; },
    refetch: run,
  };
}
