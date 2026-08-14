import { currentPortalRole, portalRoleHeaders } from "$lib/utils/portal-session";

const UPLOAD_ENDPOINT = "/upload";

/**
 * Uploads a single file to the server and returns its stored fileId.
 * The server responds with: { fileId: number }
 */
export async function uploadFile(file: File): Promise<number> {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(UPLOAD_ENDPOINT, { method: "POST", credentials: "include", headers: portalRoleHeaders(), body: fd });

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
  return `/file/${id}${role ? `?portalRole=${encodeURIComponent(role)}` : ""}`;
}
