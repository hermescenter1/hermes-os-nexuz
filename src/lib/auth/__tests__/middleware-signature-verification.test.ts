/**
 * Security regression coverage for the page-auth boundary.
 *
 * Protected-page middleware must never authorize a role claim until the JWT
 * signature has been verified. A forged token used to disclose the complete
 * server-rendered page for every protected route family below.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, jwtSecret } from "@/lib/auth/config";
import { signAccessToken } from "@/lib/auth/jwt";
import { getRoleFromRequest } from "@/lib/auth/rbac";

vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

const { middleware } = await import("@/middleware");

const PROTECTED_PAGE_FAMILIES = [
  "dashboard",
  "dashboard/operations/alarms",
  "dashboard/billing",
  "dashboard/organization",
  "dashboard/api",
  "admin",
  "engineering",
  "compliance",
  "crm",
  "erp",
  "documents",
  "customer",
  "vendor",
  "privacy-center",
] as const;

const LOCALES = ["en", "fa", "de"] as const;
const TEST_SECRET_A = "test-only-signing-secret-a-at-least-32-bytes";
const TEST_SECRET_B = "test-only-signing-secret-b-at-least-32-bytes";

function encode(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function forgedSuperadminToken(): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      sub: "attacker",
      email: "attacker@example.test",
      role: "superadmin",
      name: "Forged administrator",
      iat: now,
      exp: now + 3600,
    }),
    "not-a-valid-signature",
  ].join(".");
}

function requestFor(path: string, token?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: token
      ? { cookie: `${ACCESS_TOKEN_COOKIE}=${token}` }
      : undefined,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("middleware JWT signature boundary", () => {
  it("redirects forged arbitrary-role tokens for all 14 protected page families in every locale", async () => {
    const forged = forgedSuperadminToken();

    for (const locale of LOCALES) {
      for (const family of PROTECTED_PAGE_FAMILIES) {
        const path = `/${locale}/${family}`;
        const response = await middleware(requestFor(path, forged));
        expect(response.status, path).toBe(307);
        const location = new URL(response.headers.get("location") ?? "");
        expect(location.pathname, path).toBe(`/${locale}/auth/login`);
        expect(location.searchParams.get("from"), path).toBe(path);
      }
    }
  });

  it("accepts a correctly signed superadmin token", async () => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET_A);
    const token = await signAccessToken({
      sub: "admin-1",
      email: "admin@example.test",
      role: "superadmin",
      name: "Test administrator",
    });

    const response = await middleware(requestFor("/en/dashboard", token));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("rejects a previously signed token after secret rotation", async () => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET_A);
    const token = await signAccessToken({
      sub: "admin-1",
      email: "admin@example.test",
      role: "superadmin",
      name: "Test administrator",
    });
    expect(await getRoleFromRequest(requestFor("/en/dashboard", token))).toBe(
      "superadmin",
    );

    vi.stubEnv("JWT_SECRET", TEST_SECRET_B);
    expect(
      await getRoleFromRequest(requestFor("/en/dashboard", token)),
    ).toBeNull();
  });

  it("does not export the unsafe synchronous decoder", async () => {
    const rbac = await import("@/lib/auth/rbac");
    expect("getRoleFromRequestSync" in rbac).toBe(false);
  });

  it("fails closed when production has no configured signing secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("JWT_ACCESS_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");

    expect(() => jwtSecret()).toThrow(
      "JWT signing secret is required in production",
    );
  });
});
