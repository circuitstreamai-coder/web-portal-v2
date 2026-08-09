import type { JwtPayload } from "../modules/auth/auth.schema.js";

export interface Context {
  user: JwtPayload | null;
}
