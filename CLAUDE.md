# WTP-SQMS

نظام مراقبة جودة الخدمة في محطات معالجة المياه — Service Quality Monitoring System for Water Treatment Plants.

A bilingual (Arabic RTL default, English LTR) decision-support web app for an MSc thesis. Engineers record readings per plant and period, the system evaluates 15 indicators against approved limits, and for each deviation the engineer selects obstacles and research-ranked corrective actions. The system supplies evidence; the engineer decides.

@AGENTS.md

## Read before working

- `docs/handoff/HANDOFF.md` is the specification. **Section 2 (client notes) overrides the prototype** wherever they conflict.
- `docs/handoff/reference/prototype-v4.html` is the visual and behavioural reference (demo login `engineer@wtp.iq` / `demo1234`). It is 337 KB with embedded images: search it, do not read it whole.
- `docs/handoff/data/*.json` is the seed data. Do not edit it; change the seed script if the shape changes.
- Work is delivered in phases (HANDOFF section 9). Build one phase, stop, and report.

## Never

1. **Never trust client-computed values.** Indicator values, statuses and problem creation are recomputed on the server from raw inputs with `src/lib/evaluation` at approval. A value sent by the browser is display-only.
2. **Never bypass row-level security.** `src/` connects only as the restricted `wtp_app` role. Every query on a user-owned table goes through `withUser()` (see below). Nothing under `src/` may read `DATABASE_OWNER_URL` or import from `scripts/`. Only `src/lib/auth/` may use the auth connection.
3. **Never show RII in the UI**, nor correlation, priority % or importance order (client notes 12, 13, 15). The app role cannot even select `rii`, `correlation_r` or `priority_pct`. Show an action's `rank` and text only.

## Stack

| Concern | Choice |
| --- | --- |
| App | Next.js 16 App Router, React 19, TypeScript strict. Cache Components is off (every screen is per-user). |
| UI | Tailwind CSS 4, shadcn/ui (RTL mode on, `components.json`), Lucide icons |
| i18n | next-intl 4: `/ar` (default, RTL) and `/en` (LTR), messages in `messages/<locale>/<namespace>.json` |
| Database | PostgreSQL 16 in Docker (`docker-compose.yml`), self-hosted. No Supabase. |
| ORM | Drizzle ORM + drizzle-kit, SQL migrations committed in `drizzle/` |
| Auth | Better Auth: email + password, sessions in Postgres, reset by email, on its own database role |
| Theme | next-themes: Light / Dark / System, saved per user |
| Email | Nodemailer over SMTP; Mailpit locally |
| Validation | Zod 4, shared by client and server |
| Tests | Vitest: `unit` project (pure logic) and `db` project (real database); Playwright for end-to-end |

This Next.js version differs from older ones (for example `src/proxy.ts` replaces `middleware.ts`, and `params` is a promise). Check `node_modules/next/dist/docs/` before using an API from memory.

## Commands

```bash
cp .env.example .env     # first time only
npm run db:up            # start Postgres (localhost:54329) and Mailpit (UI http://localhost:54326)
npm run db:migrate       # create/repair the database and roles (db:roles), then apply drizzle/*.sql
npm run db:seed          # load docs/handoff/data into the reference tables (idempotent)
npm run db:seed:demo     # create or fully reset the demo account engineer@wtp.iq / demo1234 (3 plants, Mar-Aug 2026)
npm run db:reset         # LOCAL ONLY: drop everything, migrate, seed
npm run clean            # remove .next, .next-dev, tsbuildinfo, Playwright output; stop dev first
npm run db:down          # stop the containers (data volume is kept)
npm run db:generate -- --name <what_changed>   # new migration after editing src/db/schema

npm run dev              # http://localhost:3100 (redirects to /ar)
npm run build
npm run lint
npm run typecheck
npm test                 # unit tests, no database needed
npm run test:db          # database tests: needs db:up, db:migrate, db:seed
npm run test:all
npm run test:e2e         # Playwright journeys (starts the dev server if needed); rewrites docs/screenshots/
                         # E2E_KEEP_USERS=1 skips test-user cleanup when two runs share the database
```

Ports are non-default on purpose (3100, 54329, 54325, 54326) so they do not collide with other local projects.

## Folder structure

