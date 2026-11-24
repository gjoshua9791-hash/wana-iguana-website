# D4 backend tests — results

Covers D4 (default-variant & not-found invariants) plus the D3 connection-timeout
follow-up. Reproducible scripts:
- [`verify_d4_endpoint.sh`](./verify_d4_endpoint.sh) — isolated-DB invariants.
- `server/verify_d2_mapper.mjs` — pure mapper unit tests (D2).
- `server/verify_d3_timeout.mjs` — bounded-time 500 on a stalled connection.

Local server: PostgreSQL 18.6 (Postgres.app). Supabase runs 17.11; no Supabase
data was mutated and production TLS was never weakened.

## Connection-timeout fix (D3 follow-up)
`db.ts` now sets `connectionTimeoutMillis: 5000` on the pool. Verified with a
controlled LOCAL fixture: a TCP black-hole server that accepts connections but
never replies, so `pg` stalls until the timeout. Results (`verify_d3_timeout.mjs`):
- `/health` returns 200 with the DB unreachable (DB-independence preserved).
- `GET /api/menu/items/taco-suave` returns **500 `{"error":"internal_error"}`** in
  ~5.0s (bounded, < 8s), with no host/SQL/credentials/stack in the body.
- Server-side error log is **sanitized** (`sanitizeDbError`): connection string
  and password are redacted; only error name/message/SQLSTATE remain. Logging
  server-side does not make a connection string safe, so it is redacted there too.
- Verified TLS (`rejectUnauthorized: true`) unchanged.

## D4 acceptance criteria

1. **Second active default rejected** — against the isolated DB, inserting a
   second `is_default=true, is_active=true` variant for `taco-suave` fails with
   **SQLSTATE 23505** on index `one_active_default_per_item`. ✅
2. **Missing active default → 404** — composed, proven in three layers:
   - isolated DB: with the default variant set inactive, the real
     `DEFAULT_VARIANT_SQL` returns **0 rows**;
   - unit (`verify_d2_mapper.mjs`): `mapRowsToItem([]) === null`;
   - route: a null mapping returns **404 `item_not_found`** (also observed live
     against Supabase for an unknown id).
   Together these establish the endpoint 404 for the no-active-default case. ✅
3. **Happy path** — against the isolated DB, the default-variant query yields
   `basePriceCents 525`, group label **"Choose one"**, `minSelect 1 / maxSelect 1`,
   and both options (`steak`, `chicken`) with `priceDeltaCents = 0` in sort order.
   Also observed end-to-end over verified TLS against Supabase during D3
   (`GET /api/menu/items/taco-suave` → the full design §3 JSON). ✅

## Reuse of earlier evidence
- The live Supabase **200** (happy path) and **404** (unknown id) HTTP responses
  recorded in the D3 step satisfy the end-to-end endpoint behavior for criteria 2
  and 3; they are not repeated here.
- The partial-unique-index behavior was also shown in `verify_b1_b2.sh`; criterion
  1 is re-confirmed here in the D4 context against a freshly provisioned isolated
  DB.

## Limitations (accurate)
- The isolated-DB checks exercise the **real default-variant SQL** (identical to
  `queries.ts`) rather than driving the live Express pool at the local DB, because
  the app enforces verified TLS and local Postgres.app offers none; pointing the
  app there would require weakening TLS, which is disallowed. The end-to-end HTTP
  path over TLS is covered by the live Supabase evidence instead.
- No automated test-runner/CI harness (e.g. a `*.test.ts` under a framework) is
  wired up; the checks are reproducible shell/node scripts. If a formal runner is
  desired later, these scripts define the cases to port.
