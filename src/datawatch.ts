/**
 * datawatch core: data-observability tools (alerts, freshness,
 * schema drift) over an API-key REST API.
 *
 * Auth: ARMOR_API_KEY is required; a missing or blank key is an
 * error raised BEFORE any request is made. The key is sent with
 * every request as the X-API-Key header. The base URL comes
 * from DATAWATCH_API_URL and defaults to
 * https://api.anomalyarmor.ai (labelled reconstruction).
 *
 * Endpoint map (labelled reconstruction):
 *   health_summary            GET  /health/summary
 *   get_todays_briefing       GET  /briefing/today
 *   get_alerts_summary        GET  /alerts/summary
 *   list_alerts               GET  /alerts?status=&severity=&asset_id=&from_date=&to_date=
 *   list_inbox_alerts         GET  /alerts/inbox?status=&limit=
 *   update_alert              POST /alerts/{alert_id}/update
 *   get_alert_trends          GET  /alerts/trends?period=
 *   get_alert_history         GET  /alerts/{alert_id}/history
 *   list_alert_rules          GET  /alert-rules?asset_id=&is_active=
 *   create_alert_rule         POST /alert-rules
 *   manage_alert_rule         POST /alert-rules/{rule_id}/manage
 *   list_assets               GET  /assets?source=&asset_type=&search=
 *   create_asset              POST /assets
 *   manage_asset              POST /assets/{asset_id}/manage
 *   trigger_asset_discovery   POST /assets/{asset_id}/discovery
 *   get_freshness_summary     GET  /freshness/summary
 *   check_freshness           POST /freshness/check
 *   setup_freshness           POST /freshness/setup
 *   list_freshness_schedules  GET  /freshness/schedules?asset_id=
 *   manage_freshness_schedule POST /freshness/schedules/{schedule_id}/manage
 *   get_schema_summary        GET  /schema/summary
 *   list_schema_changes       GET  /schema/changes?asset_id=&severity=&from_date=&to_date=
 *   create_schema_baseline    POST /schema/baselines
 *   get_schema_monitoring     GET  /schema/monitoring/{asset_id}
 *
 * This is a labelled core subset: the documented set enumerates
 * 52 tool names and this rebuild implements 24 of them (see the
 * fixture _source for the 28 omitted names). All HTTP goes
 * through an injected FetchFn so everything is testable offline
 * with a fake fetch.
 */
import type {
  AlertHistoryOptions,
  AlertTrendsOptions,
  AssetIdOptions,
  CheckFreshnessOptions,
  CreateAlertRuleOptions,
  CreateAssetOptions,
  CreateSchemaBaselineOptions,
  DatawatchConfig,
  FetchFn,
  ListAlertRulesOptions,
  ListAlertsOptions,
  ListAssetsOptions,
  ListFreshnessSchedulesOptions,
  ListInboxAlertsOptions,
  ListSchemaChangesOptions,
  ManageAlertRuleOptions,
  ManageAssetOptions,
  ManageFreshnessScheduleOptions,
  SetupFreshnessOptions,
  UpdateAlertOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_BASE_URL = "https://api.anomalyarmor.ai";

export const BASE_URL_ENV = "DATAWATCH_API_URL";
export const API_KEY_ENV = "ARMOR_API_KEY";

/** Resolve the API base URL: env value when non-blank, else default. Trailing slashes are stripped. */
export function resolveBaseUrl(value?: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  return (v ? v : DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * Build a config from environment-style values. The key is kept
 * as given (possibly blank); callApi rejects a blank key before
 * any request, which is the missing-key gate.
 */
export function resolveConfig(env: {
  [BASE_URL_ENV]?: string;
  [API_KEY_ENV]?: string;
}): DatawatchConfig {
  return {
    baseUrl: resolveBaseUrl(env[BASE_URL_ENV]),
    apiKey: typeof env[API_KEY_ENV] === "string" ? env[API_KEY_ENV].trim() : "",
  };
}

function requireNonEmpty(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} must be a non-empty string`);
  return v;
}

function optionalParam(value: unknown): string | undefined {
  const v = typeof value === "string" ? value.trim() : "";
  return v ? v : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function callApi(
  fetchFn: FetchFn,
  config: DatawatchConfig,
  method: string,
  path: string,
  opts: { query?: Record<string, string>; body?: Record<string, unknown> } = {},
): Promise<unknown> {
  // Missing-key gate: errors BEFORE any request is made.
  if (!config || typeof config.apiKey !== "string" || !config.apiKey.trim()) {
    throw new Error(`${API_KEY_ENV} is required: set an AnomalyArmor API key before making requests`);
  }
  let url = `${resolveBaseUrl(config.baseUrl)}${path}`;
  if (opts.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) params.set(k, v);
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-API-Key": config.apiKey.trim(),
  };
  const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  let response;
  try {
    response = await fetchFn(url, init);
  } catch (err) {
    throw new Error(
      `Datawatch API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload)) {
        if (typeof payload.message === "string" && payload.message) {
          detail = `: ${payload.message}`;
        } else if (typeof payload.error === "string" && payload.error) {
          detail = `: ${payload.error}`;
        }
      }
    } catch {
      // A non-JSON error body still reports its HTTP status below.
    }
    throw new Error(
      `Datawatch API request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail}`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Datawatch API returned a response that was not valid JSON");
  }
}

