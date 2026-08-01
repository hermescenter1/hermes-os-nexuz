/**
 * JWT access-token utilities (Phase 28).
 * Edge-safe: uses `jose` only (no node:crypto).
 * Suitable for Next.js middleware and Edge Runtime.
 */

import { SignJWT, jwtVerify } from "jose";
import { jwtSecret, ACCESS_TOKEN_TTL } from "./config";
import type { Role } from "./roles";

export interface AccessTokenPayload {
  sub:   string; // userId
  email: string;
  role:  Role;
  name:  string;
  /**
   * PHASE 91 — opaque session id (the `RefreshToken.id` this token was minted
   * alongside). Present on tokens issued from Phase 91 onward; absent on legacy
   * tokens. When present, server-side guards verify the referenced session is
   * still active, which is what makes an access token revocable. Never a secret
   * — it is a random cuid that reveals nothing and cannot be replayed on its own.
   */
  sid?:  string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(jwtSecret());
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  const claims: Record<string, unknown> = {
    email: payload.email,
    role:  payload.role,
    name:  payload.name,
  };
  if (payload.sid) claims.sid = payload.sid;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL}s`)
    .sign(secretKey());
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.sub   !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.role  !== "string" ||
      typeof payload.name  !== "string"
    ) return null;
    return {
      sub:   payload.sub,
      email: payload.email,
      role:  payload.role as Role,
      name:  payload.name,
      sid:   typeof payload.sid === "string" ? payload.sid : undefined,
    };
  } catch {
    return null;
  }
}
