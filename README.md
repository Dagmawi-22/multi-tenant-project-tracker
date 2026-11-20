# Multi-Tenant Project Tracker

Projects and tasks with ETB budgets, shared by several organizations on one deployment.
Each organization only ever sees its own data.

- **Live:** _TODO_
- **Repo:** _TODO_
- **Green pipeline run:** _TODO_

Demo accounts, password `Password123!`: `hanna@addisbuild.et` (admin), `yonas@addisbuild.et` (member).

## Architecture

NestJS + TypeORM + PostgreSQL (Neon), Handlebars pages, deployed to Render by GitHub Actions.

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
npm test                 # 15 specs; needs TEST_DATABASE_URL
```

Tests truncate every table, so they refuse to run unless `TEST_DATABASE_URL` is set and can
never hit the live database by accident. Without SMTP configured, invitations are still created
and the link is shown in the UI instead of emailed.

The seed builds its organization, admin and member from the `SEED_*` variables, falling back to
the sample names in `.env.example`. Passwords have no production fallback: with
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

Adding `tasks.priority` uses the safe pattern: add the column nullable, backfill existing rows
to `medium`, then set the default and the `NOT NULL` and `CHECK` constraints — three steps, not
one `ADD COLUMN NOT NULL DEFAULT`, because old code is still running during the deploy.

**Rollback:** `npm run migration:revert` runs the latest `down`. Dropping a column destroys its
data, so in practice you roll the application back first (old code ignores the new column),
confirm health, and only then drop.

## Tenant isolation

Every tenant-scoped route carries the organization id in its URL, and `OrgMemberGuard` resolves
it against a `memberships` lookup for the session's user before the handler runs — so the tenant
id queries filter by is one the server proved you belong to, never one the client asserted.

- User id comes from a signed session cookie; no endpoint takes a tenant id from a body.
- Non-members get **404, not 403**, so the API never confirms an organization exists.
- Every query carries `organization_id`; updates and deletes are `WHERE id = $1 AND
  organization_id = $2`, so a guessed id touches zero rows.
- `tasks` carry their own `organization_id` and reference projects through a composite foreign
  key on `(project_id, organization_id)` — Postgres rejects a task attached to another org's
  project outright.

**Where it could leak:** isolation is opt-in, so a new controller that forgets the guard has
none; any future query filtering by primary key alone, or a join omitting `organization_id`,
leaks immediately; a cross-org reporting endpoint would bypass the guard entirely; and the tests
cover today's routes, not tomorrow's.

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
