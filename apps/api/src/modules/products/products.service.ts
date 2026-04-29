import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../../common/tenancy/tenant.context';

export interface ProductListFilters {
  q?: string;
  include_inactive?: boolean;
  category?: string;
}

export interface CreateProductInput {
  sku: string;
  upc?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  uom: string;
  is_tracked_by_batch?: boolean;
  tax_rate_pct?: number;
  cost_price?: number;
  base_price?: number;
  currency?: string;
  weight_grams?: number | null;
}

export interface UpdateProductInput extends Partial<CreateProductInput> {
  is_active?: boolean;
}

@Injectable()
export class ProductsService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async list(filters: ProductListFilters = {}) {
    const t = currentTenant();
    let query = this.db
      .selectFrom('products')
      .select([
        'id', 'sku', 'upc', 'name', 'description', 'category', 'uom',
        'is_tracked_by_batch', 'tax_rate_pct', 'cost_price', 'base_price',
        'currency', 'weight_grams', 'is_active', 'created_at',
      ])
      .where('tenant_id', '=', t.tenantId);

    if (!filters.include_inactive) {
      query = query.where('is_active', '=', true);
    }
    if (filters.category) {
      query = query.where('category', '=', filters.category);
    }
    if (filters.q) {
      const like = `%${filters.q}%`;
      query = query.where((eb) =>
        eb.or([
          eb('sku', 'ilike', like),
          eb('name', 'ilike', like),
          eb('upc', 'ilike', like),
        ]),
      );
    }
    return query.orderBy('name').execute();
  }

  async findById(id: string) {
    const t = currentTenant();
    const row = await this.db
      .selectFrom('products')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Product not found');
    return row;
  }

  async create(input: CreateProductInput) {
    const t = currentTenant();
    return this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('products')
        .select('id')
        .where('tenant_id', '=', t.tenantId)
        .where('sku', '=', input.sku)
        .executeTakeFirst();
      if (existing) throw new ConflictException(`A product with SKU ${input.sku} already exists`);

      const row = await trx
        .insertInto('products')
        .values({
          tenant_id: t.tenantId,
          sku: input.sku,
          upc: input.upc ?? null,
          name: input.name,
          description: input.description ?? null,
          category: input.category ?? null,
          uom: input.uom,
          is_tracked_by_batch: input.is_tracked_by_batch ?? true,
          tax_rate_pct: (input.tax_rate_pct ?? 0).toFixed(2),
          cost_price: (input.cost_price ?? 0).toFixed(4),
          base_price: (input.base_price ?? 0).toFixed(4),
          currency: input.currency ?? 'USD',
          weight_grams: input.weight_grams != null ? input.weight_grams.toFixed(4) : null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return row;
    });
  }

  async update(id: string, patch: UpdateProductInput) {
    const t = currentTenant();
    const updates: Record<string, unknown> = {};
    if (patch.sku !== undefined) updates.sku = patch.sku;
    if (patch.upc !== undefined) updates.upc = patch.upc;
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.description !== undefined) updates.description = patch.description;
    if (patch.category !== undefined) updates.category = patch.category;
    if (patch.uom !== undefined) updates.uom = patch.uom;
    if (patch.is_tracked_by_batch !== undefined) updates.is_tracked_by_batch = patch.is_tracked_by_batch;
    if (patch.tax_rate_pct !== undefined) updates.tax_rate_pct = patch.tax_rate_pct.toFixed(2);
    if (patch.cost_price !== undefined) updates.cost_price = patch.cost_price.toFixed(4);
    if (patch.base_price !== undefined) updates.base_price = patch.base_price.toFixed(4);
    if (patch.currency !== undefined) updates.currency = patch.currency;
    if (patch.weight_grams !== undefined) updates.weight_grams = patch.weight_grams != null ? patch.weight_grams.toFixed(4) : null;
    if (patch.is_active !== undefined) updates.is_active = patch.is_active;

    if (!Object.keys(updates).length) {
      throw new BadRequestException('No fields to update');
    }

    const row = await this.db
      .updateTable('products')
      .set(updates)
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .returningAll()
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Product not found');
    return row;
  }

  /** Soft-delete: flip is_active=false. Avoids breaking historical orders. */
  async deactivate(id: string) {
    return this.update(id, { is_active: false });
  }

  async listCategories() {
    const t = currentTenant();
    const rows = await this.db
      .selectFrom('products')
      .select(sql<string>`DISTINCT category`.as('category'))
      .where('tenant_id', '=', t.tenantId)
      .where('category', 'is not', null)
      .execute();
    return rows.map((r) => r.category).filter(Boolean).sort();
  }
}
