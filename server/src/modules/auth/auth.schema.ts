export type UserRole =
  | "super_admin"
  | "customer"
  | "engineer"
  | "l2_engineer"
  | "l3_engineer"
  | "noc"
  | "state_planner"
  | "project_head"
  | "national_head"
  | "asset_manager";

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  role: string;
  createdAt: Date;
  avatarFileId?: number | null;
}

export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordBody {
  email: string;
}

export interface ResetPasswordBody {
  token: string;
  newPassword: string;
}

export const COOKIE_NAME = "token";

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};
