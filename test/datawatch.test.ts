import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkFreshness,
  createAlertRule,
  createAsset,
  createSchemaBaseline,
  getAlertHistory,
  getAlertsSummary,
  getAlertTrends,
  getFreshnessSummary,
  getSchemaMonitoring,
  getSchemaSummary,
  getTodaysBriefing,
  healthSummary,
  listAlertRules,
  listAlerts,
  listAssets,
  listFreshnessSchedules,
  listInboxAlerts,
  listSchemaChanges,
  manageAlertRule,
  manageAsset,
  manageFreshnessSchedule,
  resolveBaseUrl,
  resolveConfig,
  setupFreshness,
  triggerAssetDiscovery,
  updateAlert,
} from "../src/datawatch.js";
import type { DatawatchConfig, FetchFn, HttpResponse } from "../src/types.js";

function jsonResponse(body: unknown, status = 200, statusText = "OK"): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

interface Captured {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  calls: number;
}

function fakeFetch(body: unknown = {}): { fetchFn: FetchFn; captured: Captured } {
  const captured: Captured = { calls: 0 };
  const fetchFn: FetchFn = async (url, init) => {
    captured.calls += 1;
    captured.url = url;
    captured.method = init?.method;
    captured.headers = init?.headers;
    captured.body = init?.body;
    return jsonResponse(body);
  };
  return { fetchFn, captured };
}

const BASE = "https://api.anomalyarmor.ai";
const CFG: DatawatchConfig = { baseUrl: BASE, apiKey: "test-key" };

describe("config resolution", () => {
  it("defaults the base URL and strips trailing slashes", () => {
    assert.equal(resolveBaseUrl(undefined), BASE);
    assert.equal(resolveBaseUrl("  "), BASE);
    assert.equal(resolveBaseUrl("https://example.test/api/"), "https://example.test/api");
    const cfg = resolveConfig({ ARMOR_API_KEY: " key " });
    assert.equal(cfg.apiKey, "key");
    assert.equal(cfg.baseUrl, BASE);
  });
});

describe("missing key gate", () => {
  it("errors BEFORE any request when the key is missing (spy)", async () => {
    let called = false;
    const spy: FetchFn = async () => { called = true; return jsonResponse({}); };
    const noKey: DatawatchConfig = { baseUrl: BASE, apiKey: "" };
    await assert.rejects(() => healthSummary(spy, noKey), /ARMOR_API_KEY is required/);
    await assert.rejects(() => listAlerts(spy, noKey, {}), /ARMOR_API_KEY is required/);
    assert.equal(called, false);
  });

  it("sends the X-API-Key header with requests", async () => {
    const { fetchFn, captured } = fakeFetch({ ok: true });
    await healthSummary(fetchFn, CFG);
    assert.equal(captured.headers?.["X-API-Key"], "test-key");
  });
});

describe("summaries and briefing", () => {
  it("health, briefing, alerts summary, freshness and schema summaries hit their paths", async () => {
    const a = fakeFetch({}); await healthSummary(a.fetchFn, CFG);
    assert.equal(a.captured.url, `${BASE}/health/summary`);
    const b = fakeFetch({}); await getTodaysBriefing(b.fetchFn, CFG);
    assert.equal(b.captured.url, `${BASE}/briefing/today`);
    const c = fakeFetch({}); await getAlertsSummary(c.fetchFn, CFG);
    assert.equal(c.captured.url, `${BASE}/alerts/summary`);
    const d = fakeFetch({}); await getFreshnessSummary(d.fetchFn, CFG);
    assert.equal(d.captured.url, `${BASE}/freshness/summary`);
    const e = fakeFetch({}); await getSchemaSummary(e.fetchFn, CFG);
    assert.equal(e.captured.url, `${BASE}/schema/summary`);
  });
});

