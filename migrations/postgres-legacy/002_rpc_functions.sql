-- Atomic operations for PayCore

CREATE OR REPLACE FUNCTION paycore_reserve_idempotency(
  p_app_id UUID,
  p_key VARCHAR,
  p_request_hash VARCHAR
)
RETURNS TABLE (
  outcome VARCHAR,
  payment_order_id UUID,
  response_body JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing idempotency_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_existing
  FROM idempotency_keys
  WHERE app_id = p_app_id AND idempotency_key = p_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.request_hash <> p_request_hash THEN
      RETURN QUERY SELECT 'request_mismatch'::VARCHAR, NULL::UUID, NULL::JSONB;
      RETURN;
    END IF;

    RETURN QUERY
    SELECT
      CASE
        WHEN v_existing.response_body IS NOT NULL THEN 'replay'::VARCHAR
        ELSE 'in_progress'::VARCHAR
      END,
      v_existing.payment_order_id,
      v_existing.response_body;
    RETURN;
  END IF;

  INSERT INTO idempotency_keys (app_id, idempotency_key, request_hash)
  VALUES (p_app_id, p_key, p_request_hash);

  RETURN QUERY SELECT 'reserved_new'::VARCHAR, NULL::UUID, NULL::JSONB;
END;
$$;

CREATE OR REPLACE FUNCTION paycore_complete_idempotency(
  p_app_id UUID,
  p_key VARCHAR,
  p_payment_order_id UUID,
  p_response_body JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE idempotency_keys
  SET payment_order_id = p_payment_order_id,
      response_body = p_response_body
  WHERE app_id = p_app_id AND idempotency_key = p_key;
END;
$$;

CREATE OR REPLACE FUNCTION paycore_record_webhook_paid(
  p_event_id VARCHAR,
  p_provider VARCHAR,
  p_merchant_profile_id UUID,
  p_order_uuid UUID,
  p_provider_event_id VARCHAR,
  p_payload_hash VARCHAR,
  p_raw_payload JSONB,
  p_signature_valid BOOLEAN,
  p_provider_reference VARCHAR,
  p_paid_amount BIGINT
)
RETURNS TABLE (
  outcome VARCHAR,
  internal_event_id VARCHAR,
  payment_order_public_id VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order payment_orders%ROWTYPE;
  v_internal_event_id VARCHAR;
BEGIN
  SELECT * INTO v_order
  FROM payment_orders
  WHERE id = p_order_uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'order_not_found'::VARCHAR, NULL::VARCHAR, NULL::VARCHAR;
    RETURN;
  END IF;

  IF p_signature_valid = false THEN
    INSERT INTO payment_events (
      event_id, provider, merchant_profile_id, order_id, provider_event_id,
      event_type, payload_hash, raw_payload, signature_valid, processing_status, processed_at
    ) VALUES (
      p_event_id, p_provider, p_merchant_profile_id, p_order_uuid, p_provider_event_id,
      'provider.callback', p_payload_hash, p_raw_payload, false, 'rejected', now()
    )
    ON CONFLICT (provider, payload_hash) DO NOTHING;

    RETURN QUERY SELECT 'invalid_signature'::VARCHAR, NULL::VARCHAR, v_order.order_id;
    RETURN;
  END IF;

  INSERT INTO payment_events (
    event_id, provider, merchant_profile_id, order_id, provider_event_id,
    event_type, payload_hash, raw_payload, signature_valid, processing_status, processed_at
  ) VALUES (
    p_event_id, p_provider, p_merchant_profile_id, p_order_uuid, p_provider_event_id,
    'provider.callback.paid', p_payload_hash, p_raw_payload, true, 'processed', now()
  )
  ON CONFLICT (provider, payload_hash) DO NOTHING;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'duplicate'::VARCHAR, v_order.internal_event_id, v_order.order_id;
    RETURN;
  END IF;

  IF v_order.amount <> p_paid_amount OR v_order.currency <> 'IDR' THEN
    UPDATE payment_orders
    SET payment_status = 'manual_review', updated_at = now()
    WHERE id = p_order_uuid;

    RETURN QUERY SELECT 'amount_mismatch'::VARCHAR, NULL::VARCHAR, v_order.order_id;
    RETURN;
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RETURN QUERY SELECT 'already_paid'::VARCHAR, v_order.internal_event_id, v_order.order_id;
    RETURN;
  END IF;

  IF v_order.payment_status IN ('cancelled', 'refunded') THEN
    UPDATE payment_orders
    SET payment_status = 'manual_review', updated_at = now()
    WHERE id = p_order_uuid;

    RETURN QUERY SELECT 'invalid_transition'::VARCHAR, NULL::VARCHAR, v_order.order_id;
    RETURN;
  END IF;

  v_internal_event_id := 'evt_' || replace(gen_random_uuid()::text, '-', '');

  UPDATE payment_orders
  SET
    payment_status = 'paid',
    fulfillment_status = 'queued',
    provider_reference = COALESCE(p_provider_reference, provider_reference),
    paid_at = now(),
    internal_event_id = v_internal_event_id,
    updated_at = now()
  WHERE id = p_order_uuid;

  RETURN QUERY SELECT 'paid'::VARCHAR, v_internal_event_id, v_order.order_id;
END;
$$;