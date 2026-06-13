import crypto from 'node:crypto';

export async function createSnapTransaction({ orderNumber, amount, customer, items }) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return null;
  const production = process.env.MIDTRANS_IS_PRODUCTION === 'true';
  const url = production
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`
    },
    body: JSON.stringify({
      transaction_details: { order_id: orderNumber, gross_amount: amount },
      customer_details: { first_name: customer.name, email: customer.email, phone: customer.phone },
      item_details: items,
      callbacks: { finish: `${process.env.BASE_URL || 'http://localhost:3000'}/#success?order=${encodeURIComponent(orderNumber)}` }
    })
  });
  if (!response.ok) throw new Error(`Midtrans error ${response.status}: ${await response.text()}`);
  return response.json();
}

export function verifyMidtransSignature(payload) {
  const source = `${payload.order_id}${payload.status_code}${payload.gross_amount}${process.env.MIDTRANS_SERVER_KEY || ''}`;
  const expected = crypto.createHash('sha512').update(source).digest('hex');
  const received = String(payload.signature_key || '');
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function mapMidtransStatus(payload) {
  const status = String(payload.transaction_status || '');
  if ((status === 'capture' && payload.fraud_status === 'accept') || status === 'settlement') return 'paid';
  if (status === 'expire') return 'expired';
  if (['deny', 'cancel', 'failure'].includes(status)) return 'failed';
  if (['refund', 'partial_refund'].includes(status)) return 'refunded';
  return 'pending';
}
