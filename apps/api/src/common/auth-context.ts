export interface AuthUser {
  id: string;
  publicId: string;
  fullName: string;
  username: string;
  email: string;
  status: string;
  mustChangePassword: boolean;
  roleKeys: string[];
  permissionKeys: string[];
  departmentKeys: string[];
}

export interface AuthContext {
  sessionId: string;
  actor: AuthUser;
  user: AuthUser;
  impersonationId: string | null;
}
