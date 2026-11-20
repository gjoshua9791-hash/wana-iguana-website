# B3 seed verification — results

Runnable script: [`verify_b3_seed.sh`](./verify_b3_seed.sh)

- **Server:** PostgreSQL 18.6 (Postgres.app), local loopback `127.0.0.1:5432`.
- **How to run:** `server/migrations/verify_b3_seed.sh` (exit 0 = all passed).
- **Isolation:** the script creates a uniquely named throwaway database
  (`wana_b3_seed_verify_<pid>_<ts>`), applies the real migrations into it, runs
  the assertions, and drops that throwaway DB on exit. It does **not** touch the
  retained `wana_iguana_schema_test` database (explicitly guarded).

## ⚠️ This is an explicitly PARTIAL local test

The script applies `0001 -> 0002 -> 0004` only. **`0003_access_policies.sql`
does not exist yet**, so this is NOT a verification of the complete deployment
sequence. Shared-database application must still follow the full order
**`0001 -> 0002 -> 0003 -> 0004`** once `0003` is authored (Task C2).

## Checks performed by this script (all PASS)

Applied the real files with ledger entries committed atomically per file
(`psql -X --single-transaction -v ON_ERROR_STOP=1 -f <file> -c "INSERT ... schema_migrations"`),
then asserted exact values:

| Check | Asserted value |
|-------|----------------|
| `menu_item` present, active, name | `taco-suave` -> name "Taco Suave", `is_active=true` |
| `menu_item` description | "Soft corn tortilla taco with lettuce, cheese, and pico de gallo." |
| `item_variant` default/active/price | `taco-suave-base`, name "Base", `base_price_cents=525`, `is_default=true`, `is_active=true` |
| `modifier_group` | `protein` -> name "Protein", label "Choose one" |
| `modifier_option` x2, ordered, zero delta | `steak`(Steak,0,sort 1), `chicken`(Chicken,0,sort 2) |
| `variant_modifier_group` link | `taco-suave-base` <-> `protein`, `min_select=1`, `max_select=1`, `sort_order=1` |
| Joined item -> active default variant -> group -> options | 2 joined rows; base price via default variant = 525 |
| Idempotency | re-applying the seed body succeeds (`ON CONFLICT DO NOTHING`); option count stays 2; still exactly 1 active default |

## Notes
- **`ON CONFLICT DO NOTHING` semantics:** the seed avoids duplicate inserts only.
  It does **not** reconcile an already-present row with changed seed values — an
  existing row with the same primary key is left unchanged (no UPDATE). Changing
  already-seeded data requires a separate explicit migration.
- **Not Supabase deployment readiness:** this is a partial local test against a
  disposable Postgres. It does not establish readiness for the shared Supabase
  catalog, which additionally requires `0003_access_policies.sql` and the full
  `0001 -> 0002 -> 0003 -> 0004` ordering under access controls.
- Prices/deltas are verified data: base 525 cents ($5.25); Steak/Chicken deltas
  are 0 (no surcharge inferred from the description).
- The exactly-one protein rule is seeded as data on the link
  (`min_select=1, max_select=1`), independent of the frontend's initially-empty
  UI selection.

## Limitations / still outstanding
- `0003_access_policies.sql` (Task C2) and the full shared-DB deployment order
  are out of scope here; this run does not prove access-control behavior.
- No Supabase/shared/production database was touched; local Postgres is 18.6 and
  Supabase's managed version may differ.
- API/frontend behavior is Phase D/E and out of scope for B3.
