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
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(jwtSecret());
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    role:  payload.role,
    name:  payload.name,
  })
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
    };
  } catch {
    return null;
  }
}
