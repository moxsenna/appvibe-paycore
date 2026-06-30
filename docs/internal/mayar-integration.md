# Mayar Integration

## Webhook Verification Strategy (S2S Lookup)

Currently, the Mayar webhook (`/webhooks/mayar`) does not rely on a symmetric webhook secret or signature header for verification. Instead, it uses a Server-to-Server (S2S) Invoice Lookup approach:

1. The webhook endpoint receives an event (e.g., `payment.received`).
2. It parses the payload to extract the transaction ID/reference.
3. It makes a direct API call to `MAYAR_BASE_URL` using `MAYAR_API_KEY` to verify the payment status.
4. If the S2S lookup confirms the invoice is paid and the amounts match, the payment is recorded as verified.

**Important:** If Mayar introduces or requires a webhook token/signature in the future, the environment variables (`MAYAR_WEBHOOK_SECRET`) and the `WebhookService` must be updated to validate the HMAC signature before processing the event.

## Required Environment Variables

To enable Mayar integration in production, the following secrets must be set in the Cloudflare Worker environment:

- `MAYAR_API_KEY`: The API key for Mayar.
- `MAYAR_BASE_URL`: The base URL for Mayar API (e.g., `https://api.mayar.id`).
