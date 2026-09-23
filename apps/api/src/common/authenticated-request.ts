import type { Request } from "express";
import type { AuthContext } from "./auth-context.js";

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}
