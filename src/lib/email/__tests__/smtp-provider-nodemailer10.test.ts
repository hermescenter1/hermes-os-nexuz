/**
 * SMTP PROVIDER — Nodemailer 10 contract test.
 *
 * WHY THIS EXISTS
 * ---------------
 * `nodemailer` moved 9.1.1 -> 10.0.13 to close two HIGH advisories
 * (GHSA-v53p-9fqp-m79j, GHSA-prgh-xp8r-p3m5). That is a major version bump of a
 * direct production dependency, and the only thing standing behind the claim
 * "compatible" was a one-off manual check. This file makes the claim a committed
 * contract instead.
 *
 * WHAT IS REAL AND WHAT IS STUBBED
 * --------------------------------
 * The REAL `src/lib/email/providers/smtp.ts` runs, and the REAL installed
 * `nodemailer` 10 `createTransport` runs with it — so the library's own option
 * handling, defaults and types are exercised, and the test fails if 10.x stopped
 * honouring any option the provider passes.
 *
 * Exactly ONE thing is stubbed: `transporter.sendMail`, which is the network
 * boundary. No socket is opened, no DNS lookup happens, and nothing is sent. The
 * transport is pointed at a `.invalid` host (RFC 2606) as a second line of
 * defence, and every transport is closed in teardown.
 *
 * WHAT IT PROVES
 * --------------
 *   · `createTransport` receives the expected host/port/secure/auth mapping and
 *     the three timeout values, and Nodemailer 10 still exposes them;
 *   · the existing environment-variable contract is preserved, including the
 *     `EMAIL_FROM` and `EMAIL_REPLY_TO` defaults and the `SMTP_SECURE` parsing;
 *   · `sendMail` receives from/to/replyTo/subject/html/text as the provider
 *     builds them;
 *   · a successful send maps to the Hermes result shape with the real messageId;
 *   · each synchronous construction failure still throws its existing message;
 *   · an async `sendMail` rejection is caught and mapped, never propagated;
 *   · neither the password, the user, the host nor an SMTP URL is ever logged.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Transport options the real `createTransport` was handed, per call. */
const createCalls: Record<string, unknown>[] = [];
/** Arguments the stubbed network boundary received, per call. */
const sendMailCalls: Record<string, unknown>[] = [];
/** Transports built during a test, closed in teardown so no handle leaks. */
const builtTransports: { close: () => void }[] = [];

let sendMailImpl: (mail: Record<string, unknown>) => Promise<{ messageId?: string }> = async () => ({
  messageId: "<default@hermes.test>",
});

vi.mock("nodemailer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nodemailer")>();
  return {
    ...actual,
    // The real factory still runs: option validation, defaults and the 10.x
    // runtime are all exercised. Only the network call is replaced afterwards.
    createTransport: (options: Record<string, unknown>) => {
      createCalls.push(options);
      const transporter = actual.createTransport(options as never);
      builtTransports.push(transporter as unknown as { close: () => void });
      (transporter as unknown as { sendMail: unknown }).sendMail = async (mail: Record<string, unknown>) => {
        sendMailCalls.push(mail);
        return sendMailImpl(mail);
      };
      return transporter;
    },
  };
});

const logCalls: { level: string; message: string; meta: unknown }[] = [];
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: (message: string, meta?: unknown) => logCalls.push({ level: "debug", message, meta }),
    info: (message: string, meta?: unknown) => logCalls.push({ level: "info", message, meta }),
    warn: (message: string, meta?: unknown) => logCalls.push({ level: "warn", message, meta }),
    error: (message: string, meta?: unknown) => logCalls.push({ level: "error", message, meta }),
    fatal: (message: string, meta?: unknown) => logCalls.push({ level: "fatal", message, meta }),
  },
}));

import { SmtpProvider } from "../providers/smtp";
import type { EmailPayload } from "../providers/types";

/** RFC 2606 reserved TLD: unresolvable by design, so a stray connect cannot succeed. */
const HOST = "smtp.hermes-test.invalid";
const USER = "mailer@hermes-test.invalid";
const PASSWORD = "s3cr3t-not-a-real-password";

const ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_SECURE",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
] as const;

let savedEnv: Record<string, string | undefined> = {};

