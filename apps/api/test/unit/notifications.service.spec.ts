import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { OrderFulfillmentPayload } from '../../src/modules/notifications/notifications.service';

// SES / SQS mock state.
const sesSendMock = vi.fn();
const sqsSendMock = vi.fn();

vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn().mockImplementation(() => ({ send: sesSendMock })),
  SendEmailCommand: vi.fn().mockImplementation((args) => ({ __type: 'SendEmail', ...args })),
}));
vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn().mockImplementation(() => ({ send: sqsSendMock })),
  SendMessageCommand: vi.fn().mockImplementation((args) => ({ __type: 'SendMessage', ...args })),
}));

// Tenant context mock — settable per test.
let mockTenant = { tenantId: 'T1', userId: 'U1', email: 'lsarpong@naturalsheacare.com', roles: ['admin'] };
vi.mock('../../src/common/tenancy/tenant.context', () => ({
  currentTenant: () => mockTenant,
}));

// Config mock — settable per test for SQS toggle.
let mockCfg = {
  SES_FROM: 'lsarpong@naturalsheacare.com',
  SES_FROM_ALLOWLIST: 'lsarpong@naturalsheacare.com,customer.service@naturalsheacare.com,maddo@naturalsheacare.com',
  SQS_EMAIL_URL: undefined as string | undefined,
};
vi.mock('../../src/config/env', () => ({
  loadConfig: () => mockCfg,
}));

// Build a minimal Kysely-shaped fluent mock that captures inserts/updates and
// returns configurable rows for selects.
function makeDb(opts: { existingLog?: { id: string; status: string } | null } = {}) {
  const insertedLogs: any[] = [];
  const updatedLogs: any[] = [];

  const selectChain = {
    select: () => selectChain,
    where: () => selectChain,
    executeTakeFirst: vi.fn(async () => opts.existingLog ?? undefined),
  };

  const insertChain = {
    values: (v: any) => {
      insertedLogs.push(v);
      return {
        returning: () => ({
          executeTakeFirstOrThrow: vi.fn(async () => ({ id: 'LOG-1' })),
        }),
      };
    },
  };

  const updateChain = {
    set: (v: any) => ({
      where: () => ({
        where: () => ({
          execute: vi.fn(async () => {
            updatedLogs.push(v);
          }),
        }),
        execute: vi.fn(async () => {
          updatedLogs.push(v);
        }),
      }),
    }),
  };

  const db = {
    selectFrom: () => selectChain,
    insertInto: () => insertChain,
    updateTable: () => updateChain,
  };

  return { db, insertedLogs, updatedLogs };
}

const fulfillment: OrderFulfillmentPayload = {
  orderId: 'O1',
  orderNo: 'SO-2026-XYZ',
  invoiceNo: 'INV-2026-XYZ',
  warehouse: {
    id: 'WH1', code: 'WH-BLUEASH', name: 'Brendamour Blue Ash DC',
    clerk_name: 'Don', clerk_email: 'ba2@brendamour.com', address: {},
  },
  customerName: 'Beauty Haven LLC',
  paymentMethod: 'card',
  currency: 'USD',
  totals: { subtotal: 100, tax: 7.8, total: 107.8 },
  lines: [{ sku: 'A', description: 'A', quantity: 1, unit_price: 100, line_total: 100 }],
  occurredAt: new Date(),
};

async function makeService(db: any) {
  // Re-import after mocks are set so the service picks them up.
  const { NotificationsService } = await import('../../src/modules/notifications/notifications.service');
  return new NotificationsService(db);
}

beforeEach(() => {
  sesSendMock.mockReset();
  sqsSendMock.mockReset();
  mockTenant = { tenantId: 'T1', userId: 'U1', email: 'lsarpong@naturalsheacare.com', roles: ['admin'] };
  mockCfg = {
    SES_FROM: 'lsarpong@naturalsheacare.com',
    SES_FROM_ALLOWLIST: 'lsarpong@naturalsheacare.com,customer.service@naturalsheacare.com,maddo@naturalsheacare.com',
    SQS_EMAIL_URL: undefined,
  };
  vi.resetModules();
});

