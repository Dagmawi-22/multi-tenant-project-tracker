# Multi-Tenant Project Tracker

Projects and tasks with ETB budgets, shared by several organizations on one deployment.
Each organization only ever sees its own data.

- **Live:** https://project-tracker-iqe7.onrender.com
- **Repo:** https://github.com/Dagmawi-22/multi-tenant-project-tracker
- **Green pipeline run:** https://github.com/Dagmawi-22/multi-tenant-project-tracker/actions/runs/44727425283

Credentials for the seeded demo accounts are sent separately by email rather than committed
here. There are two, in one organization: an admin, who can change a project's budget and
invite members, and a member, who cannot do either.

The live instance runs on Render's free tier and Neon autosuspends, so the first request after
a quiet period takes a few seconds to wake.

## Architecture

NestJS + TypeORM + PostgreSQL (Neon), Handlebars pages, deployed to Render by GitHub Actions.

A user can belong to several organizations and switches between them from `/orgs`. Inside one,
admins create projects and set budgets; any member adds tasks, each with a status, a priority,
an assignee drawn from that organization's members, and an estimated cost that rolls up into
spent-vs-budget. Tasks can be filtered by priority.

One app serves both the server-rendered UI and a JSON API under `/api`, through the same guards
and services, so there is one authorization path rather than two that can drift. Tables:
`users`, `organizations`, `memberships` (carries the role), `projects`, `tasks`, `invitations`,
and a session table — sessions live in Postgres so restarts don't sign anyone out.

## Running locally

```bash
npm install
cp .env.example .env     # DATABASE_URL and SESSION_SECRET are the only required ones
npm run migration:run
npm run seed
npm run start:dev        # http://localhost:3000
npm test                 # 31 specs; needs TEST_DATABASE_URL
```

Tests truncate every table, so they refuse to run unless `TEST_DATABASE_URL` is set and can
never hit the live database by accident. Without SMTP configured, invitations are still created
and the link is shown in the UI instead of emailed.

The seed builds its organization, admin and member from the `SEED_*` variables, falling back to
the sample names in `src/database/seed.ts`. Passwords have no production fallback: with
`NODE_ENV=production` the seed stops unless `SEED_ADMIN_PASSWORD` and `SEED_MEMBER_PASSWORD`
(or a shared `SEED_PASSWORD`) are set, so a deployment can never end up with a known password.

## Pipeline

`.github/workflows/ci.yml`. On every push: start a Postgres service container, `npm ci`, build,
run migrations against it, run tests.

On pushes to `main` only, a `deploy` job then POSTs to a Render deploy hook and polls `/healthz`
until the live site reports the triggering commit SHA. It declares `needs: test`, so a red test
job means it never starts.

Render's own auto-deploy is **off** — otherwise Render would deploy on push by itself and the
test gate would be decorative.

## Migrations

Hand-written SQL in `src/database/migrations`, each with a real `up` and `down`. TypeORM's
`synchronize` is off, so schema only changes through a migration. Production starts with
`npm run migration:prod && node dist/main.js`, so pending migrations apply before the new code
serves traffic.

```bash
npm run migration:show / migration:run / migration:revert
```

### `AddTaskPriority` — the shipped example

`tasks.priority` was added to a database that already had live rows, in five ordered steps
rather than one `ADD COLUMN NOT NULL DEFAULT`:

1. `ADD COLUMN priority text` — nullable, so the write is instant and old rows stay valid.
2. `UPDATE tasks SET priority = 'medium' WHERE priority IS NULL` — the backfill.
3. `SET DEFAULT 'medium'` — new inserts from old code still satisfy step 4.
4. `SET NOT NULL` — only safe once no row is null.
5. `ADD CONSTRAINT tasks_priority_check CHECK (priority IN ('low','medium','high'))`.

The split matters because old and new code run side by side during a deploy. A nullable column
with a default is readable by the old code, which ignores it, and writable by the new code
before the constraint lands. An index on `(organization_id, priority)` backs the filter, and
keeps the tenant column leftmost so it also serves unfiltered reads.

**Rollback:** `npm run migration:prod:revert` runs the `down` — drop index, drop constraint,
drop column — and was verified by reverting and re-running against a database holding rows:
`down` left every row intact, and `up` backfilled each one to `medium` again.

Dropping a column destroys its data, so the real rollback order is to roll the *application*
back first (old code ignores `priority`), confirm health, and only then drop the column if the
change is truly being abandoned.

## Tenant isolation

Every tenant-scoped route carries the organization id in its URL, and `OrgMemberGuard` resolves
it against a `memberships` lookup for the session's user before the handler runs — so the tenant
id queries filter by is one the server proved you belong to, never one the client asserted.

The guard is registered **globally** as an `APP_GUARD`, not per controller, and keys off the
presence of an `:orgId` route parameter: no parameter, no tenant check; parameter present, the
membership must exist. Isolation is therefore the default rather than something each new
controller opts into — no controller in this codebase declares `OrgMemberGuard`, and the
isolation tests still pass, which is what proves the global registration is doing the work.

That leaves one assumption: the guard only fires for routes that spell the tenant `:orgId`.
A route naming it `:tenantId`, or taking it from a body, would get no check. So the convention
is enforced rather than trusted — `test/route-tenancy.spec.ts` reflects over every registered
route and fails the build unless each one either carries `:orgId` or appears in an explicit
list of deliberately global routes (login, register, `/healthz`, the organization list). It
also rejects tenant-ish parameter names the guard would not recognise, and fails if the global
list goes stale. Adding an unscoped route is therefore a red pipeline, not a silent leak.

- User id comes from a signed session cookie; no endpoint takes a tenant id from a body.
- Non-members get **404, not 403**, so the API never confirms an organization exists.
- Every query carries `organization_id`; updates and deletes are `WHERE id = $1 AND
  organization_id = $2`, so a guessed id touches zero rows.
- `tasks` carry their own `organization_id` and reference projects through a composite foreign
  key on `(project_id, organization_id)` — Postgres rejects a task attached to another org's
  project outright.

**Where it could leak:** the route test catches an unscoped *route*, but nothing below the
guard. A query filtering by primary key alone, or a join omitting `organization_id`, still
leaks even though the request was correctly authorized — the guard proves which tenant you
are, it does not scope your SQL. A deliberate cross-org endpoint added to the global list
would be trusted on the author's word. And a non-HTTP entry point — a cron job, a queue
consumer, a future GraphQL resolver — has no route and so no guard at all.

Row-level security, listed below, is the answer to that whole class: it moves the check from
the request layer to the database, so a forgotten `WHERE` returns nothing instead of someone
else's rows.

## Two decisions

**Hand-written migrations over generated ones.** TypeORM can diff entities and emit a migration,
but that output is a black box exactly where it matters most — running against live data.
Writing the SQL means the backfill is explicit and the `down` is deliberate.

**Sessions over JWT.** Both were allowed. A session is revoked by deleting one row; a JWT stays
valid until it expires. The app already talks to Postgres on every request, so the membership
check in the guard is live rather than baked into a token at login.

## Before production

- **Row-level security**, so a forgotten `WHERE` returns nothing instead of someone else's rows.
  Needs a non-owner database role (owners bypass their own policies without `FORCE ROW LEVEL
  SECURITY`) and a transaction per request for `SET LOCAL` to be safe under Neon's pooler.
- CSRF tokens — forms currently rely on `SameSite=Lax` alone.
- Rate limiting on login, registration and invitations.
- Audit log for membership and role changes.
- Rotate the seeded demo passwords.
- Neon autosuspends and Render free instances spin down, so the first request after idle is slow.
