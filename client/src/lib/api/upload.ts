import { currentPortalRole, portalRoleHeaders } from "$lib/utils/portal-session";
import {
  isSupabaseConfigured,
  supabaseAuthHeaders,
  supabaseFunctionUrl,
} from "$lib/supabase/client";

const UPLOAD_ENDPOINT = "/upload";

/**
 * Uploads a single file to the server and returns its stored fileId.
 * The server responds with: { fileId: number }
 */
export async function uploadFile(
  file: File,
  onboarding?: { verificationToken: string; email: string; flow: 'engineer' | 'customer' },
): Promise<number> {
  const fd = new FormData();
  fd.append("file", file);
  if (onboarding) {
    fd.append('verificationToken', onboarding.verificationToken);
    fd.append('email', onboarding.email);
    fd.append('flow', onboarding.flow);
  }

  const endpoint = isSupabaseConfigured()
    ? supabaseFunctionUrl("api", UPLOAD_ENDPOINT)
    : UPLOAD_ENDPOINT;
  const headers = isSupabaseConfigured()
    ? await supabaseAuthHeaders(portalRoleHeaders())
    : portalRoleHeaders();
  const res = await fetch(endpoint, { method: "POST", credentials: "include", headers, body: fd });

  if (!res.ok) {
    throw new Error(`File upload failed (${file.name}): ${res.statusText}`);
  }

  const json = await res.json() as { fileId: number };
  return json.fileId;
}

/**
 * Returns the URL to fetch a stored file by its integer ID.
 * Uses a relative path so it works via the Vite proxy in dev
 * and via a reverse proxy in production.
 */
export function fileUrl(id: number | string): string {
  const role = currentPortalRole();
  const path = `/file/${id}${role ? `?portalRole=${encodeURIComponent(role)}` : ""}`;
  return isSupabaseConfigured() ? supabaseFunctionUrl("api", path) : path;
}

/** Stable value persisted in application tables. It deliberately contains no secret. */
export function fileReference(id: number | string): string {
  return `/file/${id}`;
}

/** Resolve a private file through the authenticated Edge Function. */
export async function resolveFileUrl(value: number | string): Promise<string> {
  if (!isSupabaseConfigured()) {
    const match = String(value).match(/\/file\/(\d+)/);
    return match ? fileUrl(match[1]) : String(value);
  }
  const match = String(value).match(/\/file\/(\d+)/);
  if (!match) return String(value);
  const headers = await supabaseAuthHeaders(portalRoleHeaders());
  const response = await fetch(supabaseFunctionUrl('api', `/file/${match[1]}`), { headers });
  if (!response.ok) throw new Error(`Unable to open file (${response.status})`);
  return response.url;
}

export async function openFile(value: number | string): Promise<void> {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  try {
    const url = await resolveFileUrl(value);
    if (popup) popup.location.href = url;
    else window.location.href = url;
  } catch (error) {
    popup?.close();
    throw error;
  }
}