describe('NotificationsService.sendOrderFulfillmentEmail', () => {
  it('skips dispatch when the warehouse has no clerk_email on file', async () => {
    const { db, insertedLogs } = makeDb();
    const svc = await makeService(db);
    await svc.sendOrderFulfillmentEmail({
      ...fulfillment,
      warehouse: { ...fulfillment.warehouse, clerk_email: null },
    });
    expect(sesSendMock).not.toHaveBeenCalled();
    expect(insertedLogs).toHaveLength(0);
  });

  it('is idempotent when a notification_log row already exists for the order', async () => {
    const { db, insertedLogs } = makeDb({ existingLog: { id: 'LOG-1', status: 'sent' } });
    const svc = await makeService(db);
    await svc.sendOrderFulfillmentEmail(fulfillment);
    expect(sesSendMock).not.toHaveBeenCalled();
    expect(insertedLogs).toHaveLength(0);
  });

  it('sends inline via SES when SQS_EMAIL_URL is unset', async () => {
    sesSendMock.mockResolvedValue({ MessageId: 'ses-msg-1' });
    const { db, insertedLogs, updatedLogs } = makeDb();
    const svc = await makeService(db);
    await svc.sendOrderFulfillmentEmail(fulfillment);
    expect(sesSendMock).toHaveBeenCalledTimes(1);
    expect(sqsSendMock).not.toHaveBeenCalled();
    expect(insertedLogs[0]).toMatchObject({ channel: 'email-direct', status: 'queued', recipient: 'ba2@brendamour.com' });
    expect(updatedLogs.at(-1)).toMatchObject({ status: 'sent', message_id: 'ses-msg-1' });
  });

  it('enqueues to SQS when SQS_EMAIL_URL is set', async () => {
    mockCfg.SQS_EMAIL_URL = 'https://sqs.example/queue';
    sqsSendMock.mockResolvedValue({ MessageId: 'sqs-msg-1' });
    const { db, insertedLogs, updatedLogs } = makeDb();
    const svc = await makeService(db);
    await svc.sendOrderFulfillmentEmail(fulfillment);
    expect(sqsSendMock).toHaveBeenCalledTimes(1);
    expect(sesSendMock).not.toHaveBeenCalled();
    expect(insertedLogs[0]).toMatchObject({ channel: 'email-sqs' });
    expect(updatedLogs.at(-1)).toMatchObject({ status: 'queued', message_id: 'sqs-msg-1' });
  });

  it('marks the log row failed and rethrows when SES rejects', async () => {
    sesSendMock.mockRejectedValue(new Error('SES throttled'));
    const { db, updatedLogs } = makeDb();
    const svc = await makeService(db);
    await expect(svc.sendOrderFulfillmentEmail(fulfillment)).rejects.toThrow('SES throttled');
    expect(updatedLogs.at(-1)).toMatchObject({ status: 'failed' });
    expect(updatedLogs.at(-1).error).toContain('SES throttled');
  });

  it('uses the logged-in user’s email as From when it is in the allowlist', async () => {
    mockTenant.email = 'maddo@naturalsheacare.com';
    sesSendMock.mockResolvedValue({ MessageId: 'ses-msg-2' });
    const { db } = makeDb();
    const svc = await makeService(db);
    await svc.sendOrderFulfillmentEmail(fulfillment);
    const sendArgs = sesSendMock.mock.calls[0][0];
    expect(sendArgs.Source).toBe('maddo@naturalsheacare.com');
  });

  it('falls back to SES_FROM when the logged-in user is not in the allowlist', async () => {
    mockTenant.email = 'random@example.com';
    sesSendMock.mockResolvedValue({ MessageId: 'ses-msg-3' });
    const { db } = makeDb();
    const svc = await makeService(db);
    await svc.sendOrderFulfillmentEmail(fulfillment);
    expect(sesSendMock.mock.calls[0][0].Source).toBe('lsarpong@naturalsheacare.com');
  });
});