describe("alerts", () => {
  it("list_alerts passes every supplied filter as a query param", async () => {
    const { fetchFn, captured } = fakeFetch([]);
    await listAlerts(fetchFn, CFG, {
      status: "open", severity: "high", asset_id: "a1",
      from_date: "2026-01-01", to_date: "2026-02-01",
    });
    assert.equal(captured.method, "GET");
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/alerts");
    assert.equal(url.searchParams.get("status"), "open");
    assert.equal(url.searchParams.get("severity"), "high");
    assert.equal(url.searchParams.get("asset_id"), "a1");
    assert.equal(url.searchParams.get("from_date"), "2026-01-01");
    assert.equal(url.searchParams.get("to_date"), "2026-02-01");
  });

  it("list_alerts without filters has no query string", async () => {
    const { fetchFn, captured } = fakeFetch([]);
    await listAlerts(fetchFn, CFG, {});
    assert.equal(captured.url, `${BASE}/alerts`);
  });

  it("list_inbox_alerts passes status and integer limit", async () => {
    const { fetchFn, captured } = fakeFetch([]);
    await listInboxAlerts(fetchFn, CFG, { status: "unread", limit: 20 });
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/alerts/inbox");
    assert.equal(url.searchParams.get("status"), "unread");
    assert.equal(url.searchParams.get("limit"), "20");
  });

  it("update_alert POSTs the action and comment to /alerts/{id}/update", async () => {
    const { fetchFn, captured } = fakeFetch({ ok: true });
    await updateAlert(fetchFn, CFG, { alert_id: "al1", action: "acknowledge", comment: "looking" });
    assert.equal(captured.method, "POST");
    assert.equal(captured.url, `${BASE}/alerts/al1/update`);
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), { action: "acknowledge", comment: "looking" });
  });

  it("update_alert omits an absent comment and rejects a blank action before any request", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await updateAlert(fetchFn, CFG, { alert_id: "al1", action: "resolve" });
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), { action: "resolve" });
    await assert.rejects(() => updateAlert(fetchFn, CFG, { alert_id: "al1", action: " " }), /action/);
    assert.equal(captured.calls, 1);
  });

  it("trends and history hit their paths", async () => {
    const a = fakeFetch({}); await getAlertTrends(a.fetchFn, CFG, { period: "7d" });
    const url = new URL(a.captured.url ?? "");
    assert.equal(url.pathname, "/alerts/trends");
    assert.equal(url.searchParams.get("period"), "7d");
    const b = fakeFetch({}); await getAlertHistory(b.fetchFn, CFG, { alert_id: "al1" });
    assert.equal(b.captured.url, `${BASE}/alerts/al1/history`);
  });

  it("blank alert id is rejected before any request", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await assert.rejects(() => getAlertHistory(fetchFn, CFG, { alert_id: "" }), /alert_id/);
    assert.equal(captured.calls, 0);
  });
});

describe("alert rules", () => {
  it("list_alert_rules passes asset and is_active=false", async () => {
    const { fetchFn, captured } = fakeFetch([]);
    await listAlertRules(fetchFn, CFG, { asset_id: "a1", is_active: false });
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/alert-rules");
    assert.equal(url.searchParams.get("asset_id"), "a1");
    assert.equal(url.searchParams.get("is_active"), "false");
  });

  it("create_alert_rule POSTs asset, rule type and config object", async () => {
    const { fetchFn, captured } = fakeFetch({ id: "r1" });
    await createAlertRule(fetchFn, CFG, { asset_id: "a1", rule_type: "freshness", config: { threshold_hours: 24 } });
    assert.equal(captured.method, "POST");
    assert.equal(captured.url, `${BASE}/alert-rules`);
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), {
      asset_id: "a1", rule_type: "freshness", config: { threshold_hours: 24 },
    });
  });

  it("manage_alert_rule POSTs the action to /alert-rules/{id}/manage", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await manageAlertRule(fetchFn, CFG, { rule_id: "r1", action: "disable" });
    assert.equal(captured.method, "POST");
    assert.equal(captured.url, `${BASE}/alert-rules/r1/manage`);
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), { action: "disable" });
  });
});

describe("assets", () => {
  it("list_assets passes source, asset_type and search", async () => {
    const { fetchFn, captured } = fakeFetch([]);
    await listAssets(fetchFn, CFG, { source: "snowflake", asset_type: "table", search: "orders" });
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/assets");
    assert.equal(url.searchParams.get("source"), "snowflake");
    assert.equal(url.searchParams.get("asset_type"), "table");
    assert.equal(url.searchParams.get("search"), "orders");
  });

  it("create_asset POSTs name, source type and connection config", async () => {
    const { fetchFn, captured } = fakeFetch({ id: "a1" });
    await createAsset(fetchFn, CFG, { name: "warehouse", source_type: "snowflake", connection_config: { account: "acme" } });
    assert.equal(captured.method, "POST");
    assert.equal(captured.url, `${BASE}/assets`);
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), {
      name: "warehouse", source_type: "snowflake", connection_config: { account: "acme" },
    });
  });

  it("manage_asset and trigger_asset_discovery hit their paths", async () => {
    const a = fakeFetch({}); await manageAsset(a.fetchFn, CFG, { asset_id: "a1", action: "pause" });
    assert.equal(a.captured.method, "POST");
    assert.equal(a.captured.url, `${BASE}/assets/a1/manage`);
    assert.deepEqual(JSON.parse(a.captured.body ?? "{}"), { action: "pause" });
    const b = fakeFetch({}); await triggerAssetDiscovery(b.fetchFn, CFG, { asset_id: "a1" });
    assert.equal(b.captured.method, "POST");
    assert.equal(b.captured.url, `${BASE}/assets/a1/discovery`);
  });
});

