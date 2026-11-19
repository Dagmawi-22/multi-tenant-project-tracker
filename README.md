# Multi-Tenant Project Tracker

Projects and tasks with budgets in ETB, shared by several organizations on one deployment.
Each organization only ever sees its own data.

| | |
|---|---|
| Live URL | _TODO: https://<service>.onrender.com_ |
| Repository | _TODO: https://github.com/<user>/multi-tenant-project-tracker_ |
| Green pipeline run | _TODO: link to the Actions run_ |

**Demo accounts** (seeded, password `Password123!`)

| Email | Role |
|---|---|
| `hanna@addisbuild.et` | admin |
| `yonas@addisbuild.et` | member |

## Stack

NestJS, TypeORM, PostgreSQL (Neon), Handlebars for server-rendered pages, hosted on Render,
deployed by GitHub Actions.

## Architecture

One Nest application serves both a server-rendered UI and a JSON API under `/api`. Both go
through the same guards and the same services, so there is a single authorization path rather
than two that can drift apart. Data lives in five tables: `users`, `organizations`,
`memberships` (which carries the role), `projects` and `tasks`, plus `invitations` and a
session table. Sessions are stored in Postgres, so a restart does not sign everybody out.

## Running locally

```bash
npm install
cp .env.example .env     # fill in DATABASE_URL and SESSION_SECRET
npm run migration:run
npm run seed
npm run start:dev
```

The app listens on `http://localhost:3000`.

### Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Neon connection string, used by the running app |
| `DIRECT_DATABASE_URL` | Direct (unpooled) string, used by migrations |
| `TEST_DATABASE_URL` | Separate database for the test suite |
| `SESSION_SECRET` | Signs session cookies |
| `APP_URL` | Base URL used in invitation links |
| `SMTP_*`, `MAIL_FROM` | Gmail SMTP for invitation emails; optional |

Without SMTP configured the app still creates invitations and shows the link in the UI
instead of sending it.

## Tests

```bash
npm test
```

Fifteen specs covering cross-tenant access and role enforcement. They truncate every table,
so a setup file refuses to run unless `TEST_DATABASE_URL` is set — the suite can never point
at the live database by accident.

## Pipeline

`.github/workflows/ci.yml`, on every push:

1. Start a PostgreSQL 17 service container.
2. `npm ci`.
3. `npm run build`.
4. `npm run migration:run` against the throwaway database.
5. `npm test`.

Then, only on pushes to `main`:

6. `deploy` runs — it declares `needs: test`, so a red test job means it never starts.
7. It POSTs to a Render deploy hook held in the `RENDER_DEPLOY_HOOK_URL` secret.
8. It polls `/healthz` until the live site reports the same commit SHA that triggered the run,
   and fails if that has not happened within fifteen minutes.

Render's own auto-deploy is turned **off**. If it were on, Render would deploy on push by
itself and the test gate would be decorative.

## Migrations

Migrations are hand-written SQL in `src/database/migrations`, each with a real `up` and `down`.
TypeORM's `synchronize` is off everywhere, so the schema only ever changes through a migration.
Applied migrations are tracked in `schema_migrations`.

```bash
npm run migration:show      # what is applied
npm run migration:run       # apply pending
npm run migration:revert    # roll back the most recent one
```

In production the start command is `npm run migration:prod && node dist/main.js`, so a deploy
applies pending migrations before the new code serves a request.

**Adding a column safely** — the pattern used for `tasks.priority`: add the column nullable,
backfill existing rows to `medium`, then set the default and the `NOT NULL` and `CHECK`
constraints. Three steps rather than one `ADD COLUMN NOT NULL DEFAULT`, because old application
code is still running while the migration executes.

**Rolling back.** `npm run migration:revert` runs the `down` of the most recent migration.
Dropping a column destroys the data in it, so the real-world order is: roll the application
back first (old code simply ignores the new column), confirm the site is healthy, and only drop
the column afterwards if it genuinely has to go.

## Tenant isolation

Every tenant-scoped route carries the organization id in its URL, and `OrgMemberGuard` resolves
that id against a `memberships` lookup for the session's user before the handler runs. The
tenant id that queries filter by is therefore one the server proved you belong to, never one the
client asserted.

- The user id comes from a signed session cookie. No endpoint accepts a tenant id in a body.
- A non-member gets **404, not 403**, so the API never confirms that an organization exists.
- Every query carries `organization_id`. Updates and deletes are `WHERE id = $1 AND
  organization_id = $2`, so a guessed id touches zero rows instead of someone else's.
- `tasks` carry their own `organization_id` and reference their project through a composite
  foreign key on `(project_id, organization_id)`. Postgres rejects a task attached to another
  organization's project outright.
- Guards run before validation pipes, so someone probing another organization's endpoints
  cannot even learn whether their payload was well-formed.

### Where it could leak

- **Isolation is opt-in.** A new controller that forgets `@UseGuards(AuthenticatedGuard,
  OrgMemberGuard)` has no protection. Registering the guard globally so it self-activates on any
  route with an `:orgId` param would make it opt-out instead.
- **A forgotten predicate.** Any new query that filters by primary key alone, or a future join
  that omits `organization_id`, leaks immediately. Nothing in the database currently stops it.
- **Aggregates.** A reporting or admin endpoint that counts across organizations would bypass
  the guard entirely, since it would not be scoped to one.
- **Coverage.** The tests cover the routes that exist today, not ones added tomorrow.

## Two decisions

**Hand-written SQL migrations instead of generated ones.** TypeORM can diff entities and emit a
migration, but the output is a black box at the moment it matters most — running against live
data. Writing the SQL by hand means the backfill is explicit, the `down` is deliberate, and the
whole file can be read aloud and defended.

**Session cookies instead of JWT.** The brief allows either. A session can be revoked server-side
by deleting one row; a JWT stays valid until it expires. Since the app is already talking to
Postgres on every request, storing sessions there costs nothing and the membership lookup in the
guard is live rather than baked into a token at login.

## Before production

- **Row-level security.** Isolation is enforced in the application. Postgres RLS would move it
  into the database so a forgotten `WHERE` returns nothing instead of someone else's rows. Two
  prerequisites: connect as a non-owner role (a table owner bypasses its own policies unless
  `FORCE ROW LEVEL SECURITY` is set), and wrap each request in a transaction so
  `SET LOCAL app.current_org_id` is safe under Neon's connection pooler.
- **CSRF tokens.** Forms rely on `SameSite=Lax` cookies alone.
- **Rate limiting** on login, registration and invitation endpoints.
- **Audit log** of membership and role changes.
- **Rotate the seeded demo passwords** and set `SEED_PASSWORD` rather than using the default.
- Neon's free tier autosuspends and Render's free instances spin down, so the first request
  after a quiet period is slow.