```
docs/handoff/          the original handoff package (spec, seed JSON, prototype, thesis files)
drizzle/               SQL migrations. 0001_security.sql: grants, RLS policies, ranked view. 0002: auth role, my_profile
messages/<locale>/     UI strings, one file per namespace (common, auth, shell, ...)
scripts/               db-roles.ts (admin: creates database + roles), seed.ts, db-drop.ts, clean.ts, lib/owner-db.ts
src/app/[locale]/      root layout (fonts, theme, i18n providers)
src/app/[locale]/(auth)/   login, signup, forgot-password, reset-password (signed-out only)
src/app/[locale]/(app)/    everything behind sign-in; layout.tsx calls requireUser() and renders the shell
src/app/api/auth/      Better Auth route handler
src/components/ui/     shadcn/ui components
src/components/shell/  sidebar, top bar, tab bar, drawer, user menu, PageHeader, EmptyState, nav config (nav.ts)
src/components/auth/   auth forms; src/components/brand/ system logo
src/db/schema/         Drizzle schema: enums, auth, reference, app (user-owned)
src/db/client.ts       the app-role pool and `db`
src/db/with-user.ts    `withUser()`: the only door to user-owned tables
src/i18n/              next-intl routing, navigation wrappers, request config
src/lib/auth/          Better Auth instance, its own DB connection, session helpers, mailer
src/lib/evaluation/    pure evaluation rules (HANDOFF section 4) and their unit tests
src/lib/account/       server actions: locale, theme, sign out
src/lib/plants/        plants: constants, schemas, state helpers, service (data functions), actions
src/lib/indicators/    indicators, limits, adoption, user-defined indicators and groups; ref.ts ("sys:SC-01" / "usr:<uuid>")
src/lib/assessments/   drafts, approval (server recompute, limits snapshot, audit, auto problems), results, history
src/components/assessments/  wizard/ (4 steps), results/ (results page, drawer, chart), list/
src/lib/problems/      obstacles, ranked suggestions, show-all, custom obstacles/actions, action lifecycle, derived stage (stage.ts), audit
src/components/problems/  page/ (single problem), list/; src/components/actions-log/
src/components/shared/ ResponsiveDialog (dialog on desktop, bottom sheet on phones)
src/components/plants/, src/components/indicators/   feature UI; ThresholdScale lives in indicators/
src/lib/context/       top-bar filters (plant, monitoring period) stored in cookies: getFilters(), setFilters
src/proxy.ts           locale routing
tests/db/              database tests: RLS isolation, RLS coverage, auth isolation, reference access, seed
tests/e2e/             Playwright journeys
docs/reference-screenshots/prototype/   prototype screenshots + LAYOUT.md (the layout to match)
docs/screenshots/      screenshots of this app, written by the e2e tests
```

## Data access rule

Three database roles exist. `scripts/db-roles.ts` creates or repairs them and the database on every `npm run db:migrate` (idempotent; works on a fresh server and on an existing one; no manual steps). It connects with `DATABASE_ADMIN_URL` (needs CREATEROLE and CREATEDB) and takes role names, passwords and the database name from the three `DATABASE_*_URL` values. Table grants stay in the migrations.


- `wtp_owner` owns the tables. It is used **only** by `drizzle-kit` and the scripts in `scripts/`.
- `wtp_auth` is used **only** by Better Auth (`src/lib/auth/db.ts`). It can reach the four auth tables (`users`, `sessions`, `accounts`, `verifications`) and nothing else.
- `wtp_app` is what the rest of the app connects with. It is not a superuser, has no `BYPASSRLS`, owns nothing, and has **no access to the auth tables** (emails, password hashes, sessions).

Every user-owned table has `owner_id` and a policy `owner_id = app_user_id()`, where `app_user_id()` reads the transaction-local setting `app.user_id`. That setting is made in exactly one place:

```ts
import { withUser } from "@/db/with-user";

const rows = await withUser(session.user.id, (tx) =>
  tx.select().from(plants).orderBy(plants.createdAt),
);
```

- `withUser` opens a transaction, runs `set_config('app.user_id', <id>, true)` (the parameterised form of `SET LOCAL`), then your queries. Without it the app sees zero rows and cannot write.
- The user id comes from the verified server session (`requireUser()` / `getSession()` in `src/lib/auth/session.ts`), never from request input.
- Do not query user-owned tables with the bare `db` export. `db` is for reference tables.
- Still set `ownerId` explicitly on inserts; the policy rejects a mismatch.
- Reference tables (`indicators`, `obstacles`, `corrective_actions`, …) are read-only for the app. Read actions through the `correctiveActionsRanked` view (code, axis, text, `sortPosition`), and select only `obstacleCode`, `actionCode`, `rank` from `obstacleActionLinks`. `select *` on those two tables fails by design.
- **Profile.** `users` doubles as the profile: `name` (column `full_name`), `jobTitle`, `locale`, `theme`. The app never queries `users`. Read the current user's profile from the session (`session.user`) or from the `myProfile` view inside `withUser()` (one row: the current user). Change it with `auth.api.updateUser({ body, headers })`, never with SQL.
- A new role or a new auth table needs its grants in a migration; `tests/db/auth-isolation.test.ts` proves the app role cannot touch the auth tables.

### Adding a table

1. Add it to `src/db/schema/app.ts` with `owner_id`, and a composite foreign key `(parent_id, owner_id)` to its parent so a child can never belong to a different owner.
2. `npm run db:generate -- --name <name>`, then add to the generated SQL: `ENABLE ROW LEVEL SECURITY`, the `owner_only` policy, and the grants (copy the pattern in `drizzle/0001_security.sql`).
3. `npm run db:migrate && npm run test:db`. `tests/db/rls-coverage.test.ts` fails if a table with `owner_id` has no policy.

Never edit a migration that has been committed; add a new one.

## Conventions

