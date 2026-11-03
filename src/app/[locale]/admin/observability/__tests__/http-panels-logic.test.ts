import { describe, expect, it } from "vitest";
import { httpLatencyOverall, httpStatusClassSeries } from "../logic";

describe("HTTP panels logic (real in-process telemetry, never a fake zero)", () => {
  it("returns empty / null when nothing was recorded", () => {
    expect(httpStatusClassSeries({})).toEqual([]);
    expect(httpLatencyOverall({})).toBeNull();
    expect(httpLatencyOverall({ http_request_duration_ms: [{ labels: { method: "GET" }, count: 0, sum: 0, avgMs: 0 }] })).toBeNull();
  });

  it("sums status classes across methods and orders them 1xx..5xx with tones", () => {
    const snap = {
      http_requests_total: [
        { labels: { method: "GET", status_class: "5xx" }, value: 2 },
        { labels: { method: "GET", status_class: "2xx" }, value: 10 },
        { labels: { method: "POST", status_class: "2xx" }, value: 5 },
        { labels: { method: "GET", status_class: "4xx" }, value: 3 },
      ],
    };
    expect(httpStatusClassSeries(snap)).toEqual([
      { label: "2xx", value: 15, tone: "success" },
      { label: "4xx", value: 3, tone: "warning" },
      { label: "5xx", value: 2, tone: "danger" },
    ]);
  });

  it("averages duration across methods weighted by request count", () => {
    const snap = {
      http_request_duration_ms: [
        { labels: { method: "GET" }, count: 3, sum: 30, avgMs: 10 },
        { labels: { method: "POST" }, count: 1, sum: 110, avgMs: 110 },
      ],
    };
    expect(httpLatencyOverall(snap)).toEqual({ count: 4, avgMs: 35 });
  });
});
