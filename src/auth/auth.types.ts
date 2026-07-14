import { UserRole } from '@prisma/client';

/** Claims embedded in the signed JWT. */
export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: UserRole;
}

/** Shape attached to `req.user` after JWT validation. */
export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
}
