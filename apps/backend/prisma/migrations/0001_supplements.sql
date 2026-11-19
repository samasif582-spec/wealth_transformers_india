-- =============================================================================
-- SUPPLEMENT MIGRATION 0001: Triggers, RLS, Functions, Indexes
-- Run after: prisma migrate deploy
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Full-text search on clients
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION clients_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.full_name, '') || ' ' ||
    COALESCE(NEW.whatsapp_number, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clients_search_vector_trigger ON clients;
CREATE TRIGGER clients_search_vector_trigger
  BEFORE INSERT OR UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION clients_search_vector_update();

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS clients_search_vector_idx
  ON clients USING GIN (search_vector);

-- ---------------------------------------------------------------------------
-- 2. Row-Level Security on audit_logs (append-only)
-- ---------------------------------------------------------------------------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow only INSERT — no UPDATE or DELETE policy means those are denied
DROP POLICY IF EXISTS audit_insert_only ON audit_logs;
CREATE POLICY audit_insert_only ON audit_logs
  FOR INSERT
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. Delivery status ordering function (IMMUTABLE for query planner)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delivery_status_ordinal(s text)
RETURNS INT AS $$
BEGIN
  RETURN CASE s
    WHEN 'QUEUED'        THEN 0
    WHEN 'SENT'          THEN 1
    WHEN 'DELIVERED'     THEN 2
    WHEN 'READ'          THEN 3
    WHEN 'FAILED'        THEN 4
    WHEN 'UNDELIVERABLE' THEN 5
    ELSE -1
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- 4. Monotonic delivery status update (never regresses)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_delivery_status_monotonic(
  p_meta_message_id  VARCHAR,
  p_new_status       TEXT,
  p_timestamp        TIMESTAMPTZ
) RETURNS VOID AS $$
BEGIN
  UPDATE message_logs
  SET
    delivery_status = p_new_status::delivery_status,
    sent_at       = CASE WHEN p_new_status = 'SENT'      THEN p_timestamp ELSE sent_at       END,
    delivered_at  = CASE WHEN p_new_status = 'DELIVERED' THEN p_timestamp ELSE delivered_at  END,
    read_at       = CASE WHEN p_new_status = 'READ'      THEN p_timestamp ELSE read_at       END,
    failed_at     = CASE WHEN p_new_status = 'FAILED'    THEN p_timestamp ELSE failed_at     END,
    updated_at    = NOW()
  WHERE
    meta_message_id = p_meta_message_id
    AND delivery_status_ordinal(delivery_status::text) < delivery_status_ordinal(p_new_status);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 5. Settings hot-reload via PostgreSQL LISTEN/NOTIFY
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_settings_changed()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('settings_changed', NEW.key);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS settings_notify_trigger ON application_settings;
CREATE TRIGGER settings_notify_trigger
  AFTER INSERT OR UPDATE ON application_settings
  FOR EACH ROW EXECUTE FUNCTION notify_settings_changed();

-- ---------------------------------------------------------------------------
-- 6. Composite index for analytics queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS message_logs_analytics_idx
  ON message_logs (campaign_id, delivery_status, dispatched_at);

-- ---------------------------------------------------------------------------
-- 7. Partial index for webhook event TTL cleanup
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS webhook_events_expires_at_idx
  ON webhook_events (expires_at)
  WHERE processing_status = 'PROCESSED';

-- ---------------------------------------------------------------------------
-- 8. NOTE: Client.communicationConsent denormalized cache
-- Must be updated atomically with every WhatsappConsent INSERT:
--   UPDATE clients SET communication_consent = $new_status WHERE id = $client_id
-- This enables O(1) consent lookups during audience resolution.
-- ---------------------------------------------------------------------------
