# Changelog

## 0.1.0 (2026-10-27)

- Initial release.
- CLI subcommands mirror the MCP tools, plus `datawatch mcp`
  and `--version`.
- MCP server (`datawatch mcp`, stdio) with a labelled core
  subset of the documented tool set: health and briefing,
  alerts (summary, list, inbox, update, trends, history) and
  alert rules, data assets and discovery, freshness summary,
  checks and schedules, and schema summary, changes, baselines
  and monitoring.
- Calls go to the data-observability API under the base URL
  from `DATAWATCH_API_URL`, defaulting to
  `https://api.anomalyarmor.ai`.
- `ARMOR_API_KEY` is required and a missing key errors before
  any request is made.
- All HTTP goes through an injectable fetch function, so the
  test suite runs entirely on hand-written fixtures with no
  network access.
