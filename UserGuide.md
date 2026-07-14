# User Guide — S.T STAR Accounting & Operations System

A hands-on guide for logging in, testing with different roles, and using the main
features during development. All examples use the local API at
`http://localhost:3333/api`. The easiest way to try everything is the built-in
**Swagger UI at <http://localhost:3333/docs>**.

---

## 1. Getting started (development)

```bash
pnpm install
npx prisma migrate dev     # apply migrations
npx prisma db seed         # seed accounts, tax rates, company, admin user
pnpm start:dev             # API on http://localhost:3333/api
```

Seeding creates the chart of accounts, VAT rates (10% / 20%), the S.T STAR company
profile, and one default admin user.

## 2. Login (test account)

Default development admin (from `prisma/seed.ts`, override with `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD` — **change these in any real deployment**):

| Field | Value |
|---|---|
| Email | `admin@stlogistics.com` |
| Password | `ChangeMe123!` |
| Role | ADMIN |

```bash
curl -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stlogistics.com","password":"ChangeMe123!"}'
```

The response contains a JWT `token`. Send it on every other request:

```bash
curl http://localhost:3333/api/invoices \
  -H "Authorization: Bearer <token>"
```

In Swagger UI, click **Authorize** (top right) and paste the token once — all
requests are then authenticated. Tokens can be renewed via `POST /auth/refresh-token`.

### Creating test users for each role

Use `POST /auth/register` (or `POST /users` as admin) to create one user per role:

```json
{
  "email": "accountant@test.com",
  "password": "Test1234!",
  "firstName": "Test",
  "lastName": "Accountant",
  "role": "ACCOUNTANT"
}
```

Suggested dev users: `accountant@test.com`, `manager@test.com`, `staff@test.com`,
`viewer@test.com` (roles: `ACCOUNTANT`, `MANAGER`, `STAFF`, `VIEWER`). Log in as each
to verify permissions — a forbidden action returns **403 Forbidden**.

## 3. Roles & what they can do

| Action | ADMIN | ACCOUNTANT | MANAGER | STAFF | VIEWER |
|---|:-:|:-:|:-:|:-:|:-:|
| Manage users (`/users`) | ✅ | — | — | — | — |
| Company settings, tax rates | ✅ | — | — | — | — |
| Create/finalize invoices, record payments | ✅ | ✅ | — | — | — |
| Record income / expenses | ✅ | ✅ | — | ✅ | — |
| Approve income (post to ledger) | ✅ | ✅ | — | — | — |
| Approve / reject expenses | ✅ | — | ✅ | — | — |
| Manual journal entries, chart of accounts, deposits | ✅ | ✅ | — | — | — |
| Customers, suppliers, clearance jobs | ✅ | ✅ | ✅ | — | — |
| Tax filings | ✅ | ✅ | — | — | — |
| View audit logs | ✅ | ✅ | ✅ | — | — |
| View lists & reports | ✅ | ✅ | ✅ | ✅ | ✅ |

## 4. How to use — common flows

All create/list endpoints support pagination (`?page=1&limit=20`) and filters — see
Swagger for each DTO.

### 4.1 Set up master data
1. **Company settings** — `PATCH /settings/company` (ADMIN): company names (EN/KH/CN),
   VAT ID, default VAT rate, default payment terms, logo.
2. **Customers** — `POST /customers` (ADMIN/ACCOUNTANT/MANAGER): name, address, tax ID,
   contacts, bank details. A customer code like `027-01-26` is generated automatically.
3. **Suppliers** — `POST /suppliers`: same pattern, used for expenses.

### 4.2 Invoice a customer and record payment
1. `POST /invoices` (ADMIN/ACCOUNTANT) with `customerId`, `invoiceDate`, and
   `lineItems` (`description`, `quantity`, `unitPrice`). VAT (default 10%) and totals
   are calculated automatically; the invoice number (e.g. `ST25-000028`) is generated.
   Use `invoiceType: "DEBIT_NOTE"` for a VAT-exempt debit note.
2. `POST /invoices/:id/finalize` — issues the invoice and posts it to the ledger.
3. `POST /invoices/:id/payments` with `amount`, `method` (`CASH`, `BANK_TRANSFER`,
   `CHECK`, `CREDIT_CARD`, `MOBILE_MONEY`, `CRYPTOCURRENCY`), `paymentDate`.
   The invoice moves to **PARTIALLY_PAID** or **PAID** and `balanceDue` updates.
4. Check overdue invoices any time with `GET /reports/aging`.
5. **Export**: `GET /invoices/:id/pdf` downloads the printable tax invoice / debit note
   (company header, customer, line items, VAT, totals). `GET /invoices/export?format=PDF`
   or `?format=EXCEL` downloads the invoice list — it accepts the same filters as
   `GET /invoices` (`status`, `customerId`, `invoiceType`, `dateFrom`, `dateTo`, `search`).

### 4.3 Record income (service revenue)
1. `POST /income` (STAFF can do this) with `customerId`, `serviceType`
   (e.g. `CUSTOMS_CLEARANCE`, `STORAGE_FEE`, `TRUCKING_SERVICE`), `amount`, `accountId`
   (a revenue account, e.g. 4001). Record number `INC-2026-0001` is auto-generated;
   status starts as **PENDING**.
