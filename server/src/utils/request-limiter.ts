type LimitOptions = {
  windowMs: number;
  maxHits: number;
};

type Entry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Entry>();
const MAX_BUCKETS = 10000;

function pruneBuckets(now: number) {
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }

  if (buckets.size <= MAX_BUCKETS) return;

  const entries = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  const overflow = buckets.size - MAX_BUCKETS;
  for (let i = 0; i < overflow; i += 1) {
    buckets.delete(entries[i][0]);
  }
}

export function checkRateLimit(key: string, options: LimitOptions) {
  const now = Date.now();
  pruneBuckets(now);

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.maxHits - 1, retryAfterMs: 0 };
  }

  if (current.count >= options.maxHits) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(current.resetAt - now, 0),
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(options.maxHits - current.count, 0),
    retryAfterMs: 0,
  };
}

export function normalizeIdentity(value?: string | null) {
  return value?.trim().toLowerCase() || "unknown";
}
