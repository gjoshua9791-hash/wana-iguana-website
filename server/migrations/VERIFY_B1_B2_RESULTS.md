# B1/B2 migration verification — results

Runnable script: [`verify_b1_b2.sh`](./verify_b1_b2.sh)

- **Server:** PostgreSQL 18.6 (Postgres.app), local loopback `127.0.0.1:5432`.
- **How to run:** `server/migrations/verify_b1_b2.sh` (exit 0 = all passed).
- **Isolation:** the script creates a uniquely named throwaway database
  (`wana_b1b2_verify_<pid>_<ts>`), applies the real `0001`/`0002` files into it,
  runs the checks, and drops the throwaway DB + its probe role on exit. It does
  **not** mutate the kept `wana_iguana_schema_test` database. Target is validated
  to be an explicitly named local throwaway DB on loopback before any mutation;
  unexpected errors fail the run (exit 1).
- **Assertions:** every expected rejection is asserted against the intended
  SQLSTATE (not "any error").

## Checks performed by this script (all PASS)

### 1. Invalid-data rejection (asserted SQLSTATE)
| Case                                   | Expected SQLSTATE                 |
|----------------------------------------|-----------------------------------|
| negative `base_price_cents`            | 23514 check_violation             |
| negative `price_delta_cents`           | 23514 check_violation             |
| `min_select` < 0                       | 23514 check_violation             |
| `max_select` < 1                       | 23514 check_violation             |
| `max_select` < `min_select`            | 23514 check_violation             |
| duplicate `variant_modifier_group` PK  | 23505 unique_violation            |
| `item_variant` -> missing `menu_item`  | 23503 foreign_key_violation       |
| `modifier_option` -> missing group     | 23503 foreign_key_violation       |
| `variant_modifier_group` -> missing variant | 23503 foreign_key_violation  |
| `variant_modifier_group` -> missing group   | 23503 foreign_key_violation  |

### 2. Migration-ledger protection
A temporary `NOLOGIN NOSUPERUSER NOBYPASSRLS` role, under the documented
permissions (`REVOKE ALL ON public.schema_migrations FROM PUBLIC`, no grant to
the role), has `has_table_privilege(... INSERT/SELECT) = false`. Its INSERT,
UPDATE, and DELETE against the ledger are each denied with **SQLSTATE 42501
insufficient_privilege** — i.e. a PRIVILEGE denial, distinct from an RLS policy
denial. The ledger contents are unchanged afterward.

> Note: this is privilege-level denial because the documented setup grants the
> non-owner role nothing on the ledger. (Separately, the earlier interactive run
> confirmed RLS *policy* default-deny on the five catalog tables, where the role
> was deliberately granted table privileges so denial could only come from RLS.)

### 3. Atomic failure (single transaction)
Using the real apply pattern (`psql -X --single-transaction -v ON_ERROR_STOP=1`),
a transaction creates `public.atomic_probe`, then hits a forced
**23502 not_null_violation** before the ledger INSERT completes. Result: the
whole transaction aborts, `atomic_probe` is **absent** (schema change rolled
back), and the ledger is **unchanged** (no partial record).

## Previously demonstrated (interactively, not repeated here)
- Five tables, FK delete actions (RESTRICT/CASCADE), CHECK existence, composite
  PK, partial unique index — via catalog introspection.
- Active-default rule: second active default rejected; zero/inactive/non-default
  permitted; per-item independence.
- RESTRICT/CASCADE delete behavior with fixtures.
- RLS enabled on all five catalog tables; default-deny SELECT/INSERT for a
  privilege-granted non-owner role (RLS-level denial).

## Limitations / still outstanding
- `0003_access_policies.sql` (Task C2) and the seed (`0004`) are not authored or
  tested yet; final grants/revokes and server-side read policies are C2's job.
- The Postgres version used is 18.6 locally; Supabase's managed Postgres version
  may differ. No Supabase/shared/production database was touched.
- API-level behavior (endpoint status codes, mapping) belongs to Phase D and is
  out of scope for B1/B2.
