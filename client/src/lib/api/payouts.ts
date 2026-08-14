import { restRequest } from '$lib/api/rest';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PayoutRecord {
  id: string;
  ticketId: string;
  ticketNumber?: string;
  engineerId: string;
  engineerName?: string;
  callType: string;
  payoutAmount: number;
  amount: number;
  currency: string;
  status: 'pending' | 'credited' | 'disputed';
  creditedAt?: string;
  createdAt: string;
}

export interface PayoutRate {
  categoryId: string;
  categoryName: string;
  callType: string;
  amount: number;
  currency: string;
  updatedBy?: string;
  updatedAt?: string;
}

// ── Functions ──────────────────────────────────────────────────────────────

export async function fetchPayouts(params?: {
  engineerId?: string;
  status?: string;
  engineerName?: string;
  from?: string;
  to?: string;
}): Promise<PayoutRecord[]> {
  const qs = new URLSearchParams();
  if (params?.engineerId) qs.set('engineerId', params.engineerId);
  if (params?.status)     qs.set('status',     params.status);
  if (params?.engineerName) qs.set('engineerName', params.engineerName);
  if (params?.from)       qs.set('from',        params.from);
  if (params?.to)         qs.set('to',          params.to);
  const q = qs.toString();
  const rows = await restRequest<Array<Partial<PayoutRecord> & { payoutAmount?: number; amount?: number }>>(`/api/payouts${q ? `?${q}` : ''}`);
  return rows.map((row) => {
    const payoutAmount = Number(row.payoutAmount ?? row.amount ?? 0);
    return {
      id: row.id ?? '',
      ticketId: row.ticketId ?? '',
      ticketNumber: row.ticketNumber,
      engineerId: row.engineerId ?? '',
      engineerName: row.engineerName,
      callType: row.callType ?? '',
      payoutAmount,
      amount: payoutAmount,
      currency: row.currency ?? 'INR',
      status: (row.status as PayoutRecord['status']) ?? 'pending',
      creditedAt: row.creditedAt,
      createdAt: row.createdAt ?? '',
    };
  });
}

export async function fetchPayoutRates(): Promise<PayoutRate[]> {
  const rates = await restRequest<Array<Partial<PayoutRate>>>('/api/payout-rates');
  return rates.map((rate) => ({
    categoryId: rate.categoryId ?? '',
    categoryName: rate.categoryName ?? '',
    callType: rate.callType ?? rate.categoryName ?? '',
    amount: Number(rate.amount ?? 0),
    currency: rate.currency ?? 'INR',
    updatedBy: rate.updatedBy,
    updatedAt: rate.updatedAt,
  }));
}

export async function updatePayoutRate(
  categoryId: string,
  amount: number,
  currency = 'INR',
): Promise<PayoutRate> {
  const rate = await restRequest<Partial<PayoutRate>>(`/api/payout-rates/${categoryId}`, {
    method: 'PUT',
    body: JSON.stringify({ amount: String(amount), currency }),
  });
  return {
    categoryId: rate.categoryId ?? categoryId,
    categoryName: rate.categoryName ?? '',
    callType: rate.callType ?? rate.categoryName ?? '',
    amount: Number(rate.amount ?? amount),
    currency: rate.currency ?? currency,
    updatedBy: rate.updatedBy,
    updatedAt: rate.updatedAt,
  };
}