- **Writes are server actions** (or route handlers), validated with a Zod schema that the client form reuses. Authorise first, then `withUser`.
- **Feature layout:** `src/lib/<feature>/service.ts` holds data functions that take the `tx` from `withUser` (tested in `tests/db/`); `actions.ts` is a thin `"use server"` wrapper: `requireUser()`, validate, `withUser`, `revalidatePath`, typed result with error codes. Dialogs use `ResponsiveDialog`.
- **Limits are per user per indicator**, not per plant. `ensureDefaultLimits` copies the seeded defaults once and never overwrites; user-defined indicators start with no approved limits. **Adoption is per plant**; a missing `plant_indicators` row means not adopted. New plants adopt all system indicators plus the user's adopt-all indicators.
- **A plant with assessments (drafts included) cannot be deleted**; the database refuses too.
- **Assessments.** A period is a start month + 1/3/6/9/12 months and must have ended or be the current month (Baghdad time). Same-length periods of one plant may not overlap (DB exclusion constraint, SQLSTATE 23P01); different lengths may. One draft per plant + start + length; approving updates that row. **Approved assessments are final** (DB triggers, WA001/WA002): only the per-indicator note may change, and that is audited. Approval recomputes every value from stored raw inputs, evaluates against the user's current limits, stores them as `limits_snapshot`, and opens one auto problem per critical reading. Results, drawers, charts and reports read the snapshot, never current limits. Time-dependent service functions take `now` as an argument.
- **Problems.** Status is derived, never stored (`deriveStage` in `src/lib/problems/stage.ts`): any chosen action → treated; else the obstacle-only flag → documented; else any obstacle → choosing an action; else awaiting obstacles. Open = the last two; only those count in the badge, alerts and `openProblems`. Chosen and implemented are different states; an implemented date needs a chosen action (DB check), must not be in the future or before detection, and is cleared on un-choosing.
- **Obstacles and actions are shown by text only.** Obstacles are numbered per axis from `seq_in_axis`; action cards show the rank and the text. Never render obstacle or action codes (`O-36`, `A-41`), RII, correlation, priority % or importance order, and never label the view's `sortPosition` as a rank. The app role cannot read `rii`, `correlation_r`, `priority_pct` or `importance_order`.
- **Audit events** store action codes and a payload; the UI turns them into sentences.
- **Demo data** is created only by `scripts/seed-demo.ts`, through the real service code, never by migrations. Tests seed their own copy under an `e2e-…@test.local` address and must not touch `engineer@wtp.iq`.
- **Threshold scale:** use `ThresholdScale` wherever an indicator value appears.
- **Evaluation logic lives in `src/lib/evaluation`** and stays pure (no I/O, no dates from the clock). Comparisons with limits are strict: a value exactly on a limit gets the better status. Results always use the limits snapshot stored on the assessment, never current limits.
- **References to an indicator or obstacle** are two nullable columns (system code, user-defined id) with a check that exactly one is set. Keep that shape.
- **Pages behind sign-in** live in `(app)/`, call `requireUser()` themselves, and start with `PageHeader`. Read the selected plant and period with `getFilters()`. Add new destinations to `src/components/shell/nav.ts`.
- **Obstacles are numbered per axis** in source order (`seq_in_axis`), restarting at 1 in each axis (owner decision).
- **IDs in URLs are UUIDs.** System reference rows use their codes (`SC-01`, `O-12`, `A-40`).
- **Strings:** no hard-coded UI text. Add keys to both locales under `messages/<locale>/<namespace>.json` (the file name is the top-level key; register new namespaces in `src/i18n/request.ts`). Arabic wording from the handoff is used exactly as given. Reference content (indicator, obstacle, action, axis names) comes from the database columns `*_ar` / `*_en`. User-entered text is shown as typed.
- **Navigation:** import `Link`, `redirect`, `useRouter`, `usePathname` from `@/i18n/navigation`, not from `next/*`. Server components call `setRequestLocale(locale)`.
- **RTL:** use logical utilities only (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`), never `ml/mr/pl/pr/left/right`. Mirror directional icons with `rtl:-scale-x-100`. Wrap numbers and codes in the `num` class so they read left-to-right with tabular figures. Charts run in reading direction.
- **Design tokens** are in `src/app/globals.css` (from the prototype). Status is always icon + text + colour (`ok`, `warning`, `critical`, `insufficient`, `nolimits`), never colour alone. Dark values exist under `.dark`, switched by next-themes.
- **No demo/illustrative labels, no RII, no version-history UI** anywhere (client notes 3, 6, 13).

## Definition of done

- `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:db` pass.
- New rules in `src/lib/evaluation` have unit tests; new user-owned tables are covered by RLS.
- The screen works in Arabic (RTL) and English (LTR) at 390, 768 and 1440 px.
- The relevant client notes in HANDOFF section 2 are satisfied.
- The dev server writes to `.next-dev` and the production build to `.next` (see `next.config.ts`). Do not merge them: with a shared directory, the first `next dev` after a `next build` reloads every page in a loop.
- Changes are committed in small commits; a phase ends with a report and the open questions for the next one.
