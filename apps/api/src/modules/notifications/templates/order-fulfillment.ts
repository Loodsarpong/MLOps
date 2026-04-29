import type { OrderFulfillmentPayload } from '../notifications.service';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const money = (n: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

export function renderOrderFulfillment(p: OrderFulfillmentPayload): { html: string; text: string } {
  const greeting = p.warehouse.clerk_name ? `Hi ${escape(p.warehouse.clerk_name)},` : 'Hi,';
  const when = p.occurredAt.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });

  const linesHtml = p.lines
    .map(
      (l) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escape(l.sku ?? '')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escape(l.description)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${l.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${money(l.unit_price, p.currency)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${money(l.line_total, p.currency)}</td>
      </tr>`,
    )
    .join('');

  const linesText = p.lines
    .map((l) => `  - ${l.sku ?? ''}  ${l.description}  x${l.quantity}  @ ${money(l.unit_price, p.currency)}  = ${money(l.line_total, p.currency)}`)
    .join('\n');

  const html = `<!doctype html>
<html><body style="font-family:Helvetica,Arial,sans-serif;color:#222;max-width:680px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 8px;">New order ready to ship</h2>
  <p style="margin:0 0 16px;color:#555;">${greeting} a paid order has come in for fulfillment.</p>

  <table style="border-collapse:collapse;margin-bottom:20px;">
    <tr><td style="padding:2px 12px 2px 0;color:#777;">Order</td><td><strong>${escape(p.orderNo)}</strong></td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#777;">Invoice</td><td>${escape(p.invoiceNo)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#777;">Customer</td><td>${escape(p.customerName ?? 'Walk-in')}</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#777;">Payment</td><td>${escape(p.paymentMethod)} — paid in full</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#777;">Placed</td><td>${escape(when)} (ET)</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#777;">Warehouse</td><td>${escape(p.warehouse.name)} (${escape(p.warehouse.code)})</td></tr>
  </table>

  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead>
      <tr style="background:#f5f5f5;text-align:left;">
        <th style="padding:8px;">SKU</th>
        <th style="padding:8px;">Description</th>
        <th style="padding:8px;text-align:right;">Qty</th>
        <th style="padding:8px;text-align:right;">Unit</th>
        <th style="padding:8px;text-align:right;">Line</th>
      </tr>
    </thead>
    <tbody>${linesHtml}</tbody>
  </table>

  <table style="margin-top:12px;margin-left:auto;font-size:14px;">
    <tr><td style="padding:2px 12px 2px 0;color:#777;">Subtotal</td><td style="text-align:right;">${money(p.totals.subtotal, p.currency)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#777;">Sales tax</td><td style="text-align:right;">${money(p.totals.tax, p.currency)}</td></tr>
    <tr><td style="padding:6px 12px 2px 0;"><strong>Total</strong></td><td style="text-align:right;padding-top:6px;"><strong>${money(p.totals.total, p.currency)}</strong></td></tr>
  </table>

  <p style="margin-top:24px;color:#777;font-size:12px;">Reply to this email if you need any details corrected. — NaturalShea Care</p>
</body></html>`;

  const text = `New order ready to ship

${greeting} a paid order has come in for fulfillment.

Order:    ${p.orderNo}
Invoice:  ${p.invoiceNo}
Customer: ${p.customerName ?? 'Walk-in'}
Payment:  ${p.paymentMethod} — paid in full
Placed:   ${when} (ET)
Warehouse: ${p.warehouse.name} (${p.warehouse.code})

Items:
${linesText}

Subtotal:  ${money(p.totals.subtotal, p.currency)}
Sales tax: ${money(p.totals.tax, p.currency)}
Total:     ${money(p.totals.total, p.currency)}
`;

  return { html, text };
}
