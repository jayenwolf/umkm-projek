const rates = {
  REG: Number(process.env.SHIPPING_REGULAR || 25000),
  YES: Number(process.env.SHIPPING_EXPRESS || 45000),
  SMD: Number(process.env.SHIPPING_LOCAL || 15000)
};

export function getShippingOptions({ subtotal = 0, city = '' } = {}) {
  const local = /samarinda/i.test(city);
  return [
    { code: 'REG', courier: 'JNE/J&T', service: 'Reguler 2–5 hari', cost: rates.REG },
    { code: 'YES', courier: 'Express', service: 'Express 1–2 hari', cost: rates.YES },
    ...(local ? [{ code: 'SMD', courier: 'Kurir Lokal', service: 'Same/next day', cost: subtotal >= 300000 ? 0 : rates.SMD }] : [])
  ];
}

export function shippingCost(code, subtotal, city) {
  const option = getShippingOptions({ subtotal, city }).find((item) => item.code === code);
  if (!option) throw new Error('Pilihan pengiriman tidak tersedia untuk alamat ini.');
  return option.cost;
}
