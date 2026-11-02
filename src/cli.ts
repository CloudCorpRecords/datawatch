#!/usr/bin/env node
/**
 * datawatch CLI. Subcommands mirror the MCP tool names:
 *
 *   datawatch health_summary
 *   datawatch list_alerts [--status open] [--severity high] [--asset-id a1] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD]
 *   datawatch list_inbox_alerts [--status unread] [--limit 20]
 *   datawatch update_alert --alert-id al1 --action acknowledge [--comment <text>]
 *   datawatch create_alert_rule --asset-id a1 --rule-type freshness [--config <json>]
 *   datawatch create_asset --name warehouse --source-type snowflake [--connection-config <json>]
 *   datawatch check_freshness --asset-id a1 [--table-path db.schema.table]
 *   datawatch setup_freshness --asset-id a1 --table-path db.schema.table [--check-interval 1h]
 *   datawatch list_schema_changes [--asset-id a1] [--severity high]
 *   datawatch mcp
 *
 * Env: ARMOR_API_KEY (required), DATAWATCH_API_URL (default
 * https://api.anomalyarmor.ai).
 * Exit codes: 0 success, 1 API error, 2 usage error.
 */
import {
  checkFreshness,
  createAlertRule,
  createAsset,
  createSchemaBaseline,
  formatPayload,
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
  resolveConfig,
  setupFreshness,
  triggerAssetDiscovery,
  updateAlert,
  VERSION,
} from "./datawatch.js";
import type { FetchFn } from "./types.js";

const TOOLS = [
  "health_summary", "get_todays_briefing", "get_alerts_summary",
  "list_alerts", "list_inbox_alerts", "update_alert", "get_alert_trends",
  "get_alert_history", "list_alert_rules", "create_alert_rule",
  "manage_alert_rule", "list_assets", "create_asset", "manage_asset",
  "trigger_asset_discovery", "get_freshness_summary", "check_freshness",
  "setup_freshness", "list_freshness_schedules", "manage_freshness_schedule",
  "get_schema_summary", "list_schema_changes", "create_schema_baseline",
  "get_schema_monitoring",
];

function usage(): never {
  console.error(`Usage:
  datawatch <tool> [flags]
  datawatch mcp
  datawatch --version

Tools: ${TOOLS.join(", ")}

Flags: --status <s> --severity <s> --asset-id <id> --alert-id <id>
  --rule-id <id> --schedule-id <id> --action <a> --comment <text>
  --period <p> --from-date <d> --to-date <d> --limit <n>
  --is-active true|false --rule-type <t> --config <json>
  --source <s> --asset-type <t> --search <text> --name <n>
  --source-type <t> --connection-config <json>
  --table-path <path> --check-interval <interval> --description <text>`);
  process.exit(2);
}

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

function reqFlag(rest: string[], name: string): string {
  const v = flag(rest, name);
  if (!v) usage();
  return v;
}

