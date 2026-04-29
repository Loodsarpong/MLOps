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

type Segment = 'retail' | 'wholesale' | 'distributor' | 'online';

export interface ListFilters {
  q?: string;
  segment?: Segment;
  include_inactive?: boolean;
}

export interface CreateCustomerInput {
  code: string;
  name: string;
  segment?: Segment;
  email?: string | null;
  phone?: string | null;
  billing_address?: Record<string, unknown> | null;
  shipping_address?: Record<string, unknown> | null;
  tax_id?: string | null;
  credit_limit?: number;
  currency?: string;
}

export interface UpdateCustomerInput extends Partial<CreateCustomerInput> {
  is_active?: boolean;
}

@Injectable()
export class CustomersService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async list(filters: ListFilters = {}) {
    const t = currentTenant();
    let query = this.db
      .selectFrom('customers')
      .select([
        'id', 'code', 'name', 'segment', 'email', 'phone',
        'billing_address', 'shipping_address', 'tax_id',
        'credit_limit', 'currency', 'is_active', 'created_at',
      ])
      .where('tenant_id', '=', t.tenantId);

    if (!filters.include_inactive) {
      query = query.where('is_active', '=', true);
    }
    if (filters.segment) {
      query = query.where('segment', '=', filters.segment);
    }
    if (filters.q) {
      const like = `%${filters.q}%`;
      query = query.where((eb) =>
        eb.or([
          eb('code', 'ilike', like),
          eb('name', 'ilike', like),
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
      .selectFrom('customers')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Customer not found');
    return row;
  }

  async create(input: CreateCustomerInput) {
    const t = currentTenant();
    return this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('customers')
        .select('id')
        .where('tenant_id', '=', t.tenantId)
        .where('code', '=', input.code)
        .executeTakeFirst();
      if (existing) throw new ConflictException(`A customer with code ${input.code} already exists`);

      const row = await trx
        .insertInto('customers')
        .values({
          tenant_id: t.tenantId,
          code: input.code,
          name: input.name,
          segment: input.segment ?? 'retail',
          email: input.email ?? null,
          phone: input.phone ?? null,
          billing_address: (input.billing_address ?? null) as never,
          shipping_address: (input.shipping_address ?? null) as never,
          tax_id: input.tax_id ?? null,
          credit_limit: (input.credit_limit ?? 0).toFixed(2),
          currency: input.currency ?? 'USD',
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return row;
    });
  }

  async update(id: string, patch: UpdateCustomerInput) {
    const t = currentTenant();
    const updates: Record<string, unknown> = {};
    if (patch.code !== undefined) updates.code = patch.code;
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.segment !== undefined) updates.segment = patch.segment;
    if (patch.email !== undefined) updates.email = patch.email;
    if (patch.phone !== undefined) updates.phone = patch.phone;
    if (patch.billing_address !== undefined) updates.billing_address = patch.billing_address as never;
    if (patch.shipping_address !== undefined) updates.shipping_address = patch.shipping_address as never;
    if (patch.tax_id !== undefined) updates.tax_id = patch.tax_id;
    if (patch.credit_limit !== undefined) updates.credit_limit = patch.credit_limit.toFixed(2);
    if (patch.currency !== undefined) updates.currency = patch.currency;
    if (patch.is_active !== undefined) updates.is_active = patch.is_active;

    if (!Object.keys(updates).length) {
      throw new BadRequestException('No fields to update');
    }

    const row = await this.db
      .updateTable('customers')
      .set(updates)
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .returningAll()
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Customer not found');
    return row;
  }

  /** Soft-delete: keeps historical orders/invoices intact. */
  async deactivate(id: string) {
    return this.update(id, { is_active: false });
  }
}
