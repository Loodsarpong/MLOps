# CSV Import Formats

All CSV imports:
- UTF-8, comma-separated, first row is the header (order shown below).
- Max 50 MB per file, 100 000 rows. Larger files should be split.
- Upload via `POST /v1/{entity}/import` (multipart) or the UI
  (`/products > Import`, `/customers > Import`, etc.).
- The import endpoint returns `job_id`; progress is polled via
  `GET /v1/imports/{job_id}`. Row-level errors are returned as a downloadable
  CSV so the user can fix and re-upload only the failed rows.

Template files live in [`templates/csv/`](../templates/csv/).

## 1. Products (`products.csv`)

| Column             | Required | Example                     | Notes                                  |
| ------------------ | -------- | --------------------------- | -------------------------------------- |
| `sku`              | ✓        | SKU-SHEA-BB-200             | Unique per tenant                      |
| `upc`              |          | 0840000012345               | Must be 8/12/13-digit GS1 barcode      |
| `name`             | ✓        | Raw Shea Body Butter 200g   |                                        |
| `description`      |          | Unrefined shea butter...    |                                        |
| `category`         |          | body-care                   | Free text; used for reports            |
| `uom`              |          | unit                        | `unit`, `kg`, `l` (default `unit`)     |
| `is_raw_material`  |          | false                       | `true`/`false`                         |
| `is_tracked_by_batch`|        | true                        | Default `true`                         |
| `tax_rate_pct`     |          | 5.0                         | Percentage                             |
| `cost_price`       |          | 18.50                       | Currency units                         |
| `base_price`       | ✓        | 35.00                       |                                        |
| `currency`         |          | GHS                         | ISO 4217 (default tenant currency)     |
| `weight_grams`     |          | 200                         |                                        |

## 2. Stock on hand (`stock.csv`)

Used for initial load or periodic reconciliation.

| Column          | Required | Example              | Notes                                        |
| --------------- | -------- | -------------------- | -------------------------------------------- |
| `warehouse_code`| ✓        | WH-ACCRA-DC          | Must exist                                   |
| `sku`           | ✓        | SKU-SHEA-BB-200      | Must exist                                   |
| `batch_no`      |          | LOT-2026-04-A        | Required if product `is_tracked_by_batch`    |
| `manufactured_on`|         | 2026-03-15           | ISO date                                     |
| `expires_on`    |          | 2028-03-14           | ISO date                                     |
| `quantity`      | ✓        | 120                  |                                              |
| `unit_cost`     |          | 18.50                | For valuation                                |
| `reorder_point` |          | 30                   |                                              |

Import mode: `upsert` (`warehouse + sku + batch_no`) — incoming quantity
replaces current. For deltas use `POST /inventory/adjustments`.

## 3. Suppliers (`suppliers.csv`)

| Column              | Required | Example                 |
| ------------------- | -------- | ----------------------- |
| `code`              | ✓        | SUP-0012                |
| `name`              | ✓        | Tamale Shea Cooperative |
| `contact_name`      |          | Ama Mensah              |
| `email`             |          | ama@tamaleshea.coop     |
| `phone`             |          | +233244000111           |
| `address_line1`     |          | Plot 12, Industrial Rd. |
| `city`              |          | Tamale                  |
| `region`            |          | Northern                |
| `country`           |          | GH                      |
| `payment_terms_days`|          | 30                      |
| `currency`          |          | GHS                     |

## 4. Customers (`customers.csv`)

| Column           | Required | Example              |
| ---------------- | -------- | -------------------- |
| `code`           | ✓        | CUST-000123          |
| `name`           | ✓        | Beauty Haven Ltd     |
| `segment`        |          | wholesale            |
| `email`          |          | orders@beautyhaven.com|
| `phone`          |          | +233501234567        |
| `billing_line1`  |          | 15 Ring Rd           |
| `billing_city`   |          | Accra                |
| `billing_country`|          | GH                   |
| `tax_id`         |          | C0005678901          |
| `credit_limit`   |          | 5000.00              |
| `currency`       |          | GHS                  |

## 5. Error report format

Downloadable `{job_id}_errors.csv`:

| `row` | `field`    | `error`                             |
| ----- | ---------- | ----------------------------------- |
| 42    | upc        | must be a valid GS1 barcode         |
| 87    | sku        | duplicate (row 12 had same sku)     |
| 210   | base_price | must be >= 0                        |

## 6. Export formats

All list endpoints accept `?format=csv|xlsx` on their `GET` and stream the
export. Columns match the import headers so **round-tripping** is safe.
