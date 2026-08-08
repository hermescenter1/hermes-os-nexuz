import { describe, it, expect } from "vitest";
import {
  compareMoney,
  currencyIsImmutable,
  fromMinorUnits,
  isValidMoneyString,
  refundWithinBounds,
  toMinorUnits,
  assertChargeableCurrency,
} from "../money";
import { buildBillingAuditMetadata, isMetadataClean, BILLING_GOVERNANCE_AUDIT } from "../audit";

describe("money — no floating point", () => {
  it("validates decimal money strings", () => {
    expect(isValidMoneyString("10.0000")).toBe(true);
    expect(isValidMoneyString("0.01")).toBe(true);
    expect(isValidMoneyString("-5.5")).toBe(true);
    expect(isValidMoneyString("10.123456")).toBe(false); // >4dp
    expect(isValidMoneyString("abc")).toBe(false);
    expect(isValidMoneyString(10 as unknown)).toBe(false);
  });

  it("round-trips through integer minor units", () => {
    expect(toMinorUnits("10.0000")).toBe(BigInt(100000));
    expect(toMinorUnits("0.0001")).toBe(BigInt(1));
    expect(fromMinorUnits(BigInt(100000))).toBe("10.0000");
    expect(fromMinorUnits(BigInt(1))).toBe("0.0001");
    // classic float trap: 0.1 + 0.2
    expect(fromMinorUnits(toMinorUnits("0.1") + toMinorUnits("0.2"))).toBe("0.3000");
  });

  it("compares without float error", () => {
    expect(compareMoney("0.30", "0.3000")).toBe(0);
    expect(compareMoney("1.00", "2.00")).toBe(-1);
    expect(compareMoney("2.00", "1.00")).toBe(1);
  });

  it("enforces refund bounds", () => {
    expect(refundWithinBounds({ refund: "50.00", amountPaid: "100.00", alreadyRefunded: "0.00" })).toBe(true);
    expect(refundWithinBounds({ refund: "100.00", amountPaid: "100.00", alreadyRefunded: "0.00" })).toBe(true);
    expect(refundWithinBounds({ refund: "100.01", amountPaid: "100.00", alreadyRefunded: "0.00" })).toBe(false);
    expect(refundWithinBounds({ refund: "60.00", amountPaid: "100.00", alreadyRefunded: "50.00" })).toBe(false);
    expect(refundWithinBounds({ refund: "0.00", amountPaid: "100.00", alreadyRefunded: "0.00" })).toBe(false);
    expect(refundWithinBounds({ refund: "-1.00", amountPaid: "100.00", alreadyRefunded: "0.00" })).toBe(false);
    expect(refundWithinBounds({ refund: "junk", amountPaid: "100.00", alreadyRefunded: "0.00" })).toBe(false);
  });

  it("only the active currency is chargeable; others throw", () => {
    expect(() => assertChargeableCurrency("GBP")).not.toThrow();
    expect(() => assertChargeableCurrency("USD")).toThrow(); // ready but not active
    expect(() => assertChargeableCurrency("BTC")).toThrow();
  });

  it("invoice currency is immutable", () => {
    expect(currencyIsImmutable("GBP", "GBP")).toBe(true);
    expect(currencyIsImmutable("GBP", "USD")).toBe(false);
  });
});

describe("billing audit redaction", () => {
  it("keeps only allow-listed keys", () => {
    const meta = buildBillingAuditMetadata({
      organizationId: "org_1",
      planKey: "TEAM",
      // forbidden / non-allow-listed:
      cardNumber: "4242424242424242",
      cvc: "123",
      stripeSecret: "sk_live_ABCDEFGHIJKLMNOP",
      billingAddress: "1 High St",
      email: "a@b.com",
      rawPayload: { huge: true },
    });
    expect(meta).toEqual({ organizationId: "org_1", planKey: "TEAM" });
    expect(isMetadataClean(meta)).toBe(true);
  });

  it("redacts secret-looking values on allow-listed keys", () => {
    const meta = buildBillingAuditMetadata({ reason: "token whsec_ABCDEFGHIJKLMNOP leaked" });
    expect(meta.reason).toBe("[REDACTED]");
  });

  it("drops nested objects and coerces dates", () => {
    const when = new Date("2026-08-03T00:00:00.000Z");
    const meta = buildBillingAuditMetadata({ effectiveFrom: when, limit: 5, overrideApplied: true, decision: { nested: 1 } as unknown as string });
    expect(meta.effectiveFrom).toBe("2026-08-03T00:00:00.000Z");
    expect(meta.limit).toBe(5);
    expect(meta.overrideApplied).toBe(true);
    expect("decision" in meta).toBe(false);
  });

  it("detects a dirty metadata object", () => {
    expect(isMetadataClean({ cvc: "123" })).toBe(false);
    expect(isMetadataClean({ note: "sk_live_ABCDEFGHIJKLMNOPQR" })).toBe(false);
    expect(isMetadataClean({ planKey: "TEAM" })).toBe(true);
  });

  it("exposes the full billing action vocabulary", () => {
    expect(BILLING_GOVERNANCE_AUDIT.ENTITLEMENT_DENIED).toBe("billing.entitlement_denied");
    expect(BILLING_GOVERNANCE_AUDIT.WEBHOOK_DUPLICATE_IGNORED).toBe("billing.webhook_duplicate_ignored");
  });
});
