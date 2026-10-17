import { portalRoleHeaders } from '$lib/utils/portal-session';
import {
  isSupabaseConfigured,
  supabaseAuthHeaders,
  supabaseFunctionUrl,
} from '$lib/supabase/client';

// REST fetch utility — sends credentials (HTTP-only cookie auth).

export interface ApiFieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors?: ApiFieldError[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function extractFieldErrors(json: unknown): ApiFieldError[] | undefined {
  if (!json || typeof json !== 'object') return undefined;

  const body = json as {
    errors?: unknown;
    message?: unknown;
    error?: unknown;
  };

  if (Array.isArray(body.errors)) {
    return body.errors.filter(
      (item): item is ApiFieldError =>
        !!item &&
        typeof item === 'object' &&
        'field' in item &&
        'message' in item &&
        typeof (item as ApiFieldError).field === 'string' &&
        typeof (item as ApiFieldError).message === 'string',
    );
  }

  const text =
    typeof body.message === 'string'
      ? body.message
      : typeof body.error === 'string'
        ? body.error
        : null;

  if (!text) return undefined;

  const fields = Array.from(text.matchAll(/required property '([^']+)'/g))
    .map((match) => match[1])
    .filter(Boolean);

  if (fields.length === 0) return undefined;

  return fields.map((field) => ({
    field,
    message: `${field} is required`,
  }));
}

export async function restRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await apiFetch(path, init);

  if (!res.ok) {
    let message = res.statusText;
    let errors: ApiFieldError[] | undefined;
    try {
      const json = await res.json();
      message = json.message ?? json.error ?? message;
      errors = extractFieldErrors(json);
    } catch {
      // non-JSON error body — keep statusText
    }
    throw new ApiError(message, res.status, errors);
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { headers, body, ...rest } = init;
  const isFormData = body instanceof FormData;

  let requestHeaders = isFormData || body === undefined
    ? portalRoleHeaders(headers)
    : portalRoleHeaders({ 'Content-Type': 'application/json', ...(headers as Record<string, string>) });

  let requestPath = path;
  if (isSupabaseConfigured()) {
    requestHeaders = await supabaseAuthHeaders(requestHeaders);
    requestPath = supabaseFunctionUrl('api', path);
  }

  return fetch(requestPath, {
    credentials: 'include',
    headers: requestHeaders,
    body,
    ...rest,
  });

}