describe("freshness", () => {
  it("check_freshness POSTs asset and optional table path", async () => {
    const { fetchFn, captured } = fakeFetch({ fresh: true });
    const out = await checkFreshness(fetchFn, CFG, { asset_id: "a1", table_path: "db.schema.orders" });
    assert.equal(captured.method, "POST");
    assert.equal(captured.url, `${BASE}/freshness/check`);
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), { asset_id: "a1", table_path: "db.schema.orders" });
    assert.deepEqual(out, { fresh: true });
  });

  it("setup_freshness POSTs asset, table and interval; a blank table is rejected first", async () => {
    const { fetchFn, captured } = fakeFetch({ id: "s1" });
    await setupFreshness(fetchFn, CFG, { asset_id: "a1", table_path: "db.schema.orders", check_interval: "1h" });
    assert.equal(captured.url, `${BASE}/freshness/setup`);
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), {
      asset_id: "a1", table_path: "db.schema.orders", check_interval: "1h",
    });
    await assert.rejects(() => setupFreshness(fetchFn, CFG, { asset_id: "a1", table_path: " " }), /table_path/);
    assert.equal(captured.calls, 1);
  });

  it("list and manage freshness schedules hit their paths", async () => {
    const a = fakeFetch([]); await listFreshnessSchedules(a.fetchFn, CFG, { asset_id: "a1" });
    const url = new URL(a.captured.url ?? "");
    assert.equal(url.pathname, "/freshness/schedules");
    assert.equal(url.searchParams.get("asset_id"), "a1");
    const b = fakeFetch({}); await manageFreshnessSchedule(b.fetchFn, CFG, { schedule_id: "s1", action: "pause" });
    assert.equal(b.captured.method, "POST");
    assert.equal(b.captured.url, `${BASE}/freshness/schedules/s1/manage`);
    assert.deepEqual(JSON.parse(b.captured.body ?? "{}"), { action: "pause" });
  });
});

describe("schema", () => {
  it("list_schema_changes passes asset, severity and date range", async () => {
    const { fetchFn, captured } = fakeFetch([]);
    await listSchemaChanges(fetchFn, CFG, {
      asset_id: "a1", severity: "breaking", from_date: "2026-01-01", to_date: "2026-02-01",
    });
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/schema/changes");
    assert.equal(url.searchParams.get("asset_id"), "a1");
    assert.equal(url.searchParams.get("severity"), "breaking");
    assert.equal(url.searchParams.get("from_date"), "2026-01-01");
    assert.equal(url.searchParams.get("to_date"), "2026-02-01");
  });

  it("create_schema_baseline POSTs asset and description", async () => {
    const { fetchFn, captured } = fakeFetch({ id: "b1" });
    await createSchemaBaseline(fetchFn, CFG, { asset_id: "a1", description: "initial" });
    assert.equal(captured.method, "POST");
    assert.equal(captured.url, `${BASE}/schema/baselines`);
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), { asset_id: "a1", description: "initial" });
  });

  it("get_schema_monitoring hits /schema/monitoring/{asset_id}", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await getSchemaMonitoring(fetchFn, CFG, { asset_id: "a1" });
    assert.equal(captured.url, `${BASE}/schema/monitoring/a1`);
  });

  it("honours a custom base URL", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await healthSummary(fetchFn, { baseUrl: "https://example.test/api/", apiKey: "k" });
    assert.equal(captured.url, "https://example.test/api/health/summary");
  });
});

describe("errors", () => {
  it("HTTP 401 surfaces status and upstream message", async () => {
    const failing: FetchFn = async () => jsonResponse({ message: "bad key" }, 401, "Unauthorized");
    await assert.rejects(() => healthSummary(failing, CFG), /HTTP 401.*bad key/);
  });

  it("network failure is wrapped with context", async () => {
    const failing: FetchFn = async () => { throw new Error("socket hang up"); };
    await assert.rejects(() => healthSummary(failing, CFG), /Datawatch API request failed: socket hang up/);
  });
});
