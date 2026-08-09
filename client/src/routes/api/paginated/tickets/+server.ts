import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// ── Types ────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  ticketNumber: string;
  projectId: string;
  categoryId: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  state: string;
  city: string;
  pincode: string;
  address: string;
  assignedEngineerId: string;
  statePlannerId: string;
  escalationLevel: string;
  payoutAmount: number;
  slaDeadline: string;
  author: string;
  createdAt: string;
}

export interface PaginatedTicketsResponse {
  items: Ticket[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── In-process cache ──────────────────────────────────────────────────────────
// Keyed by session-cookie value so users never see each other's data.
// On Vercel serverless, the cache is per warm function instance (best-effort).

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  tickets: Ticket[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCacheKey(cookies: Record<string, string>): string {
  // Use a short digest of all cookie values as the cache key
  return Object.values(cookies).join('|');
}

// ── GraphQL ───────────────────────────────────────────────────────────────────

const FETCH_TICKETS_QUERY = `
  query {
    tickets {
      id ticketNumber projectId categoryId title description
      priority status state city pincode address
      assignedEngineerId statePlannerId escalationLevel
      payoutAmount slaDeadline author createdAt
    }
  }
`;

async function fetchAllTickets(
  fetchFn: typeof fetch,
  cacheKey: string,
  bustCache = false,
): Promise<Ticket[]> {
  if (!bustCache) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.tickets;
    }
  }

  const res = await fetchFn('/graphql', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: FETCH_TICKETS_QUERY }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL upstream error: ${res.status}`);
  }

  const body = await res.json();
  if (body.errors?.length) {
    throw new Error(body.errors[0].message);
  }

  const tickets: Ticket[] = body.data.tickets ?? [];
  cache.set(cacheKey, { tickets, expiresAt: Date.now() + CACHE_TTL_MS });
  return tickets;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, fetch, cookies }) => {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 15)));
  const status = url.searchParams.get('status') ?? '';
  const priority = url.searchParams.get('priority') ?? '';
  const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();

  // Build cache key from session cookies to isolate per-user data
  const cookieMap: Record<string, string> = {};
  for (const { name, value } of cookies.getAll()) {
    cookieMap[name] = value;
  }
  const cacheKey = getCacheKey(cookieMap);

  const bustCache = url.searchParams.has('_bust');

  let tickets: Ticket[];
  try {
    tickets = await fetchAllTickets(fetch, cacheKey, bustCache);
  } catch (err) {
    throw error(502, `Failed to fetch tickets: ${(err as Error).message}`);
  }

  // Apply filters server-side
  if (status) {
    tickets = tickets.filter((t) => t.status === status);
  }
  if (priority) {
    tickets = tickets.filter(
      (t) => t.priority.toLowerCase() === priority.toLowerCase(),
    );
  }
  if (search) {
    tickets = tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(search) ||
        (t.ticketNumber ?? '').toLowerCase().includes(search) ||
        (t.state ?? '').toLowerCase().includes(search) ||
        (t.author ?? '').toLowerCase().includes(search),
    );
  }

  const total = tickets.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const items = tickets.slice((safePage - 1) * limit, safePage * limit);

  return json(
    { items, total, page: safePage, pageSize: limit, totalPages } satisfies PaginatedTicketsResponse,
    { headers: { 'Cache-Control': 'private, max-age=15' } },
  );
};
