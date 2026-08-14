export function portalRoleForPath(pathname: string): string | null {
  if (pathname.startsWith("/admin")) return "super_admin";
  if (pathname.startsWith("/national-head")) return "national_head";
  if (pathname.startsWith("/project-head")) return "project_head";
  if (pathname.startsWith("/planner")) return "state_planner";
  if (pathname.startsWith("/engineer")) return "engineer";
  if (pathname.startsWith("/customer")) return "customer";
  if (pathname.startsWith("/noc")) return "noc";
  if (pathname.startsWith("/vendor")) return "vendor";
  if (pathname.startsWith("/inventory")) return "asset_manager";
  return null;
}

export function currentPortalRole(): string | null {
  return typeof window === "undefined" ? null : portalRoleForPath(window.location.pathname);
}

export function portalRoleHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  const role = currentPortalRole();
  if (role) result.set("X-Portal-Role", role);
  return result;
}
