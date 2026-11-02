# datawatch — Build Report

MCP Rebuild 1000. Clean-room rebuild of anomalyarmor/agents
(MCP Registry rank 201, 1 star), built from the public README
spec captured in
`harness/fixtures/anomalyarmor-agents-tools-original.json`.
That fixture is docs-derived: it records a LABELLED CORE
SUBSET of the documented tools, and the argument schemas are
documented reconstructions from the README's signature
sketches — no original server was probed. Parity proves the
rebuild matches this program's defined spec, labelled
docs-derived. Local build only — nothing pushed or published.

**Count note (29 vs 52 discrepancy):** the original README's
section heading says "29 consolidated" tools while its version
line says 52, and its sections enumerate exactly 52 distinct
tool names. This rebuild implements 24 of the enumerated 52
as a labelled core subset; the other 28 are listed by name in
the fixture `_source` and under Gaps below. Nothing was
silently dropped.

Identity: repo `datawatch`, npm `@reneturcios/datawatch`,
MCP name `io.github.CloudCorpRecords/datawatch`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `datawatch: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Data observability: alerts,
  freshness checks and schema drift for your data assets."
  = **83 chars** (≤100 ✓); npm entry carries `version: 0.1.0`;
  OCI entry `ghcr.io/cloudcorprecords/datawatch:0.1.0` carries
  **no** `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/datawatch"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27)
- `src/index.ts`, `src/cli.ts` (subcommands mirror the tool
  names, plus `mcp` and `--version`; exit 2 usage / 1 API error),
  `src/mcp.ts`, `src/types.ts`, `src/datawatch.ts` (core logic,
  `VERSION = "0.1.0"`)
- `test/datawatch.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to datawatch)

## Tools implemented (24, labelled core subset of 52 enumerated)

`health_summary`, `get_todays_briefing`, `get_alerts_summary`,
`list_alerts`, `list_inbox_alerts`, `update_alert`,
`get_alert_trends`, `get_alert_history`, `list_alert_rules`,
`create_alert_rule`, `manage_alert_rule`, `list_assets`,
`create_asset`, `manage_asset`, `trigger_asset_discovery`,
`get_freshness_summary`, `check_freshness`, `setup_freshness`,
`list_freshness_schedules`, `manage_freshness_schedule`,
`get_schema_summary`, `list_schema_changes`,
`create_schema_baseline`, `get_schema_monitoring`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the standing fleet rule: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the defined spec
  and break exact schema parity. Zod still validates every
  `tools/call` (including `limit` as an integer and `is_active`
  as a boolean).
- Schemas are documented reconstructions (labelled) from the
  README signature sketches in the task spec: `*` parameters are
  required, the rest optional; strings unless noted (`limit`
  integer, `is_active` boolean, `config` / `connection_config`
  objects).
- Endpoints under the base URL (env `DATAWATCH_API_URL`, default
  `https://api.anomalyarmor.ai`, labelled reconstruction, trailing
  slashes stripped) follow the map in the `src/datawatch.ts`
  header: `/health/summary`, `/briefing/today`, `/alerts` (plus
  `/summary`, `/inbox`, `/trends`, `/{id}/update`, `/{id}/history`),
  `/alert-rules` (plus `/{id}/manage`), `/assets` (plus
  `/{id}/manage`, `/{id}/discovery`), `/freshness` (`/summary`,
  `/check`, `/setup`, `/schedules`, `/schedules/{id}/manage`), and
  `/schema` (`/summary`, `/changes`, `/baselines`,
  `/monitoring/{asset_id}`). Path and method choices are
  reconstructions, labelled as such.
- Auth: `ARMOR_API_KEY` is required. A missing or blank key
  raises an error naming the variable **before any request is
  made** (the call gate sits ahead of the fetch invocation; a spy
  test proves the fetch is never called). The key is sent as the
  `X-API-Key` header (header name is a documented reconstruction).
- HTTP failures surface the status plus the upstream `message`
  or `error` string when present.
- All HTTP flows through an injectable `FetchFn` (types.ts). The
  test suite uses a fake fetch returning hand-written JSON
  fixtures; no live call is made in tests.

