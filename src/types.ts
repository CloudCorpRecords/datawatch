/**
 * datawatch types.
 *
 * Shapes are documented reconstructions from the public tool
 * spec of a data-observability platform: alerts are listed with
 * status / severity / asset / date-range filters, freshness is
 * checked per asset and table path, and schema changes are
 * listed the same way alerts are. HTTP access is described by a
 * minimal response surface so tests can inject a fake fetch and
 * never touch the network.
 */

export interface DatawatchConfig {
  baseUrl: string;
  apiKey: string;
}

export interface ListAlertsOptions {
  status?: string;
  severity?: string;
  asset_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface ListInboxAlertsOptions {
  status?: string;
  limit?: number;
}

export interface UpdateAlertOptions {
  alert_id: string;
  action: string;
  comment?: string;
}

export interface AlertTrendsOptions {
  period?: string;
}

export interface AlertHistoryOptions {
  alert_id: string;
}

export interface ListAlertRulesOptions {
  asset_id?: string;
  is_active?: boolean;
}

export interface CreateAlertRuleOptions {
  asset_id: string;
  rule_type: string;
  config?: Record<string, unknown>;
}

export interface ManageAlertRuleOptions {
  rule_id: string;
  action: string;
}

export interface ListAssetsOptions {
  source?: string;
  asset_type?: string;
  search?: string;
}

export interface CreateAssetOptions {
  name: string;
  source_type: string;
  connection_config?: Record<string, unknown>;
}

export interface ManageAssetOptions {
  asset_id: string;
  action: string;
}

export interface AssetIdOptions {
  asset_id: string;
}

export interface CheckFreshnessOptions {
  asset_id: string;
  table_path?: string;
}

export interface SetupFreshnessOptions {
  asset_id: string;
  table_path: string;
  check_interval?: string;
}

export interface ListFreshnessSchedulesOptions {
  asset_id?: string;
}

export interface ManageFreshnessScheduleOptions {
  schedule_id: string;
  action: string;
}

export interface ListSchemaChangesOptions {
  asset_id?: string;
  severity?: string;
  from_date?: string;
  to_date?: string;
}

export interface CreateSchemaBaselineOptions {
  asset_id: string;
  description?: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
