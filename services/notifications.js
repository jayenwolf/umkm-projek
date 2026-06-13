// Hubungkan provider email/WhatsApp resmi di file ini.
// Fungsi tetap aman dipanggil saat provider belum dikonfigurasi.
export async function queueNotification(client, { orderId, channel, recipient, template, payload }) {
  await client.query(
    `INSERT INTO notifications (order_id, channel, recipient, template, status, payload)
     VALUES ($1,$2,$3,$4,'queued',$5::jsonb)`,
    [orderId, channel, recipient, template, JSON.stringify(payload || {})]
  );
  console.log(`[notification:${channel}] ${template} -> ${recipient}`);
}