## Verification (foreground, exact outputs)

### 1. Build
```
$ npm run build
tsc exit=0
```
`dist/` produced, including `dist/cli.js`.

### 2. Tests
```
$ npm test
ℹ tests 26
ℹ pass 26
ℹ fail 0
```
Covers: base-URL default/custom/trailing-slash handling and
config resolution; the missing-key-before-request spy test
(fetch never called) and the X-API-Key header on a real (fake)
request; the five summary/briefing paths; list_alerts with all
five filters and with none; inbox status + integer limit;
update_alert body with and without comment and blank-action
rejection before any request; trends and history paths; blank
alert id rejected; alert-rule list with `is_active=false`,
create body with config object, manage path/body; asset list
filters, create body with connection config, manage and
discovery paths; freshness check and setup bodies, blank
table_path rejection, schedule list/manage; schema-changes
filters, baseline body, monitoring path; custom base URL;
HTTP 401 surfacing the upstream message; network failure
wrapping.

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); unknown command exits 2 with
Usage; `health_summary` with no `ARMOR_API_KEY` in the
environment exits 1 with an error naming `ARMOR_API_KEY` — the
missing-key gate exercised end to end with no live call made
and none claimed. MCP `tools/list` returned 24 tools during
the parity run below.

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/anomalyarmor-agents-tools-original.json \
    --rebuild "stdio:node .../builds/datawatch/dist/cli.js mcp" \
    --out /tmp/datawatch-parity
verdict=PASS parity_pct=100.0 original_tools=24 rebuild_tools=24 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 24/24, against the labelled core
subset fixture.) Original side is tools-file mode, so
`fixture_results` records `SKIPPED-TOOLS-FILE-MODE` — expected
harness semantics, not an error. The passing run wrote to /tmp
and its parity.json/parity.md were copied into `parity-out/`
and verified non-empty (2142 and 1593 bytes).

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp
copy holding only `package.json` (no `node_modules`), offline
`npm install --package-lock-only --ignore-scripts`, verified
after generation — parses as JSON, top-level `name` is
`@reneturcios/datawatch`, version `0.1.0`, `lockfileVersion` 3,
128 package entries — then only the lockfile was copied back.
Local `node_modules` is a sibling copy (sociallens) used only
for the local build/test; it is not part of the lockfile
generation.

## Gaps / honest notes

- **Labelled core subset — 28 documented tools omitted:**
  `enable_schema_monitoring`, `disable_schema_monitoring`,
  `dry_run_schema`, `get_metrics_summary`, `list_metrics`,
  `create_metric`, `manage_metric`, `get_validity_summary`,
  `list_validity_rules`, `create_validity_rule`,
  `manage_validity_rule`, `create_referential_check`,
  `manage_referential`, `list_destinations`,
  `setup_destination`, `manage_destination`,
  `manage_rule_destinations`, `get_coverage`, `manage_coverage`,
  `recommend`, `ask_question`, `generate_intelligence`,
  `get_lineage`, `job_status`, `create_tag`, `list_tags`,
  `apply_tags`, `get_api_key_info`. The omitted families are
  metrics, validity/referential checks, destinations, coverage,
  recommendations, Q&A/intelligence, lineage, jobs, tags, and
  API-key info.
- **Count discrepancy (29 vs 52):** the original README heading
  claims 29 tools, its version line claims 52, and enumeration
  of its sections yields exactly 52 distinct names. Recorded in
  the fixture `_source`; the subset is measured against the 52
  enumerated names, not either headline number.
- Docs-derived spec: the argument schemas, endpoint paths and
  methods, the base URL default (`https://api.anomalyarmor.ai`),
  and the `X-API-Key` header name are documented reconstructions
  from the README signature sketches, per the task spec — no
  original anomalyarmor/agents server was probed, so parity
  proves the rebuild matches this program's defined spec, not a
  hand-probed original.
- No live call was made: every endpoint is fake-fetch tested
  only, so live payload/response-shape drift against
  api.anomalyarmor.ai is unverified until the publish wave.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
