import crypto from 'node:crypto';

const PAYCORE_URL = 'https://pay-staging.appvibe.biz.id';
const APP_KEY_ID = 'pk_staging_narraza_01'; // from .staging.vars
const APP_SECRET = 'c50aqkZIUvFZz2SPJS3wvsASMeLfDrlq';

async function request(method, path, body) {
  const timestamp = new Date().toISOString();
  const rawBody = body ? JSON.stringify(body) : '';
  
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const message = `${timestamp}.${method.toUpperCase()}.${path}.${bodyHash}`;
  
  const hmac = crypto.createHmac('sha256', APP_SECRET);
  hmac.update(message);
  const signature = `sha256=${hmac.digest('hex')}`;

  const res = await fetch(`${PAYCORE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-PayCore-App': 'narraza',
      'X-PayCore-Key-Id': APP_KEY_ID,
      'X-PayCore-Timestamp': timestamp,
      'X-PayCore-Signature': signature,
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: body ? rawBody : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API Error ${res.status}: ${text}`);
  }

  return res.json();
}

async function runE2E() {
  console.log('1. Creating Payment Order...');
  const order = await request('POST', '/v1/orders', {
    external_order_id: `test-mayar-${Date.now()}`,
    product_key: 'test-product',
    description: 'E2E Test Mayar Integration',
    amount: 1000,
    currency: 'IDR',
    customer: {
      name: 'Test User',
      email: 'test@example.com',
      phone: '081234567890'
    },
    return_url: 'https://app.narraza.web.id/payment/return',
    fulfillment_data: { test: true }
  });

  console.log('Order Created Successfully!');
  console.log('Order ID:', order.order_id);
  console.log('Provider:', order.provider);
  console.log('Checkout URL:', order.checkout_url);
  console.log('\n2. Please open the Checkout URL in your browser and complete the payment.');
  console.log('Waiting for webhook to process the payment (polling every 5 seconds)...\n');

  let attempts = 0;
  while (attempts < 60) {
    await new Promise(r => setTimeout(r, 5000));
    attempts++;
    
    try {
      const status = await request('GET', `/v1/orders/${order.order_id}`);
      console.log(`[Attempt ${attempts}] Payment Status: ${status.payment_status} | Fulfillment: ${status.fulfillment_status}`);
      
      if (status.payment_status === 'paid' && status.fulfillment_status === 'queued') {
        console.log('\n✅ Payment verified and fulfillment queued successfully!');
        break;
      }
    } catch (e) {
      console.error('Error polling status:', e.message);
    }
  }
}

runE2E().catch(console.error);
