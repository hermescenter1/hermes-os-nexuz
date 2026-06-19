/**
 * Argon2 password hashing (Phase 28).
 * Server-side only — never import from client components.
 * Uses argon2id variant (recommended for password storage: memory-hard, side-channel resistant).
 */

import argon2 from "argon2";

const ARGON2_OPTIONS: argon2.Options = {
  type:        argon2.argon2id,
  memoryCost:  65536, // 64 MB
  timeCost:    3,
  parallelism: 4,
};

export async function hashArgon2(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyArgon2(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** True if the stored hash was created by argon2 (starts with $argon2). */
export function isArgon2Hash(stored: string): boolean {
  return stored.startsWith("$argon2");
}
