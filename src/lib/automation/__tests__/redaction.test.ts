import { describe, it, expect } from "vitest";
import { redactActionConfig, formatRedactedConfig } from "../redaction";

/** The shape redactActionConfig returns for a nested branch. */
type Node = Record<string, unknown>;
const node = (v: unknown): Node => v as Node;

describe("redaction", () => {
  describe("redactActionConfig", () => {
    it("should redact apiKey", () => {
      const config = { apiKey: "secret123", name: "test" };
      const result = redactActionConfig(config);
      expect(result.apiKey).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });

    it("should redact api_key (snake_case variant)", () => {
      const config = { api_key: "secret123", name: "test" };
      const result = redactActionConfig(config);
      expect(result.api_key).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });

    it("should redact token", () => {
      const config = { token: "eyJhbGc...", name: "test" };
      const result = redactActionConfig(config);
      expect(result.token).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });

    it("should redact accessToken", () => {
      const config = { accessToken: "at_123456", name: "test" };
      const result = redactActionConfig(config);
      expect(result.accessToken).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });

    it("should redact access_token (snake_case variant)", () => {
      const config = { access_token: "at_123456", name: "test" };
      const result = redactActionConfig(config);
      expect(result.access_token).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });

    it("should redact refreshToken", () => {
      const config = { refreshToken: "rt_987654", name: "test" };
      const result = redactActionConfig(config);
      expect(result.refreshToken).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });

    it("should redact refresh_token (snake_case variant)", () => {
      const config = { refresh_token: "rt_987654", name: "test" };
      const result = redactActionConfig(config);
      expect(result.refresh_token).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });

    it("should redact secret", () => {
      const config = { secret: "super_secret", name: "test" };
      const result = redactActionConfig(config);
      expect(result.secret).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });

    it("should redact clientSecret", () => {
      const config = { clientSecret: "cs_abc123", name: "test" };
      const result = redactActionConfig(config);
      expect(result.clientSecret).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });

    it("should redact client_secret (snake_case variant)", () => {
      const config = { client_secret: "cs_abc123", name: "test" };
      const result = redactActionConfig(config);
      expect(result.client_secret).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });

    it("should redact password", () => {
      const config = { password: "Pa$$w0rd123", name: "test" };
      const result = redactActionConfig(config);
      expect(result.password).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });

    it("should redact authorization (lowercase)", () => {
      const config = { authorization: "Bearer token123", name: "test" };
      const result = redactActionConfig(config);
      expect(result.authorization).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });

    it("should redact Authorization (uppercase)", () => {
      const config = { Authorization: "Bearer token123", name: "test" };
      const result = redactActionConfig(config);
      expect(result.Authorization).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });

    it("should redact nested headers.Authorization", () => {
      const config = {
        headers: {
          Authorization: "Bearer token123",
          "Content-Type": "application/json",
        },
        name: "test",
      };
      const result = redactActionConfig(config);
      expect(result.headers).toBeDefined();
      const headers = result.headers as Record<string, unknown>;
      expect(headers.Authorization).toBe("[REDACTED]");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("should remove query strings from URLs", () => {
      const config = {
        url: "https://example.test/hook?token=SENSITIVE&key=value",
        name: "test",
      };
      const result = redactActionConfig(config);
      expect(result.url).toBe("https://example.test/hook");
      expect(result.name).toBe("test");
    });

    it("should remove URL fragments", () => {
      const config = {
        url: "https://example.test/hook#fragment",
        name: "test",
      };
      const result = redactActionConfig(config);
      expect(result.url).toBe("https://example.test/hook");
      expect(result.name).toBe("test");
    });

    it("should remove both query strings and fragments from URLs", () => {
      const config = {
        url: "https://example.test/hook?token=SENSITIVE&key=value#fragment",
        name: "test",
      };
      const result = redactActionConfig(config);
      expect(result.url).toBe("https://example.test/hook");
      expect(result.name).toBe("test");
    });

    it("should not mutate the original config", () => {
      const originalConfig = {
        apiKey: "secret123",
        url: "https://example.test/hook?token=SENSITIVE",
        name: "test",
      };
      const original = JSON.parse(JSON.stringify(originalConfig));
      redactActionConfig(originalConfig);
      expect(originalConfig).toEqual(original);
    });

    it("should preserve safe non-sensitive config values", () => {
      const config = {
        method: "POST",
        timeout: 5000,
        retries: 3,
        name: "My Webhook",
        description: "Test webhook",
        enabled: true,
        tags: ["prod", "critical"],
      };
      const result = redactActionConfig(config);
      expect(result.method).toBe("POST");
      expect(result.timeout).toBe(5000);
      expect(result.retries).toBe(3);
      expect(result.name).toBe("My Webhook");
      expect(result.description).toBe("Test webhook");
      expect(result.enabled).toBe(true);
      expect(result.tags).toEqual(["prod", "critical"]);
    });

    it("should handle deeply nested objects", () => {
      const config = {
        level1: {
          level2: {
            level3: {
              apiKey: "secret",
              name: "nested",
            },
          },
        },
      };
      const result = redactActionConfig(config);
      const level3 = node(node(node(result.level1).level2).level3);
      expect(level3.apiKey).toBe("[REDACTED]");
      expect(level3.name).toBe("nested");
    });

    it("should handle arrays with objects", () => {
      const config = {
        items: [
          { apiKey: "secret1", name: "item1" },
          { apiKey: "secret2", name: "item2" },
        ],
      };
      const result = redactActionConfig(config);
      const items = (result.items as unknown[]).map(node);
      expect(items[0].apiKey).toBe("[REDACTED]");
      expect(items[0].name).toBe("item1");
      expect(items[1].apiKey).toBe("[REDACTED]");
      expect(items[1].name).toBe("item2");
    });

    it("should handle non-URL strings with :// in them correctly", () => {
      const config = {
        description: "Connect via https://example.com",
        name: "test",
      };
      const result = redactActionConfig(config);
      // Strings that are not valid URLs are not modified
      expect(result.description).toBe("Connect via https://example.com");
      expect(result.name).toBe("test");
    });

    it("should handle invalid URLs gracefully", () => {
      const config = {
        url: "not a valid url at all",
        name: "test",
      };
      const result = redactActionConfig(config);
      expect(result.url).toBe("not a valid url at all");
      expect(result.name).toBe("test");
    });

    it("should handle empty config", () => {
      const config = {};
      const result = redactActionConfig(config);
      expect(result).toEqual({});
    });

    it("should handle null values in config", () => {
      const config = {
        value: null,
        apiKey: "secret",
        name: "test",
      };
      const result = redactActionConfig(config);
      expect(result.value).toBe(null);
      expect(result.apiKey).toBe("[REDACTED]");
      expect(result.name).toBe("test");
    });
  });

  describe("formatRedactedConfig", () => {
    it("should format redacted config as JSON string", () => {
      const config = { apiKey: "secret123", name: "test" };
      const result = formatRedactedConfig(config);
      expect(typeof result).toBe("string");
      expect(result).toContain("[REDACTED]");
      expect(result).toContain("test");
    });

    it("should produce valid JSON that can be parsed", () => {
      const config = { apiKey: "secret123", name: "test", count: 42 };
      const result = formatRedactedConfig(config);
      const parsed = JSON.parse(result);
      expect(parsed.apiKey).toBe("[REDACTED]");
      expect(parsed.name).toBe("test");
      expect(parsed.count).toBe(42);
    });

    it("should include proper indentation", () => {
      const config = { apiKey: "secret123", name: "test" };
      const result = formatRedactedConfig(config);
      expect(result).toContain("\n");
      expect(result).toContain("  ");
    });
  });
});
