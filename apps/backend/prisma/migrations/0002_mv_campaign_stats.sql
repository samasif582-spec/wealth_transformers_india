-- =============================================================================
-- SUPPLEMENT MIGRATION 0002: Materialized View — Campaign Analytics
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_campaign_stats;

CREATE MATERIALIZED VIEW mv_campaign_stats AS
SELECT
  c.id                                                               AS campaign_id,
  c.name                                                             AS campaign_name,
  c.campaign_type,
  c.status                                                           AS campaign_status,
  COUNT(ml.id)                                                       AS total_recipients,
  COUNT(ml.id) FILTER (WHERE ml.delivery_status = 'SENT')           AS sent_count,
  COUNT(ml.id) FILTER (WHERE ml.delivery_status = 'DELIVERED')      AS delivered_count,
  COUNT(ml.id) FILTER (WHERE ml.delivery_status = 'READ')           AS read_count,
  COUNT(ml.id) FILTER (WHERE ml.delivery_status IN ('FAILED', 'UNDELIVERABLE')) AS failed_count,
  COUNT(cr.id) FILTER (WHERE cr.suppressed = TRUE)                  AS suppressed_count,
  COUNT(ml.id) FILTER (WHERE ml.retry_count > 0)                    AS retry_count,
  ROUND(
    COUNT(ml.id) FILTER (WHERE ml.delivery_status = 'DELIVERED')::NUMERIC
    / NULLIF(COUNT(ml.id), 0) * 100,
    2
  )                                                                   AS delivery_rate,
  ROUND(
    COUNT(ml.id) FILTER (WHERE ml.delivery_status = 'READ')::NUMERIC
    / NULLIF(COUNT(ml.id), 0) * 100,
    2
  )                                                                   AS read_rate,
  ROUND(
    COUNT(ml.id) FILTER (WHERE ml.delivery_status IN ('FAILED', 'UNDELIVERABLE'))::NUMERIC
    / NULLIF(COUNT(ml.id), 0) * 100,
    2
  )                                                                   AS failure_rate,
  COALESCE(SUM(ml.cost_inr), 0)                                      AS total_cost_inr,
  c.dispatched_at,
  c.completed_at
FROM campaigns c
LEFT JOIN message_logs ml
  ON ml.campaign_id = c.id
LEFT JOIN campaign_recipients cr
  ON cr.campaign_id = c.id AND cr.client_id = ml.client_id
GROUP BY
  c.id, c.name, c.campaign_type, c.status, c.dispatched_at, c.completed_at
WITH NO DATA;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX mv_campaign_stats_pk
  ON mv_campaign_stats (campaign_id);

-- Additional indexes for dashboard queries
CREATE INDEX mv_campaign_stats_status_idx
  ON mv_campaign_stats (campaign_status);

CREATE INDEX mv_campaign_stats_dispatched_idx
  ON mv_campaign_stats (dispatched_at);
