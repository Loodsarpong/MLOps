import { describe, it, expect } from 'vitest';
import { renderOrderFulfillment } from '../../src/modules/notifications/templates/order-fulfillment';
import type { OrderFulfillmentPayload } from '../../src/modules/notifications/notifications.service';

const fixture: OrderFulfillmentPayload = {
  orderId: '00000000-0000-0000-0000-000000000001',
  orderNo: 'SO-2026-ABCD1234',
  invoiceNo: 'INV-2026-ABCD1234',
  warehouse: {
    id: '00000000-0000-0000-0000-0000000000WH',
    code: 'WH-BLUEASH',
    name: 'Brendamour Blue Ash DC',
    clerk_name: 'Don',
    clerk_email: 'ba2@brendamour.com',
    address: { city: 'Cincinnati', state: 'OH' },
  },
  customerName: 'Beauty Haven LLC',
  paymentMethod: 'card',
  currency: 'USD',
  totals: { subtotal: 100, tax: 7.8, total: 107.8 },
  lines: [
    { sku: 'SKU-SHEA-BB-200', description: 'Raw Shea Body Butter 200g', quantity: 2, unit_price: 35, line_total: 70 },
    { sku: 'SKU-SHEA-SOAP', description: 'African Black Soap Bar', quantity: 1, unit_price: 18, line_total: 18 },
  ],
  occurredAt: new Date('2026-04-27T14:30:00Z'),
};

describe('renderOrderFulfillment', () => {
  it('greets the named clerk', () => {
    const { html, text } = renderOrderFulfillment(fixture);
    expect(html).toContain('Hi Don,');
    expect(text).toContain('Hi Don,');
  });

  it('falls back to a generic greeting when no clerk name is set', () => {
    const { html, text } = renderOrderFulfillment({
      ...fixture,
      warehouse: { ...fixture.warehouse, clerk_name: null },
    });
    expect(html).toContain('Hi,');
    expect(text).toContain('Hi,');
  });

  it('includes order, invoice, customer, and warehouse identifiers', () => {
    const { html, text } = renderOrderFulfillment(fixture);
    for (const out of [html, text]) {
      expect(out).toContain('SO-2026-ABCD1234');
      expect(out).toContain('INV-2026-ABCD1234');
      expect(out).toContain('Beauty Haven LLC');
      expect(out).toContain('Brendamour Blue Ash DC');
      expect(out).toContain('WH-BLUEASH');
    }
  });

  it('renders every line item with sku, description, and qty', () => {
    const { html, text } = renderOrderFulfillment(fixture);
    for (const out of [html, text]) {
      expect(out).toContain('SKU-SHEA-BB-200');
      expect(out).toContain('Raw Shea Body Butter 200g');
      expect(out).toContain('SKU-SHEA-SOAP');
      expect(out).toContain('African Black Soap Bar');
    }
  });

  it('formats totals as USD with cents', () => {
    const { html, text } = renderOrderFulfillment(fixture);
    for (const out of [html, text]) {
      expect(out).toContain('$100.00'); // subtotal
      expect(out).toContain('$7.80');   // tax
      expect(out).toContain('$107.80'); // total
    }
  });

  it('escapes HTML-significant characters in user-supplied fields', () => {
    const { html } = renderOrderFulfillment({
      ...fixture,
      customerName: '<script>alert(1)</script>',
      warehouse: { ...fixture.warehouse, clerk_name: 'Don & Co' },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Don &amp; Co');
  });

  it('renders timestamp in Eastern time', () => {
    const { html } = renderOrderFulfillment(fixture);
    // The fixture timestamp is 14:30 UTC on Apr 27 — that's 10:30 AM ET (EDT).
    expect(html).toContain('10:30');
    expect(html).toContain('(ET)');
  });
});
