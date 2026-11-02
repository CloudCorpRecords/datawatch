/**
 * datawatch MCP server.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * that are not in this tool's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schemas as explicit literals, while zod
 * still validates every tools/call argument set.
 *
 * Config is read from the environment at call time:
 * ARMOR_API_KEY (required; a missing key errors before any
 * request), DATAWATCH_API_URL (optional, default
 * https://api.anomalyarmor.ai).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
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

const NoArgs = z.object({});
const ListAlertsArgs = z.object({
  status: z.string().optional(),
  severity: z.string().optional(),
  asset_id: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
const ListInboxArgs = z.object({
  status: z.string().optional(),
  limit: z.number().int().optional(),
});
const UpdateAlertArgs = z.object({
  alert_id: z.string(),
  action: z.string(),
  comment: z.string().optional(),
});
const TrendsArgs = z.object({ period: z.string().optional() });
const AlertIdArgs = z.object({ alert_id: z.string() });
const ListRulesArgs = z.object({
  asset_id: z.string().optional(),
  is_active: z.boolean().optional(),
});
const CreateRuleArgs = z.object({
  asset_id: z.string(),
  rule_type: z.string(),
  config: z.record(z.unknown()).optional(),
});
const ManageRuleArgs = z.object({ rule_id: z.string(), action: z.string() });
const ListAssetsArgs = z.object({
  source: z.string().optional(),
  asset_type: z.string().optional(),
  search: z.string().optional(),
});
const CreateAssetArgs = z.object({
  name: z.string(),
  source_type: z.string(),
  connection_config: z.record(z.unknown()).optional(),
});
const ManageAssetArgs = z.object({ asset_id: z.string(), action: z.string() });
const AssetIdArgs = z.object({ asset_id: z.string() });
const CheckFreshnessArgs = z.object({
  asset_id: z.string(),
  table_path: z.string().optional(),
});
const SetupFreshnessArgs = z.object({
  asset_id: z.string(),
  table_path: z.string(),
  check_interval: z.string().optional(),
});
const ListSchedulesArgs = z.object({ asset_id: z.string().optional() });
const ManageScheduleArgs = z.object({ schedule_id: z.string(), action: z.string() });
const ListSchemaChangesArgs = z.object({
  asset_id: z.string().optional(),
  severity: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
const CreateBaselineArgs = z.object({
  asset_id: z.string(),
  description: z.string().optional(),
});

const EMPTY_SCHEMA = { type: "object" as const, properties: {} };

const TOOLS = [
  { name: "health_summary", description: "Get an overall health summary of the monitored data platform.", inputSchema: EMPTY_SCHEMA },
  { name: "get_todays_briefing", description: "Get today's briefing of notable data-observability events.", inputSchema: EMPTY_SCHEMA },
  { name: "get_alerts_summary", description: "Get a summary of current alerts.", inputSchema: EMPTY_SCHEMA },
  {
    name: "list_alerts",
    description: "List alerts, optionally filtered by status, severity, asset, and date range.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Alert status filter." },
        severity: { type: "string", description: "Severity filter." },
        asset_id: { type: "string", description: "Asset id filter." },
        from_date: { type: "string", description: "Earliest alert date to include, YYYY-MM-DD." },
        to_date: { type: "string", description: "Latest alert date to include, YYYY-MM-DD." },
      },
    },
  },
  {
    name: "list_inbox_alerts",
    description: "List alerts in the inbox, optionally filtered by status and capped by limit.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Alert status filter." },
        limit: { type: "integer", description: "Maximum number of alerts to return." },
      },
    },
  },
  {
    name: "update_alert",
    description: "Apply an action to an alert, with an optional comment.",
    inputSchema: {
      type: "object" as const,
      properties: {
        alert_id: { type: "string", description: "Alert id to update." },
        action: { type: "string", description: "Action to apply to the alert." },
        comment: { type: "string", description: "Optional comment recorded with the action." },
      },
      required: ["alert_id", "action"],
    },
  },
  {
    name: "get_alert_trends",
    description: "Get alert trends, optionally for a given period.",
    inputSchema: {
      type: "object" as const,
      properties: { period: { type: "string", description: "Period to compute alert trends over." } },
    },
  },
  {
    name: "get_alert_history",
    description: "Get the history of an alert by id.",
    inputSchema: {
      type: "object" as const,
      properties: { alert_id: { type: "string", description: "Alert id whose history to fetch." } },
      required: ["alert_id"],
    },
  },
  {
    name: "list_alert_rules",
    description: "List alert rules, optionally filtered by asset and active flag.",
    inputSchema: {
      type: "object" as const,
      properties: {
        asset_id: { type: "string", description: "Asset id filter." },
        is_active: { type: "boolean", description: "When given, only return rules with this active flag." },
      },
    },
  },
  {
    name: "create_alert_rule",
    description: "Create an alert rule for an asset with a rule type and optional config.",
    inputSchema: {
      type: "object" as const,
      properties: {
        asset_id: { type: "string", description: "Asset id the rule watches." },
        rule_type: { type: "string", description: "Alert rule type." },
        config: { type: "object", description: "Optional rule configuration object." },
      },
      required: ["asset_id", "rule_type"],
    },
  },
  {
    name: "manage_alert_rule",
    description: "Apply a management action to an alert rule by id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        rule_id: { type: "string", description: "Alert rule id." },
        action: { type: "string", description: "Management action to apply to the rule." },
      },
      required: ["rule_id", "action"],
    },
  },
  {
    name: "list_assets",
    description: "List data assets, optionally filtered by source, asset type, and search text.",
    inputSchema: {
      type: "object" as const,
      properties: {
        source: { type: "string", description: "Source filter." },
        asset_type: { type: "string", description: "Asset type filter." },
        search: { type: "string", description: "Free-text search over assets." },
      },
    },
  },
  {
    name: "create_asset",
    description: "Create a data asset with a name and source type, plus optional connection config.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Asset name." },
        source_type: { type: "string", description: "Asset source type." },
        connection_config: { type: "object", description: "Optional connection configuration object." },
      },
      required: ["name", "source_type"],
    },
  },
  {
    name: "manage_asset",
    description: "Apply a management action to a data asset by id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        asset_id: { type: "string", description: "Asset id." },
        action: { type: "string", description: "Management action to apply to the asset." },
      },
      required: ["asset_id", "action"],
    },
  },
  {
    name: "trigger_asset_discovery",
    description: "Trigger discovery for a data asset by id.",
    inputSchema: {
      type: "object" as const,
      properties: { asset_id: { type: "string", description: "Asset id to run discovery for." } },
      required: ["asset_id"],
    },
  },
  { name: "get_freshness_summary", description: "Get a summary of data freshness across monitored assets.", inputSchema: EMPTY_SCHEMA },
  {
    name: "check_freshness",
    description: "Check freshness for an asset, optionally for a specific table path.",
    inputSchema: {
      type: "object" as const,
      properties: {
        asset_id: { type: "string", description: "Asset id to check freshness for." },
        table_path: { type: "string", description: "Optional table path to check within the asset." },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "setup_freshness",
    description: "Set up freshness monitoring for an asset's table, with an optional check interval.",
    inputSchema: {
      type: "object" as const,
      properties: {
        asset_id: { type: "string", description: "Asset id to set up freshness monitoring for." },
        table_path: { type: "string", description: "Table path to monitor." },
        check_interval: { type: "string", description: "Optional check interval for the freshness checks." },
      },
      required: ["asset_id", "table_path"],
    },
  },
  {
    name: "list_freshness_schedules",
    description: "List freshness schedules, optionally filtered by asset.",
    inputSchema: {
      type: "object" as const,
      properties: { asset_id: { type: "string", description: "Asset id filter." } },
    },
  },
  {
    name: "manage_freshness_schedule",
    description: "Apply a management action to a freshness schedule by id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        schedule_id: { type: "string", description: "Freshness schedule id." },
        action: { type: "string", description: "Management action to apply to the schedule." },
      },
      required: ["schedule_id", "action"],
    },
  },
  { name: "get_schema_summary", description: "Get a summary of schema monitoring and recent drift.", inputSchema: EMPTY_SCHEMA },
  {
    name: "list_schema_changes",
    description: "List schema changes, optionally filtered by asset, severity, and date range.",
    inputSchema: {
      type: "object" as const,
      properties: {
        asset_id: { type: "string", description: "Asset id filter." },
        severity: { type: "string", description: "Severity filter." },
        from_date: { type: "string", description: "Earliest change date to include, YYYY-MM-DD." },
        to_date: { type: "string", description: "Latest change date to include, YYYY-MM-DD." },
      },
    },
  },
  {
    name: "create_schema_baseline",
    description: "Create a schema baseline for an asset, with an optional description.",
    inputSchema: {
      type: "object" as const,
      properties: {
        asset_id: { type: "string", description: "Asset id to baseline." },
        description: { type: "string", description: "Optional baseline description." },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "get_schema_monitoring",
    description: "Get schema monitoring status for an asset by id.",
    inputSchema: {
      type: "object" as const,
      properties: { asset_id: { type: "string", description: "Asset id to get schema monitoring status for." } },
      required: ["asset_id"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "datawatch", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const config = resolveConfig(process.env);
  try {
    let out: unknown;
    switch (name) {
      case "health_summary": NoArgs.parse(args ?? {}); out = await healthSummary(fetchFn, config); break;
      case "get_todays_briefing": NoArgs.parse(args ?? {}); out = await getTodaysBriefing(fetchFn, config); break;
      case "get_alerts_summary": NoArgs.parse(args ?? {}); out = await getAlertsSummary(fetchFn, config); break;
      case "list_alerts": out = await listAlerts(fetchFn, config, ListAlertsArgs.parse(args ?? {})); break;
      case "list_inbox_alerts": out = await listInboxAlerts(fetchFn, config, ListInboxArgs.parse(args ?? {})); break;
      case "update_alert": out = await updateAlert(fetchFn, config, UpdateAlertArgs.parse(args ?? {})); break;
      case "get_alert_trends": out = await getAlertTrends(fetchFn, config, TrendsArgs.parse(args ?? {})); break;
      case "get_alert_history": out = await getAlertHistory(fetchFn, config, AlertIdArgs.parse(args ?? {})); break;
      case "list_alert_rules": out = await listAlertRules(fetchFn, config, ListRulesArgs.parse(args ?? {})); break;
      case "create_alert_rule": out = await createAlertRule(fetchFn, config, CreateRuleArgs.parse(args ?? {})); break;
      case "manage_alert_rule": out = await manageAlertRule(fetchFn, config, ManageRuleArgs.parse(args ?? {})); break;
      case "list_assets": out = await listAssets(fetchFn, config, ListAssetsArgs.parse(args ?? {})); break;
      case "create_asset": out = await createAsset(fetchFn, config, CreateAssetArgs.parse(args ?? {})); break;
      case "manage_asset": out = await manageAsset(fetchFn, config, ManageAssetArgs.parse(args ?? {})); break;
      case "trigger_asset_discovery": out = await triggerAssetDiscovery(fetchFn, config, AssetIdArgs.parse(args ?? {})); break;
      case "get_freshness_summary": NoArgs.parse(args ?? {}); out = await getFreshnessSummary(fetchFn, config); break;
      case "check_freshness": out = await checkFreshness(fetchFn, config, CheckFreshnessArgs.parse(args ?? {})); break;
      case "setup_freshness": out = await setupFreshness(fetchFn, config, SetupFreshnessArgs.parse(args ?? {})); break;
      case "list_freshness_schedules": out = await listFreshnessSchedules(fetchFn, config, ListSchedulesArgs.parse(args ?? {})); break;
      case "manage_freshness_schedule": out = await manageFreshnessSchedule(fetchFn, config, ManageScheduleArgs.parse(args ?? {})); break;
      case "get_schema_summary": NoArgs.parse(args ?? {}); out = await getSchemaSummary(fetchFn, config); break;
      case "list_schema_changes": out = await listSchemaChanges(fetchFn, config, ListSchemaChangesArgs.parse(args ?? {})); break;
      case "create_schema_baseline": out = await createSchemaBaseline(fetchFn, config, CreateBaselineArgs.parse(args ?? {})); break;
      case "get_schema_monitoring": out = await getSchemaMonitoring(fetchFn, config, AssetIdArgs.parse(args ?? {})); break;
      default: throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
