# datawatch

datawatch talks to a data-observability platform's API: platform
health and a daily briefing, alerts (summaries, inbox, trends,
history and rules), the data assets under observation and their
discovery, freshness summaries, checks and schedules, and schema
summaries, change lists, baselines and monitoring. One binary
serves a command-line interface and a stdio MCP server.

An API key is required. Set `ARMOR_API_KEY` before use; when it
is missing or blank, every tool fails with an error naming the
variable before any request is made. The API base URL can be
overridden with `DATAWATCH_API_URL`; when it is not set, calls
go to `https://api.anomalyarmor.ai` (a labelled reconstruction).

Scope note: the platform's documentation enumerates 52 tool
names (its own heading says 29 and its version line says 52;
the enumerated sections list 52). datawatch implements a
labelled core subset of 24 of them — alerts, assets, freshness
and schema drift — and omits the metrics, validity, referential,
destination, coverage, recommendation, Q&A, intelligence,
lineage, job, tag and API-key tools.

## Install

```bash
npx @reneturcios/datawatch get_alerts_summary
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/datawatch
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

The subcommands mirror the MCP tool names:

```bash
export ARMOR_API_KEY=...

datawatch health_summary
datawatch get_todays_briefing
datawatch list_alerts --status open --severity high
datawatch list_inbox_alerts --limit 20
datawatch update_alert --alert-id al1 --action acknowledge --comment "looking into it"
datawatch get_alert_trends --period 7d
datawatch list_alert_rules --asset-id a1 --is-active true
datawatch create_alert_rule --asset-id a1 --rule-type freshness --config '{"threshold_hours":24}'
datawatch list_assets --source snowflake --search orders
datawatch create_asset --name warehouse --source-type snowflake
datawatch trigger_asset_discovery --asset-id a1
datawatch check_freshness --asset-id a1 --table-path db.schema.orders
datawatch setup_freshness --asset-id a1 --table-path db.schema.orders --check-interval 1h
datawatch list_schema_changes --severity breaking
datawatch create_schema_baseline --asset-id a1 --description initial
datawatch get_schema_monitoring --asset-id a1

datawatch --version
```

Results print the upstream JSON payload. Exit codes: `0` on
success, `1` when a call fails (including a missing key or an
upstream API error), `2` for usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio
MCP server:

```bash
npx -y @reneturcios/datawatch mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "datawatch": {
      "command": "npx",
      "args": ["-y", "@reneturcios/datawatch", "mcp"],
      "env": { "ARMOR_API_KEY": "..." }
    }
  }
}
```

### Tools

| Tool | Input | What it does |
| --- | --- | --- |
| `health_summary` | (none) | Overall platform health summary. |
| `get_todays_briefing` | (none) | Today's observability briefing. |
| `get_alerts_summary` | (none) | Summary of current alerts. |
| `list_alerts` | `status`, `severity`, `asset_id`, `from_date`, `to_date` | List alerts with optional filters. |
| `list_inbox_alerts` | `status`, `limit` (integer) | List inbox alerts. |
| `update_alert` | `alert_id`, `action` (both required), `comment` | Apply an action to an alert. |
| `get_alert_trends` | `period` | Alert trends for a period. |
| `get_alert_history` | `alert_id` (required) | History of one alert. |
| `list_alert_rules` | `asset_id`, `is_active` (boolean) | List alert rules. |
| `create_alert_rule` | `asset_id`, `rule_type` (both required), `config` (object) | Create an alert rule. |
| `manage_alert_rule` | `rule_id`, `action` (both required) | Manage an alert rule. |
| `list_assets` | `source`, `asset_type`, `search` | List data assets. |
| `create_asset` | `name`, `source_type` (both required), `connection_config` (object) | Create a data asset. |
| `manage_asset` | `asset_id`, `action` (both required) | Manage a data asset. |
| `trigger_asset_discovery` | `asset_id` (required) | Trigger asset discovery. |
| `get_freshness_summary` | (none) | Freshness summary across assets. |
| `check_freshness` | `asset_id` (required), `table_path` | Check one asset's freshness. |
| `setup_freshness` | `asset_id`, `table_path` (both required), `check_interval` | Set up freshness monitoring. |
| `list_freshness_schedules` | `asset_id` | List freshness schedules. |
| `manage_freshness_schedule` | `schedule_id`, `action` (both required) | Manage a freshness schedule. |
| `get_schema_summary` | (none) | Schema monitoring summary. |
| `list_schema_changes` | `asset_id`, `severity`, `from_date`, `to_date` | List schema changes. |
| `create_schema_baseline` | `asset_id` (required), `description` | Create a schema baseline. |
| `get_schema_monitoring` | `asset_id` (required) | Schema monitoring for one asset. |

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
