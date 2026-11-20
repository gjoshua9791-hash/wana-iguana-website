-- Migration: 0003_access_policies
-- Feature 1 — Display Taco Suave from a Database-Backed API
-- Access control for the catalog: give the Express runtime a LEAST-PRIVILEGE,
-- READ-ONLY path to the catalog via RLS policies, and ensure NO anonymous (or
-- otherwise public) INSERT/UPDATE/DELETE is possible on the catalog tables.
--
-- Deployment order: 0001 -> 0002 -> 0003 -> 0004. This file runs AFTER the
-- structure/index (0001/0002) and BEFORE the seed (0004), so the shared catalog
-- is locked down before any rows exist (design §7, migrations/README.md).
--
-- TRANSACTIONS: like the other migrations, this file has NO `BEGIN`/`COMMIT`.
-- It is a transaction *body* the operator wraps together with its
-- schema_migrations ledger INSERT (see README). Do not add a COMMIT here.
--
-- ROLE SEPARATION (important):
--   * The MIGRATION OPERATOR (the owner/superuser that runs migrations; on
--     Supabase this is `postgres`) owns the tables and the ledger. It is NOT the
--     role the Express server uses at runtime.
--   * The EXPRESS RUNTIME ROLE is a dedicated least-privilege role, `menu_backend`,
--     created NOLOGIN here. It is a *privilege-bearing* role carrying exactly the
--     catalog READ access the backend needs — nothing else. A human separately
--     creates a LOGIN user and does `GRANT menu_backend TO <login_user>` OUT OF
--     BAND, so no password is ever placed in SQL or Git (see remaining steps in
--     VERIFY_C2_LOCAL_RESULTS.md / README).
--   * anon / authenticated / PUBLIC (incl. Supabase PostgREST roles) get NO
--     catalog access: the frontend talks only to our Express endpoint, never
--     directly to the database.
--
-- COMPATIBILITY: uses only portable SQL (DO-guarded CREATE ROLE, GRANT, CREATE
-- POLICY, has no PG18-only syntax). Verified locally on PostgreSQL 18; Supabase
-- runs PostgreSQL 17. CREATE POLICY / RLS / GRANT / role guards behave the same
-- on 17 and 18. (Postgres has no CREATE ROLE IF NOT EXISTS, hence the DO block.)

-- ---------------------------------------------------------------------------
-- 1. Least-privilege Express runtime role (NOLOGIN, privilege-bearing).
--    Idempotent via a guard so re-application does not error.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r pg_roles%ROWTYPE;
  member_count integer;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'menu_backend';
  IF NOT FOUND THEN
    -- Fresh: create exactly the intended least-privilege role.
    CREATE ROLE menu_backend NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  ELSE
    -- Do NOT silently reuse a pre-existing role whose config we did not set.
    -- Validate the intended configuration; stop with a clear error otherwise.
    IF r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole THEN
      RAISE EXCEPTION 'Refusing to reuse existing role "menu_backend" with unexpected attributes (login=%, super=%, bypassrls=%, createdb=%, createrole=%). Expected a NOLOGIN/NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE role. Investigate and reconcile before re-running.',
        r.rolcanlogin, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole;
    END IF;
    -- It must not already be a member of other roles (unknown inherited privs).
    SELECT count(*) INTO member_count
      FROM pg_auth_members m WHERE m.member = r.oid;
    IF member_count > 0 THEN
      RAISE EXCEPTION 'Refusing to reuse existing role "menu_backend": it is a member of % other role(s), which could grant unknown privileges. Reconcile its memberships before re-running.', member_count;
    END IF;
    -- Config matches the intended least-privilege shape: safe to reuse.
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Harden table-level privileges on the five catalog tables.
--    Remove any write (and default) privileges from PUBLIC / anon / authenticated,
--    then grant the runtime role SELECT only. We deliberately do NOT grant
--    INSERT/UPDATE/DELETE to anyone here; catalog writes are an operator action.
--
--    REVOKE from anon/authenticated is guarded: those roles exist on Supabase
--    but not necessarily on a bare local Postgres, so we only revoke if present.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.menu_item              FROM PUBLIC;
REVOKE ALL ON public.item_variant           FROM PUBLIC;
REVOKE ALL ON public.modifier_group         FROM PUBLIC;
REVOKE ALL ON public.modifier_option        FROM PUBLIC;
REVOKE ALL ON public.variant_modifier_group FROM PUBLIC;

DO $$
DECLARE
  r    text;
  tbl  text;
  tbls text[] := ARRAY[
    'public.menu_item','public.item_variant','public.modifier_group',
    'public.modifier_option','public.variant_modifier_group'
  ];
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH tbl IN ARRAY tbls LOOP
        EXECUTE format('REVOKE ALL ON %s FROM %I', tbl, r);
      END LOOP;
    END IF;
  END LOOP;
END
$$;

-- Grant the Express runtime role READ-ONLY table privilege on each catalog table.
GRANT SELECT ON public.menu_item              TO menu_backend;
GRANT SELECT ON public.item_variant           TO menu_backend;
GRANT SELECT ON public.modifier_group         TO menu_backend;
GRANT SELECT ON public.modifier_option        TO menu_backend;
GRANT SELECT ON public.variant_modifier_group TO menu_backend;

-- The runtime role needs to resolve objects in the public schema.
GRANT USAGE ON SCHEMA public TO menu_backend;

-- ---------------------------------------------------------------------------
-- 3. RLS READ policies for the runtime role.
--    RLS was ENABLED (default-deny, no policies) in 0001. Table-level SELECT
--    alone is not enough while RLS is on — a SELECT policy must also permit the
--    rows. We add a READ-only policy per table FOR SELECT TO menu_backend.
--    We add NO INSERT/UPDATE/DELETE policy for anyone, so writes stay denied by
--    RLS even if some role held a table-level write privilege.
--    Policies are dropped-if-exists first so re-application is idempotent.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS menu_item_read              ON public.menu_item;
DROP POLICY IF EXISTS item_variant_read           ON public.item_variant;
DROP POLICY IF EXISTS modifier_group_read         ON public.modifier_group;
DROP POLICY IF EXISTS modifier_option_read        ON public.modifier_option;
DROP POLICY IF EXISTS variant_modifier_group_read ON public.variant_modifier_group;

CREATE POLICY menu_item_read              ON public.menu_item              FOR SELECT TO menu_backend USING (true);
CREATE POLICY item_variant_read           ON public.item_variant           FOR SELECT TO menu_backend USING (true);
CREATE POLICY modifier_group_read         ON public.modifier_group         FOR SELECT TO menu_backend USING (true);
CREATE POLICY modifier_option_read        ON public.modifier_option        FOR SELECT TO menu_backend USING (true);
CREATE POLICY variant_modifier_group_read ON public.variant_modifier_group FOR SELECT TO menu_backend USING (true);

-- ---------------------------------------------------------------------------
-- 4. Ledger protection reaffirmed: the application/runtime role must never be
--    able to write (or read) the migration ledger. The ledger already had
--    RLS enabled + REVOKE ALL FROM PUBLIC at init; make the intent explicit so
--    even if some blanket grant were added later, menu_backend holds nothing.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.schema_migrations FROM menu_backend;
