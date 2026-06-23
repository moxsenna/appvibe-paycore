-- Fulfillment delivery hardening: timestamps + atomic claim

ALTER TABLE fulfillment_deliveries
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fulfillment_deliveries_due_retry
  ON fulfillment_deliveries (next_retry_at)
  WHERE delivery_status IN ('queued', 'failed', 'pending');

CREATE INDEX IF NOT EXISTS idx_fulfillment_deliveries_processing_stale
  ON fulfillment_deliveries (claimed_at)
  WHERE delivery_status = 'processing';

CREATE INDEX IF NOT EXISTS idx_fulfillment_deliveries_claimable
  ON fulfillment_deliveries (next_retry_at)
  WHERE delivery_status IN ('pending', 'failed', 'queued');


-- Claim delivery for dispatch (queued/failed with due retry, or stale processing)
CREATE OR REPLACE FUNCTION paycore_claim_fulfillment_delivery(
  p_delivery_id UUID,
  p_now TIMESTAMPTZ DEFAULT now(),
  p_stale_processing_interval INTERVAL DEFAULT interval '15 minutes'
)
RETURNS TABLE (
  claimed BOOLEAN,
  delivery_id UUID,
  event_id VARCHAR,
  payment_order_id UUID,
  app_id UUID,
  attempt_number INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_row fulfillment_deliveries%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM fulfillment_deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::VARCHAR, NULL::UUID, NULL::UUID, NULL::INT;
    RETURN;
  END IF;

  IF v_row.delivery_status IN ('delivered', 'dead_letter', 'manual_review') THEN
    RETURN QUERY SELECT false, v_row.id, v_row.event_id, v_row.payment_order_id, v_row.app_id, v_row.attempt_number;
    RETURN;
  END IF;

  IF v_row.delivery_status = 'processing' THEN
    IF v_row.claimed_at IS NOT NULL AND v_row.claimed_at > (p_now - p_stale_processing_interval) THEN
      RETURN QUERY SELECT false, v_row.id, v_row.event_id, v_row.payment_order_id, v_row.app_id, v_row.attempt_number;
      RETURN;
    END IF;
  ELSIF v_row.delivery_status IN ('queued', 'failed', 'pending') THEN
    IF v_row.next_retry_at IS NOT NULL AND v_row.next_retry_at > p_now THEN
      RETURN QUERY SELECT false, v_row.id, v_row.event_id, v_row.payment_order_id, v_row.app_id, v_row.attempt_number;
      RETURN;
    END IF;
  ELSE
    RETURN QUERY SELECT false, v_row.id, v_row.event_id, v_row.payment_order_id, v_row.app_id, v_row.attempt_number;
    RETURN;
  END IF;

  UPDATE fulfillment_deliveries
  SET
    delivery_status = 'processing',
    claimed_at = p_now,
    last_attempt_at = p_now
  WHERE id = p_delivery_id;

  RETURN QUERY
  SELECT true, v_row.id, v_row.event_id, v_row.payment_order_id, v_row.app_id, v_row.attempt_number;
END;
$$;

-- List deliveries eligible for cron re-dispatch (due retry, not terminal)
CREATE OR REPLACE FUNCTION paycore_list_deliveries_due_retry(
  p_now TIMESTAMPTZ DEFAULT now(),
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  delivery_id UUID,
  event_id VARCHAR,
  payment_order_id UUID,
  app_id UUID,
  attempt_number INT,
  delivery_status VARCHAR
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    fd.id,
    fd.event_id,
    fd.payment_order_id,
    fd.app_id,
    fd.attempt_number,
    fd.delivery_status
  FROM fulfillment_deliveries fd
  INNER JOIN payment_orders po ON po.id = fd.payment_order_id
  WHERE po.payment_status = 'paid'
    AND po.fulfillment_status NOT IN ('delivered', 'manual_review')
    AND fd.delivery_status NOT IN ('delivered', 'dead_letter', 'manual_review')
    AND (
      (
        fd.delivery_status = 'processing'
        AND fd.claimed_at IS NOT NULL
        AND fd.claimed_at < (p_now - interval '15 minutes')
      )
      OR (
        fd.delivery_status IN ('queued', 'failed', 'pending')
        AND (fd.next_retry_at IS NULL OR fd.next_retry_at <= p_now)
      )
    )
  ORDER BY fd.next_retry_at NULLS FIRST, fd.created_at
  LIMIT p_limit;
$$;