function jsonFlag(rest: string[], name: string): Record<string, unknown> | undefined {
  const raw = flag(rest, name);
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to usage error
  }
  return usage();
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd || !TOOLS.includes(cmd)) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const config = resolveConfig(process.env);
  const limitRaw = flag(rest, "--limit");
  const limit = limitRaw === undefined ? undefined : Number.parseInt(limitRaw, 10);
  if (limitRaw !== undefined && Number.isNaN(limit)) usage();
  const isActiveRaw = flag(rest, "--is-active");
  try {
    let out: unknown;
    switch (cmd) {
      case "health_summary": out = await healthSummary(fetchFn, config); break;
      case "get_todays_briefing": out = await getTodaysBriefing(fetchFn, config); break;
      case "get_alerts_summary": out = await getAlertsSummary(fetchFn, config); break;
      case "list_alerts": out = await listAlerts(fetchFn, config, {
        status: flag(rest, "--status"),
        severity: flag(rest, "--severity"),
        asset_id: flag(rest, "--asset-id"),
        from_date: flag(rest, "--from-date"),
        to_date: flag(rest, "--to-date"),
      }); break;
      case "list_inbox_alerts": out = await listInboxAlerts(fetchFn, config, {
        status: flag(rest, "--status"),
        limit,
      }); break;
      case "update_alert": out = await updateAlert(fetchFn, config, {
        alert_id: reqFlag(rest, "--alert-id"),
        action: reqFlag(rest, "--action"),
        comment: flag(rest, "--comment"),
      }); break;
      case "get_alert_trends": out = await getAlertTrends(fetchFn, config, { period: flag(rest, "--period") }); break;
      case "get_alert_history": out = await getAlertHistory(fetchFn, config, { alert_id: reqFlag(rest, "--alert-id") }); break;
      case "list_alert_rules": out = await listAlertRules(fetchFn, config, {
        asset_id: flag(rest, "--asset-id"),
        is_active: isActiveRaw === undefined ? undefined : isActiveRaw === "true",
      }); break;
      case "create_alert_rule": out = await createAlertRule(fetchFn, config, {
        asset_id: reqFlag(rest, "--asset-id"),
        rule_type: reqFlag(rest, "--rule-type"),
        config: jsonFlag(rest, "--config"),
      }); break;
      case "manage_alert_rule": out = await manageAlertRule(fetchFn, config, {
        rule_id: reqFlag(rest, "--rule-id"),
        action: reqFlag(rest, "--action"),
      }); break;
      case "list_assets": out = await listAssets(fetchFn, config, {
        source: flag(rest, "--source"),
        asset_type: flag(rest, "--asset-type"),
        search: flag(rest, "--search"),
      }); break;
      case "create_asset": out = await createAsset(fetchFn, config, {
        name: reqFlag(rest, "--name"),
        source_type: reqFlag(rest, "--source-type"),
        connection_config: jsonFlag(rest, "--connection-config"),
      }); break;
      case "manage_asset": out = await manageAsset(fetchFn, config, {
        asset_id: reqFlag(rest, "--asset-id"),
        action: reqFlag(rest, "--action"),
      }); break;
      case "trigger_asset_discovery": out = await triggerAssetDiscovery(fetchFn, config, { asset_id: reqFlag(rest, "--asset-id") }); break;
      case "get_freshness_summary": out = await getFreshnessSummary(fetchFn, config); break;
      case "check_freshness": out = await checkFreshness(fetchFn, config, {
        asset_id: reqFlag(rest, "--asset-id"),
        table_path: flag(rest, "--table-path"),
      }); break;
      case "setup_freshness": out = await setupFreshness(fetchFn, config, {
        asset_id: reqFlag(rest, "--asset-id"),
        table_path: reqFlag(rest, "--table-path"),
        check_interval: flag(rest, "--check-interval"),
      }); break;
      case "list_freshness_schedules": out = await listFreshnessSchedules(fetchFn, config, { asset_id: flag(rest, "--asset-id") }); break;
      case "manage_freshness_schedule": out = await manageFreshnessSchedule(fetchFn, config, {
        schedule_id: reqFlag(rest, "--schedule-id"),
        action: reqFlag(rest, "--action"),
      }); break;
      case "get_schema_summary": out = await getSchemaSummary(fetchFn, config); break;
      case "list_schema_changes": out = await listSchemaChanges(fetchFn, config, {
        asset_id: flag(rest, "--asset-id"),
        severity: flag(rest, "--severity"),
        from_date: flag(rest, "--from-date"),
        to_date: flag(rest, "--to-date"),
      }); break;
      case "create_schema_baseline": out = await createSchemaBaseline(fetchFn, config, {
        asset_id: reqFlag(rest, "--asset-id"),
        description: flag(rest, "--description"),
      }); break;
      default: out = await getSchemaMonitoring(fetchFn, config, { asset_id: reqFlag(rest, "--asset-id") }); break;
    }
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