function queryOf(entries: Record<string, string | undefined>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(entries)) {
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function enc(value: string, field: string): string {
  return encodeURIComponent(requireNonEmpty(value, field));
}

// --- health, briefing, alert summaries --------------------------------

export async function healthSummary(fetchFn: FetchFn, config: DatawatchConfig): Promise<unknown> {
  return callApi(fetchFn, config, "GET", "/health/summary");
}

export async function getTodaysBriefing(fetchFn: FetchFn, config: DatawatchConfig): Promise<unknown> {
  return callApi(fetchFn, config, "GET", "/briefing/today");
}

export async function getAlertsSummary(fetchFn: FetchFn, config: DatawatchConfig): Promise<unknown> {
  return callApi(fetchFn, config, "GET", "/alerts/summary");
}

// --- alerts -------------------------------------------------------------

export async function listAlerts(fetchFn: FetchFn, config: DatawatchConfig, options: ListAlertsOptions = {}): Promise<unknown> {
  const query = queryOf({
    status: optionalParam(options.status),
    severity: optionalParam(options.severity),
    asset_id: optionalParam(options.asset_id),
    from_date: optionalParam(options.from_date),
    to_date: optionalParam(options.to_date),
  });
  return callApi(fetchFn, config, "GET", "/alerts", { query });
}

export async function listInboxAlerts(fetchFn: FetchFn, config: DatawatchConfig, options: ListInboxAlertsOptions = {}): Promise<unknown> {
  const query = queryOf({
    status: optionalParam(options.status),
    limit: typeof options.limit === "number" ? String(options.limit) : undefined,
  });
  return callApi(fetchFn, config, "GET", "/alerts/inbox", { query });
}

export async function updateAlert(fetchFn: FetchFn, config: DatawatchConfig, options: UpdateAlertOptions): Promise<unknown> {
  const body: Record<string, unknown> = { action: requireNonEmpty(options.action, "action") };
  const comment = optionalParam(options.comment);
  if (comment) body.comment = comment;
  return callApi(fetchFn, config, "POST", `/alerts/${enc(options.alert_id, "alert_id")}/update`, { body });
}

export async function getAlertTrends(fetchFn: FetchFn, config: DatawatchConfig, options: AlertTrendsOptions = {}): Promise<unknown> {
  const query = queryOf({ period: optionalParam(options.period) });
  return callApi(fetchFn, config, "GET", "/alerts/trends", { query });
}

export async function getAlertHistory(fetchFn: FetchFn, config: DatawatchConfig, options: AlertHistoryOptions): Promise<unknown> {
  return callApi(fetchFn, config, "GET", `/alerts/${enc(options.alert_id, "alert_id")}/history`);
}

// --- alert rules ----------------------------------------------------------

export async function listAlertRules(fetchFn: FetchFn, config: DatawatchConfig, options: ListAlertRulesOptions = {}): Promise<unknown> {
  const query = queryOf({
    asset_id: optionalParam(options.asset_id),
    is_active: typeof options.is_active === "boolean" ? String(options.is_active) : undefined,
  });
  return callApi(fetchFn, config, "GET", "/alert-rules", { query });
}

export async function createAlertRule(fetchFn: FetchFn, config: DatawatchConfig, options: CreateAlertRuleOptions): Promise<unknown> {
  const body: Record<string, unknown> = {
    asset_id: requireNonEmpty(options.asset_id, "asset_id"),
    rule_type: requireNonEmpty(options.rule_type, "rule_type"),
  };
  if (isRecord(options.config)) body.config = options.config;
  return callApi(fetchFn, config, "POST", "/alert-rules", { body });
}

export async function manageAlertRule(fetchFn: FetchFn, config: DatawatchConfig, options: ManageAlertRuleOptions): Promise<unknown> {
  const body: Record<string, unknown> = { action: requireNonEmpty(options.action, "action") };
  return callApi(fetchFn, config, "POST", `/alert-rules/${enc(options.rule_id, "rule_id")}/manage`, { body });
}

// --- assets ---------------------------------------------------------------

export async function listAssets(fetchFn: FetchFn, config: DatawatchConfig, options: ListAssetsOptions = {}): Promise<unknown> {
  const query = queryOf({
    source: optionalParam(options.source),
    asset_type: optionalParam(options.asset_type),
    search: optionalParam(options.search),
  });
  return callApi(fetchFn, config, "GET", "/assets", { query });
}

export async function createAsset(fetchFn: FetchFn, config: DatawatchConfig, options: CreateAssetOptions): Promise<unknown> {
  const body: Record<string, unknown> = {
    name: requireNonEmpty(options.name, "name"),
    source_type: requireNonEmpty(options.source_type, "source_type"),
  };
  if (isRecord(options.connection_config)) body.connection_config = options.connection_config;
  return callApi(fetchFn, config, "POST", "/assets", { body });
}

export async function manageAsset(fetchFn: FetchFn, config: DatawatchConfig, options: ManageAssetOptions): Promise<unknown> {
  const body: Record<string, unknown> = { action: requireNonEmpty(options.action, "action") };
  return callApi(fetchFn, config, "POST", `/assets/${enc(options.asset_id, "asset_id")}/manage`, { body });
}

export async function triggerAssetDiscovery(fetchFn: FetchFn, config: DatawatchConfig, options: AssetIdOptions): Promise<unknown> {
  return callApi(fetchFn, config, "POST", `/assets/${enc(options.asset_id, "asset_id")}/discovery`);
}

// --- freshness --------------------------------------------------------------

export async function getFreshnessSummary(fetchFn: FetchFn, config: DatawatchConfig): Promise<unknown> {
  return callApi(fetchFn, config, "GET", "/freshness/summary");
}

export async function checkFreshness(fetchFn: FetchFn, config: DatawatchConfig, options: CheckFreshnessOptions): Promise<unknown> {
  const body: Record<string, unknown> = { asset_id: requireNonEmpty(options.asset_id, "asset_id") };
  const table = optionalParam(options.table_path);
  if (table) body.table_path = table;
  return callApi(fetchFn, config, "POST", "/freshness/check", { body });
}

export async function setupFreshness(fetchFn: FetchFn, config: DatawatchConfig, options: SetupFreshnessOptions): Promise<unknown> {
  const body: Record<string, unknown> = {
    asset_id: requireNonEmpty(options.asset_id, "asset_id"),
    table_path: requireNonEmpty(options.table_path, "table_path"),
  };
  const interval = optionalParam(options.check_interval);
  if (interval) body.check_interval = interval;
  return callApi(fetchFn, config, "POST", "/freshness/setup", { body });
}

export async function listFreshnessSchedules(fetchFn: FetchFn, config: DatawatchConfig, options: ListFreshnessSchedulesOptions = {}): Promise<unknown> {
  const query = queryOf({ asset_id: optionalParam(options.asset_id) });
  return callApi(fetchFn, config, "GET", "/freshness/schedules", { query });
}

export async function manageFreshnessSchedule(fetchFn: FetchFn, config: DatawatchConfig, options: ManageFreshnessScheduleOptions): Promise<unknown> {
  const body: Record<string, unknown> = { action: requireNonEmpty(options.action, "action") };
  return callApi(fetchFn, config, "POST", `/freshness/schedules/${enc(options.schedule_id, "schedule_id")}/manage`, { body });
}

// --- schema -----------------------------------------------------------------

export async function getSchemaSummary(fetchFn: FetchFn, config: DatawatchConfig): Promise<unknown> {
  return callApi(fetchFn, config, "GET", "/schema/summary");
}

export async function listSchemaChanges(fetchFn: FetchFn, config: DatawatchConfig, options: ListSchemaChangesOptions = {}): Promise<unknown> {
  const query = queryOf({
    asset_id: optionalParam(options.asset_id),
    severity: optionalParam(options.severity),
    from_date: optionalParam(options.from_date),
    to_date: optionalParam(options.to_date),
  });
  return callApi(fetchFn, config, "GET", "/schema/changes", { query });
}

export async function createSchemaBaseline(fetchFn: FetchFn, config: DatawatchConfig, options: CreateSchemaBaselineOptions): Promise<unknown> {
  const body: Record<string, unknown> = { asset_id: requireNonEmpty(options.asset_id, "asset_id") };
  const description = optionalParam(options.description);
  if (description) body.description = description;
  return callApi(fetchFn, config, "POST", "/schema/baselines", { body });
}

export async function getSchemaMonitoring(fetchFn: FetchFn, config: DatawatchConfig, options: AssetIdOptions): Promise<unknown> {
  return callApi(fetchFn, config, "GET", `/schema/monitoring/${enc(options.asset_id, "asset_id")}`);
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
