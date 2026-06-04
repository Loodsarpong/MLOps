import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../../common/tenancy/tenant.context';

export interface ListFilters {
  q?: string;
  include_inactive?: boolean;
}

export interface CreateSupplierInput {
  code: string;
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: Record<string, unknown> | null;
  payment_terms_days?: number;
  currency?: string;
  rating?: number | null;
}

export interface UpdateSupplierInput extends Partial<CreateSupplierInput> {
  is_active?: boolean;
}

@Injectable()
export class SuppliersService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async list(filters: ListFilters = {}) {
    const t = currentTenant();
    let query = this.db
      .selectFrom('suppliers')
      .select([
        'id', 'code', 'name', 'contact_name', 'email', 'phone',
        'address', 'payment_terms_days', 'currency', 'rating',
        'is_active', 'created_at',
      ])
      .where('tenant_id', '=', t.tenantId);

    if (!filters.include_inactive) {
      query = query.where('is_active', '=', true);
    }
    if (filters.q) {
      const like = `%${filters.q}%`;
      query = query.where((eb) =>
        eb.or([
          eb('code', 'ilike', like),
          eb('name', 'ilike', like),
          eb('contact_name', 'ilike', like),
          eb('email', 'ilike', like),
          eb('phone', 'ilike', like),
        ]),
      );
    }
    return query.orderBy('name').execute();
  }

  async findById(id: string) {
    const t = currentTenant();
    const row = await this.db
      .selectFrom('suppliers')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Supplier not found');
    return row;
  }

  async create(input: CreateSupplierInput) {
    const t = currentTenant();
    return this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('suppliers')
        .select('id')
        .where('tenant_id', '=', t.tenantId)
        .where('code', '=', input.code)
        .executeTakeFirst();
      if (existing) throw new ConflictException(`A supplier with code ${input.code} already exists`);

      const row = await trx
        .insertInto('suppliers')
        .values({
          tenant_id: t.tenantId,
          code: input.code,
          name: input.name,
          contact_name: input.contact_name ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: (input.address ?? null) as never,
          payment_terms_days: input.payment_terms_days ?? 30,
          currency: input.currency ?? 'USD',
          rating: input.rating != null ? input.rating.toFixed(2) : null,
          is_active: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return row;
    });
  }

  async update(id: string, patch: UpdateSupplierInput) {
    const t = currentTenant();
    const updates: Record<string, unknown> = {};
    if (patch.code !== undefined) updates.code = patch.code;
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.contact_name !== undefined) updates.contact_name = patch.contact_name;
    if (patch.email !== undefined) updates.email = patch.email;
    if (patch.phone !== undefined) updates.phone = patch.phone;
    if (patch.address !== undefined) updates.address = patch.address as never;
    if (patch.payment_terms_days !== undefined) updates.payment_terms_days = patch.payment_terms_days;
    if (patch.currency !== undefined) updates.currency = patch.currency;
    if (patch.rating !== undefined) updates.rating = patch.rating != null ? patch.rating.toFixed(2) : null;
    if (patch.is_active !== undefined) updates.is_active = patch.is_active;

    if (!Object.keys(updates).length) {
      throw new BadRequestException('No fields to update');
    }

    const row = await this.db
      .updateTable('suppliers')
      .set(updates)
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .returningAll()
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Supplier not found');
    return row;
  }

  /** Soft-delete: keeps historical purchase orders / bills intact. */
  async deactivate(id: string) {
    return this.update(id, { is_active: false });
  }

  /**
   * Supplier scorecard: order volume, spend, and outstanding payable derived
   * from purchase_orders and ap_transactions. Bills are positive amounts,
   * payments negative, so the running sum is the open balance.
   */
  async performance(id: string) {
    const t = currentTenant();
    await this.findById(id); // 404 if not ours

    const orders = await this.db
      .selectFrom('purchase_orders')
      .select((eb) => [
        eb.fn.countAll<string>().as('total_orders'),
        eb.fn.sum<string>('total').as('total_ordered_value'),
        eb.fn.max('created_at').as('last_order_at'),
      ])
      .where('tenant_id', '=', t.tenantId)
      .where('supplier_id', '=', id)
      .where('status', '!=', 'cancelled')
      .executeTakeFirst();

    const received = await this.db
      .selectFrom('purchase_orders')
      .select((eb) => eb.fn.countAll<string>().as('received_orders'))
      .where('tenant_id', '=', t.tenantId)
      .where('supplier_id', '=', id)
      .where('status', 'in', ['received', 'closed'])
      .executeTakeFirst();

    const payable = await this.db
      .selectFrom('ap_transactions')
      .select((eb) => eb.fn.sum<string>('amount').as('outstanding_payable'))
      .where('tenant_id', '=', t.tenantId)
      .where('supplier_id', '=', id)
      .executeTakeFirst();

    return {
      supplier_id: id,
      total_orders: Number(orders?.total_orders ?? 0),
      received_orders: Number(received?.received_orders ?? 0),
      total_ordered_value: Number(orders?.total_ordered_value ?? 0),
      outstanding_payable: Number(payable?.outstanding_payable ?? 0),
      last_order_at: orders?.last_order_at ?? null,
    };
  }
}