2. `POST /income/:id/approve` (ADMIN/ACCOUNTANT) — posts a balanced journal entry
   (debit Bank / credit Revenue) and locks the record (**POSTED**).

### 4.4 Record an expense (with approval)
1. `POST /expenses` (STAFF) with `expenseType` (e.g. `RENTAL`, `UTILITIES`),
   `amount`, `accountId`, optional `supplierId` and `taxRate`. Number `EXP-2026-0001`
   is generated; approval status starts **PENDING**.
2. A **MANAGER or ADMIN** then either:
   - `POST /expenses/:id/approve` — posts to the ledger and locks it, or
   - `POST /expenses/:id/reject` with a `rejectionReason`.

### 4.5 Customs clearance jobs
- `POST /clearance-jobs` (ADMIN/ACCOUNTANT/MANAGER): enter the `jobNumber` manually,
  plus date, customer, BL/booking number, commodity, port (`PPAP`/`SHV`/`TL`),
  transaction (`IMP`/`EXP`). Optionally link the shipment's revenue via `incomeRecordId`.
- Browse and update with `GET /clearance-jobs` and `PATCH /clearance-jobs/:id`.

### 4.6 Deposits
- `POST /deposits` (ADMIN/ACCOUNTANT): amount, purpose, GL account, and either a
  `customerId` or `supplierId`. Status lifecycle: ACTIVE → RELEASED / RETURNED / FORFEITED.

### 4.7 Tax filings
1. `POST /tax-filings` (ADMIN/ACCOUNTANT): `filingType` (`VAT`, `INCOME_TAX`,
   `WITHHOLDING_TAX`, `NSSF`, `QUARTERLY`, `ANNUAL`), `filingPeriod` (e.g. `"2026-07"`),
   amounts. Starts as **DRAFT**.
2. `POST /tax-filings/:id/submit` — marks it **FILED** with the filing date.

### 4.8 Reports
- `GET /reports/profit-loss?month=7&year=2026` — P&L by category.
- `GET /reports/balance-sheet?date=2026-07-31` — assets / liabilities / equity.
- `GET /reports/income-summary`, `/reports/expense-summary`, `/reports/tax-summary`.
- `GET /reports/aging` — receivables overdue analysis.
- `GET /reports/<report>/export?format=pdf` (or `format=excel`) — download the file.

### 4.9 Attach documents
1. `POST /uploads/presign` with the file name and MIME type → returns a presigned S3 URL.
2. Upload the file directly to that URL from the client.
3. `POST /uploads/:id/confirm` — link it to an entity (e.g. an invoice or expense).
4. `GET /uploads/:id/url` — get a download link later.

### 4.10 Audit trail
- `GET /audit-logs` (ADMIN/ACCOUNTANT/MANAGER) — filter by `entityType` or `action`
  to see who created, changed, approved, or deleted anything.

## 5. Frontend integration — downloading PDF / Excel files

Export endpoints return binary files, and every request needs the JWT in the
`Authorization` header — so a plain `<a href>` won't work. Fetch the file as a blob
and trigger the download:

```ts
// src/lib/download.ts (clearance-admin)
export async function downloadFile(path: string, fallbackName: string) {
  const token = JSON.parse(localStorage.getItem('sak.auth') ?? '{}').token;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);

  // Prefer the filename the server sends (e.g. ST26-000001.pdf)
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filename =
    /filename="(.+?)"/.exec(disposition)?.[1] ?? fallbackName;

  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

Usage in a component (this is a one-shot action — use a plain handler or
`useMutation`, not `useQuery`):

```ts
// Single invoice document
await downloadFile(`/invoices/${invoice.id}/pdf`, `${invoice.invoiceNumber}.pdf`);

// Invoice list with current filters
const params = new URLSearchParams({ format: 'EXCEL', status: 'PAID' });
await downloadFile(`/invoices/export?${params}`, 'invoices.xlsx');

// Financial reports work the same way
await downloadFile('/reports/profit-loss/export?format=pdf&month=7&year=2026', 'pnl.pdf');
```

Notes:
- `format` values for invoices are `PDF` (default) and `EXCEL`.
- The list export applies the same filters as the invoice list screen — pass the
  active filter state straight into the query string, and ignore `page`/`limit`
  (the export returns up to 1,000 most recent matches).
- To preview the invoice PDF in a new tab instead of downloading, open the blob URL
  with `window.open(url)` instead of clicking an anchor.

## 6. Quick reference — statuses

| Entity | Statuses |
|---|---|
| Invoice | DRAFT → ISSUED → SENT → PARTIALLY_PAID → PAID (OVERDUE / CANCELLED / REFUNDED) |
| Income / Expense record | PENDING → POSTED (locked) |
| Expense approval | PENDING → APPROVED / REJECTED / NEEDS_REVISION |
| Payment | PENDING → PROCESSING → COMPLETED (FAILED / CANCELLED) |
| Deposit | ACTIVE → RELEASED / RETURNED / FORFEITED |
| Tax filing | DRAFT → FILED → ACCEPTED (REJECTED / AMENDED) |
| Journal entry | DRAFT → POSTED (CANCELLED / ADJUSTED) |