function setEnv(over: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}) {
  const base: Record<string, string | undefined> = {
    SMTP_HOST: HOST,
    SMTP_PORT: "465",
    SMTP_USER: USER,
    SMTP_PASSWORD: PASSWORD,
    SMTP_SECURE: undefined,
    EMAIL_FROM: undefined,
    EMAIL_REPLY_TO: undefined,
  };
  for (const key of ENV_KEYS) {
    const value = key in over ? over[key] : base[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const payload: EmailPayload = {
  to: "recipient@hermes-test.invalid",
  subject: "Verify your HERMES OS account",
  html: "<p>Verify</p>",
  text: "Verify",
};

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  createCalls.length = 0;
  sendMailCalls.length = 0;
  logCalls.length = 0;
  builtTransports.length = 0;
  sendMailImpl = async () => ({ messageId: "<default@hermes.test>" });
  setEnv();
});

afterEach(() => {
  for (const t of builtTransports) {
    try {
      t.close();
    } catch {
      /* a closed transport is fine; this only prevents a leaked handle */
    }
  }
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("createTransport configuration under Nodemailer 10", () => {
  it("passes the expected host, port, secure flag and credentials", () => {
    new SmtpProvider();
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toMatchObject({
      host: HOST,
      port: 465,
      secure: true,
      auth: { user: USER, pass: PASSWORD },
    });
  });

  it("passes all three timeouts, and Nodemailer 10 still honours them", () => {
    new SmtpProvider();
    expect(createCalls[0]).toMatchObject({
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    // Read back from the REAL transport: if 10.x renamed or dropped any of these
    // the provider would be silently running without a timeout.
    const options = (builtTransports[0] as unknown as { options: Record<string, unknown> }).options;
    expect(options.connectionTimeout).toBe(15_000);
    expect(options.greetingTimeout).toBe(15_000);
    expect(options.socketTimeout).toBe(30_000);
    expect(options.secure).toBe(true);
    expect(options.host).toBe(HOST);
    expect(options.port).toBe(465);
  });

  it("exposes the API surface the provider depends on", () => {
    new SmtpProvider();
    const t = builtTransports[0] as unknown as Record<string, unknown>;
    expect(typeof t.sendMail).toBe("function");
    expect(typeof t.close).toBe("function");
    // `verify` is not used by the provider but is part of the contract a future
    // health check would rely on; losing it would be a silent capability change.
    expect(typeof t.verify).toBe("function");
  });

  it("defaults the port to 465 and secure to true when unset", () => {
    setEnv({ SMTP_PORT: undefined, SMTP_SECURE: undefined });
    new SmtpProvider();
    expect(createCalls[0]).toMatchObject({ port: 465, secure: true });
  });

  it("honours an explicit non-TLS configuration exactly as before", () => {
    setEnv({ SMTP_PORT: "587", SMTP_SECURE: "false" });
    new SmtpProvider();
    expect(createCalls[0]).toMatchObject({ port: 587, secure: false });
    expect((builtTransports[0] as unknown as { options: Record<string, unknown> }).options.secure).toBe(false);
  });

  it("parses SMTP_SECURE case-insensitively and treats anything else as false", () => {
    setEnv({ SMTP_SECURE: "TRUE" });
    new SmtpProvider();
    expect(createCalls[0]).toMatchObject({ secure: true });

    createCalls.length = 0;
    setEnv({ SMTP_SECURE: "no" });
    new SmtpProvider();
    expect(createCalls[0]).toMatchObject({ secure: false });
  });

  it("trims the host and user, preserving the existing contract", () => {
    setEnv({ SMTP_HOST: `  ${HOST}  `, SMTP_USER: `  ${USER}  ` });
    new SmtpProvider();
    expect(createCalls[0]).toMatchObject({ host: HOST, auth: { user: USER } });
  });

  it("names itself smtp", () => {
    expect(new SmtpProvider().name).toBe("smtp");
  });
});

describe("synchronous construction failures keep their existing contract", () => {
  it("throws when SMTP_HOST is missing or blank", () => {
    for (const value of [undefined, "", "   "]) {
      setEnv({ SMTP_HOST: value });
      expect(() => new SmtpProvider()).toThrow("SMTP_HOST is required");
    }
  });

  it("throws when SMTP_USER is missing", () => {
    setEnv({ SMTP_USER: undefined });
    expect(() => new SmtpProvider()).toThrow("SMTP_USER is required");
  });

  it("throws when SMTP_PASSWORD is missing", () => {
    setEnv({ SMTP_PASSWORD: undefined });
    expect(() => new SmtpProvider()).toThrow("SMTP_PASSWORD is required");
  });

  it("throws on an out-of-range or non-integer port", () => {
    for (const port of ["0", "65536", "-1", "abc", "4.5"]) {
      setEnv({ SMTP_PORT: port });
      expect(() => new SmtpProvider(), port).toThrow("SMTP_PORT is invalid");
    }
  });

  it("builds no transport at all when construction fails", () => {
    setEnv({ SMTP_HOST: undefined });
    expect(() => new SmtpProvider()).toThrow();
    expect(createCalls).toEqual([]);
  });
});

describe("sendMail receives what the provider builds", () => {
  it("sends from/to/subject/html/text with the default from address", async () => {
    const provider = new SmtpProvider();
    await provider.send(payload);
    expect(sendMailCalls).toHaveLength(1);
    expect(sendMailCalls[0]).toMatchObject({
      from: "Hermes OS <noreply@hermesnovin.com>",
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
  });

  it("uses EMAIL_FROM and EMAIL_REPLY_TO when configured", async () => {
    setEnv({ EMAIL_FROM: "HERMES <ops@hermesnovin.com>", EMAIL_REPLY_TO: "support@hermesnovin.com" });
    await new SmtpProvider().send(payload);
    expect(sendMailCalls[0]).toMatchObject({
      from: "HERMES <ops@hermesnovin.com>",
      replyTo: "support@hermesnovin.com",
    });
  });

  it("leaves replyTo undefined when EMAIL_REPLY_TO is blank", async () => {
    setEnv({ EMAIL_REPLY_TO: "   " });
    await new SmtpProvider().send(payload);
    expect(sendMailCalls[0].replyTo).toBeUndefined();
  });
});

describe("result mapping", () => {
  it("maps a successful send to the Hermes result shape", async () => {
    sendMailImpl = async () => ({ messageId: "<abc-123@hermes-test.invalid>" });
    const result = await new SmtpProvider().send(payload);
    expect(result).toEqual({
      sent: true,
      provider: "smtp",
      messageId: "<abc-123@hermes-test.invalid>",
    });
  });

  it("maps an async sendMail rejection instead of propagating it", async () => {
    sendMailImpl = async () => {
      throw new Error("ECONNREFUSED 10.0.0.1:465");
    };
    const result = await new SmtpProvider().send(payload);
    expect(result).toEqual({
      sent: false,
      provider: "smtp",
      error: "ECONNREFUSED 10.0.0.1:465",
    });
    expect(result.messageId).toBeUndefined();
  });

  it("stringifies a non-Error rejection rather than throwing", async () => {
    sendMailImpl = async () => {
      throw "socket hang up";
    };
    const result = await new SmtpProvider().send(payload);
    expect(result).toMatchObject({ sent: false, provider: "smtp", error: "socket hang up" });
  });

  it("never rejects out of send()", async () => {
    sendMailImpl = async () => {
      throw new Error("boom");
    };
    await expect(new SmtpProvider().send(payload)).resolves.toMatchObject({ sent: false });
  });
});

describe("nothing secret is logged and nothing touches the network", () => {
  it("logs neither the password, the user, the host nor an SMTP URL", async () => {
    sendMailImpl = async () => {
      throw new Error("delivery failed");
    };
    const provider = new SmtpProvider();
    await provider.send(payload);
    sendMailImpl = async () => ({ messageId: "<ok@hermes-test.invalid>" });
    await provider.send(payload);

    expect(logCalls.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(logCalls);
    for (const secret of [PASSWORD, USER, HOST, "smtp://", "smtps://", "SMTP_PASSWORD"]) {
      expect(serialized, `${secret} must never be logged`).not.toContain(secret);
    }
  });

  it("opens no socket: the only network call is the stubbed boundary", async () => {
    await new SmtpProvider().send(payload);
    // One transport built, one send recorded, and the host is unresolvable, so a
    // real connection could not have succeeded even if one had been attempted.
    expect(createCalls).toHaveLength(1);
    expect(sendMailCalls).toHaveLength(1);
    expect(String(createCalls[0].host)).toMatch(/\.invalid$/);
  });

  it("runs against the installed Nodemailer 10 runtime", async () => {
    const pkg = await import("nodemailer/package.json", { with: { type: "json" } }).catch(() => null);
    const version = (pkg as { default?: { version?: string } } | null)?.default?.version;
    expect(version, "nodemailer version must be readable").toBeTruthy();
    expect(String(version)).toMatch(/^10./);
  });
});
