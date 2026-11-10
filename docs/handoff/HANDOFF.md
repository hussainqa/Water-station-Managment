# Service Quality Monitoring System for Water Treatment Plants — Build Handoff

**Arabic name:** نظام مراقبة جودة الخدمة في محطات معالجة المياه
**English name:** Service Quality Monitoring System for Water Treatment Plants
**Working code name:** WTP-SQMS

This package takes the system from an approved interactive prototype to a production web app. It contains:

| Path | What it is |
| --- | --- |
| `HANDOFF.md` | This file: context, client notes, requirements, data model, plan, and the prompts |
| `data/indicators.json` | The 15 system indicators in 4 groups (from the thesis Excel), with input definitions and illustrative default limits |
| `data/obstacles_actions.json` | 40 obstacles, 65 corrective actions, 7 axes, and the significant obstacle→action links with research rank (from the two thesis Word files) |
| `reference/prototype-v4.html` | The approved prototype (single HTML file; open in a browser; demo login `engineer@wtp.iq` / `demo1234`). **This is the visual and behavioural reference.** |
| `reference/source-files/` | The original thesis files the data was extracted from |

---

## 0. How to use this package

1. Give the whole folder to **Claude Fable 5** with the prompt in **§12.1**. Fable reviews the plan, resolves gaps, and writes the final `CLAUDE.md`, `docs/SPEC.md` and a phase-by-phase Claude Code prompt.
2. Give Fable's output (plus `data/` and `reference/`) to **Claude Code** in an empty repository and start with Phase 0.
3. If you skip Fable, the prompt in **§12.2** can go straight to Claude Code.

---

## 1. Context

- **What it is:** a decision-support web app for an MSc thesis (College of Engineering, University of Baghdad). It monitors the service quality and operational performance of water treatment plants. It does **not** diagnose causes automatically; the engineer decides, and the system supplies evidence and research-ranked suggestions.
- **Researcher:** Alhussien Abdalkhaliq Abdulaziz (الحسين عبد الخالق عبد العزيز). **Supervisor:** Prof. Abbas Mohammed Burhan (أ.د. عباس محمد برهان).
- **Users:** plant engineers and researchers. Each user owns their plants and data; nobody sees anyone else's plants.
- **Method (three stages, kept visibly separate in the UI):**
  1. **Performance measurement** — enter readings for a plant and period; the system computes indicator values and compares them with approved limits.
  2. **Identifying obstacles** — for each deviation (problem), the engineer selects only the obstacles that apply and marks each *confirmed* or *possible*.
  3. **Corrective actions** — the system lists actions linked to the selected obstacles in the research's rank order; the engineer chooses, may add their own, and later records implementation.
- **Languages:** full Arabic (RTL, default) and English (LTR), switchable at any time, including all research content.

---

## 2. Client notes for this build (latest round, mandatory)

These override the prototype wherever they conflict. Original Arabic is kept so wording can be checked.

| # | Client note (Arabic) | Requirement for the app |
| --- | --- | --- |
| 1 | واجهة تسجيل الدخول: السطر تحت العنوان (دعم اتخاذ القرار) يحذف | Login: remove the description line under the system title. |
| 2 | تحذف آخر شيء كلمة «رسالة الماجستير» | Login: remove the bottom line "رسالة ماجستير · كلية الهندسة · جامعة بغداد". Keep the ministry/university logos, the institution line, and the researcher and supervisor boxes. |
| 3 | سطر «بيانات تجريبية…» يحذف بالكامل من كل الواجهات | Remove the demo-data banner from every screen. No "demo/illustrative" tags anywhere in the UI. |
| 4 | محطات المياه: سطر العنوان يحذف | Plants page: remove the subtitle line under the page title. |
| 5 | مؤشرات الأداء: السطر تحت العنوان يحذف إلى حد «حدّد المؤشرات المعتمدة» | Indicators page: the subtitle keeps only "حدّد المؤشرات المعتمدة لكل محطة، واضبط المحددات المستخدمة في تقييمها." (and its English equivalent). Remove the counts/source text before it. |
| 6 | سجل إصدارات المحددات يحذف | Remove the "limits version history" button and screen. (Still snapshot the limits onto each assessment internally — see §5.3 — but show no version UI.) |
| 7 | عند إضافة محطة توجد عبارة تحت «إضافة محطة» تحذف | Add-plant dialog: remove the subtitle sentence under the dialog title. |
| 8 | إلغاء تصنيف المؤشرات (عددي، زمني…) وتحويلها إلى المحاور الأربعة | Indicators page: replace the measurement-type filter (count / duration / percentage / concentration) with the 4 groups: continuity, water quality, customer satisfaction, response time. |
| 9 | حذف التفاصيل تحت وصف المؤشر (طريقة الحساب، الأفضل…) | Indicator cards show code, name and (if any) description only. Remove the calculation method, unit tag, better-direction tag and calculation line from the list. (Keep them inside the limits/edit dialogs where needed.) |
| 10 | تعديل «عدد المستفيدين…» إلى «نسبة المستفيدين الذين يعانون من انقطاع» وقيمتها نسبة مئوية يحددها المهندس المقيم | SC-02 becomes **"نسبة المستفيدين الذين يعانون من انقطاع الخدمة"**, unit %, entered directly (0–100) by the resident engineer, lower is better. Already reflected in `data/indicators.json`. |
| 11 | عند تحديد العوائق: العبارة تحت «العوائق» تبقى إلى حد «العوائق الأربعون» وتحذف منها إلى النهاية | Obstacles section helper text becomes only: "حدّد فقط العوائق التي ترتبط بهذه المشكلة، وصنّف كلاً منها: مؤكد أو محتمل. لا يلزم تقييم بقية العوائق." |
| 12 | ترقيم العوائق حسب تسلسلها وليس حسب الأهمية، وحذف التفاصيل؛ يبقى العائق وشرحه وتسلسله ١، ٢، ٣ | Obstacles are listed in **source order** and numbered with a plain sequence (1, 2, 3…). Remove importance order, correlation counts and codes from the display. Show only the number and the obstacle text. *(Assumption to confirm: numbering restarts at 1 inside each axis, following `seq_in_axis`.)* |
| 13 | الإجراءات: حذف سطر الشرح تحت العنوان؛ يظهر فقط الإجراء وترتيبه؛ لا تظهر قيمة RII | Corrective actions: remove the explanatory line under the section title. Each action card shows only its **rank** and **text** (plus the choose / study / implemented controls). Do not show RII, correlation, priority %, or axis labels. |
| 14 | إمكانية عرض جميع الإجراءات التصحيحية لجميع المحاور عند اختيار الإجراء | Add a "عرض جميع الإجراءات التصحيحية" option that lists all 65 actions across all 7 axes (grouped by axis, with search), so the engineer can choose any action, not only the linked ones. |
| 15 | تحديث التقرير حسب الملاحظات وحذف شعار وزارة التعليم وهذه التفاصيل لكي يكون تقرير عمل، وحذف آخر شيء (الباحث…) | Report becomes an operational **work report**: no ministry/university logos or institution lines in the header, no researcher/supervisor footer, no demo watermark, no RII/correlation columns. Apply notes 9, 12 and 13 to the report too. |

---

## 3. Functional requirements

### 3.1 Accounts and access
- Sign up with full name, job title (المنصب), email and password (min 8 chars, confirmation). Sign in, sign out, password reset by email.
- Every record belongs to one user. **A user can never read or write another user's plants, assessments, problems, indicators or limits.** Enforce this in the database (row-level security), not only in the UI.
- One seeded **demo account** for the thesis defence, with the three sample plants and six months of history (see §7). Provide an admin-only script to reset it.

### 3.2 Login screen
- Ministry of Higher Education logo, University of Baghdad logo, institution line ("وزارة التعليم العالي والبحث العلمي · جامعة بغداد · كلية الهندسة"), system logo and title, sign-in form, link to create an account, researcher and supervisor boxes, language switch.
- No description line, no "master's thesis" line (notes 1–2). The logos are in the prototype (data URIs inside `reference/prototype-v4.html`); extract them to `/public`.

### 3.3 Plants (محطات المياه)
- List as cards with search. Fields: name, governorate (list of 18), location, water source (list), design capacity and actual capacity (m³/day), engineer in charge, notes. **No plant type.**
- Card shows state (stable / warnings / needs review / not assessed), utilisation %, number of past assessments, and a small trend sparkline.
- A user can add any number of plants.

### 3.4 Performance indicators (مؤشرات الأداء)
- 15 system indicators in 4 groups (from `data/indicators.json`). They cannot be deleted or edited by users.
- **User-defined indicators:** a user can add indicators to *their* system: name (Arabic, optional English), group (existing or new group), optional description, method (direct value, direct percentage, duration, ratio, average), input labels, unit, better direction, and "adopt at all my plants". Users can edit them, and delete them only if no assessment uses them.
- **Adoption per plant:** a switch per indicator per plant: "معتمد / غير معتمد في هذه المحطة".
- **Limits per indicator:** target, warning and critical (or min/max acceptable and critical min/max for range indicators), plus "no approved limits". Live preview of the threshold scale with a test value. Validation of limit ordering.
- Page filter = the 4 groups (+ user groups), not measurement type (note 8). Card content per note 9.

### 3.5 Assessments (التقييمات)
- Wizard with 4 steps:
  1. **Details:** plant, monitoring period type (**1, 3, 6, 9 or 12 months**), starting month, start/end dates (auto-filled, editable), entered by. Block duplicates (same plant, start and length).
  2. **Indicators by group:** each group has a select-all checkbox (with indeterminate state) and individual indicators; only adopted indicators are selectable.
  3. **Readings:** one card per indicator with its input fields; live validation (numbers, non-negative, integers where required, numerator ≤ denominator, 0–100 for percentages); computed value shown with its formula; progress bar.
  4. **Review and approve:** table of inputs and values; incomplete indicators are marked "insufficient data" and require an explicit acknowledgement; errors block approval. Save as draft at steps 3–4.
- On approval: compute values, evaluate against the **current limits**, store a snapshot of those limits on the assessment, write the audit trail, and **open a problem automatically for every critical indicator**.
- **Results page:** data completeness ring, counts, period, status callouts per deviation, results table grouped by indicator group (recorded value, target/limit, position on the threshold scale, status, change vs the previous period of the same length), indicator detail drawer (value, limits, history chart, notes), audit trail.
- A warning-level deviation can be opened as a problem manually.

### 3.6 Problems, obstacles and corrective actions (one page per problem)
- **Problem details:** plant, indicator, detection date, recorded value, approved limit, editable description.
- **Obstacles:** the 40 obstacles in **7 collapsible axes**, in source order, numbered 1, 2, 3… (note 12), with search and an "all / selected" filter. The user ticks only relevant obstacles and marks each **confirmed (مؤكد)** or **possible (محتمل)**, with a notes field. "Add an unlisted obstacle" (name, description, rationale, classification).
- **Suggested corrective actions** (same page, below the obstacles):
  - For each selected obstacle (confirmed first, then possible): its linked actions from `linked_actions`, ordered by `rank`. Show only rank and action text (note 13).
  - If a selected obstacle has no linked actions, say so and offer that axis's actions.
  - **"Show all corrective actions"** (note 14): all 65 actions grouped by the 7 action axes, searchable, selectable.
  - For an unlisted (user-added) obstacle: show all actions.
  - "Add a case-specific action" (text, description, linked obstacle, rationale, choose now).
  - If nothing fits: "Keep the obstacle only and prepare the report".
- **Action lifecycle (keep distinct):** suggested → chosen → implemented (with the actual date), plus a "needs further study" flag. Choosing does not mean implemented.
- **Problem status:** awaiting obstacles → choosing an action → **treated** (at least one action chosen) or **obstacle recorded, no action**. A treated or recorded problem leaves the alerts list and the open-problems badge.
- **Corrective-actions page:** log of all chosen, implemented and needs-study actions across problems.

### 3.7 Dashboard
- Filters: plant (or all) and monitoring period (last 1, 3, 6, 9, 12 months, full history).
- Stat tiles: registered plants, assessments completed, indicators within limits, indicators needing follow-up, problems awaiting review.
- Indicator status breakdown per plant (latest assessment).
- Alerts table (warning/critical, excluding treated problems).
- Latest assessments (including drafts).
- **No trend chart and no period-comparison chart** (removed in an earlier round).

### 3.8 Reports
- Choose plant, assessment period and type (period report / plant history).
- Sections: plant information; assessment period; indicators and results (grouped); comparison with limits; trends across periods (table + one chart); problems found; obstacles identified (classification and notes); corrective actions chosen (status, rank, no RII); missing data; notes and conclusions.
- Work-report styling per note 15. **Export to PDF** with correct Arabic shaping and RTL (see §6).

### 3.9 Bilingual UI
- Arabic default; switch persists per user. All UI strings, the 15 indicators, 40 obstacles, 65 actions, axis and group names come in both languages (English already in the data files). User-entered text is shown as typed.
- Full mirroring: sidebar side, chevrons, charts (time runs in reading direction), tables, dialogs.

---

## 4. Business rules

- **Status of an indicator value:** no value → *insufficient data*; no limits → *no approved limits*; higher-is-better: `< critical` → critical, `< warning` → warning, else within limits; lower-is-better mirrored; range: outside critical min/max → critical, outside acceptable min/max → warning.
- **Calculation methods:** direct; direct percentage (0–100); duration (minutes ÷ 60 → hours); ratio = numerator ÷ denominator × 100 (denominator > 0, numerator ≤ denominator); average = total ÷ count (count > 0).
- **Previous-period comparison:** the latest approved assessment of the same plant with the same period length that ends before this one starts.
- **Reproducibility:** results always use the limits snapshot stored on the assessment, never the current limits.
- **Auto problems:** one per critical indicator per approved assessment. Manual problems: only for warning or critical values.
- **Action ranking:** for a system obstacle, show `linked_actions` sorted by `rank`. In "show all", group by action axis in source order. RII is used only as a hidden tiebreaker/sort for the unlisted-obstacle view.

---

## 5. Data model (PostgreSQL)

### 5.1 Reference data (seeded, read-only, shared)
- `indicator_groups(code, name_ar, name_en, sort)`
- `indicators(code, group_code, name_ar, name_en, method, unit, better, input_labels jsonb, sort, is_system=true)`
- `obstacle_axes(idx, name_ar, name_en)`, `action_axes(idx, name_ar, name_en)`
- `obstacles(code, axis_idx, seq_in_axis, source_row, text_ar, text_en, importance_order)`
- `corrective_actions(code, axis_idx, seq_in_axis, source_row, text_ar, text_en, rii)`
- `obstacle_action_links(obstacle_code, action_code, rank, correlation_r, priority_pct)`

### 5.2 User-owned data (every table has `owner_id` with RLS `owner_id = auth.uid()`)
- `profiles(id = auth.users.id, full_name, job_title, locale)`
- `user_indicator_groups(id, owner_id, name_ar, name_en)`
- `user_indicators(id, owner_id, group_ref, …same shape as indicators…)`
- `plants(id, owner_id, name, governorate, location, water_source, design_capacity, actual_capacity, engineer, notes, created_at)`
- `plant_indicators(plant_id, indicator_ref, adopted bool)`
- `indicator_limits(id, owner_id, indicator_ref, kind, target, warning, critical, min_ok, max_ok, crit_min, crit_max, none bool, updated_at)` — current limits
- `assessments(id, owner_id, plant_id, period_start, months, start_date, end_date, entered_by, status draft|approved, limits_snapshot jsonb, approved_at, created_at)`
- `assessment_readings(assessment_id, indicator_ref, inputs jsonb, value numeric null, status, note)`
- `problems(id, owner_id, assessment_id, indicator_ref, detected_on, value, origin auto|manual, description, obstacle_only bool)`
- `problem_obstacles(problem_id, obstacle_ref, classification confirmed|possible, note)` — `obstacle_ref` points to a system obstacle or to `custom_obstacles`
- `custom_obstacles(id, problem_id, name, description, rationale)`
- `problem_actions(problem_id, action_ref, chosen bool, needs_study bool, implemented_on date null, linked_obstacle_ref)`
- `custom_actions(id, problem_id, name, description, rationale, linked_obstacle_ref, chosen, needs_study, implemented_on)`
- `audit_events(id, owner_id, entity, entity_id, actor, action, payload jsonb, at)`

`indicator_ref` must resolve to either a system indicator code or a user indicator id (use a discriminated column or a view). All IDs in URLs are UUIDs.

### 5.3 Notes
- Store the **limits snapshot** on approval (note 6 removes only the UI).
- Never trust client-computed values: recompute on the server at approval.

---

## 6. Recommended stack

| Concern | Choice | Why |
| --- | --- | --- |
| App | **Next.js (App Router) + TypeScript** | Matches the original brief; server actions for writes |
| UI | **Tailwind CSS + shadcn/ui + Lucide icons** | Matches the brief; rebuild the prototype's tokens (§8) |
| Charts | **Recharts** | Matches the brief; mirror for RTL |
| i18n | **next-intl** with `ar` (default, RTL) and `en` | Locale routing, message files, RTL `dir` on `<html>` |
| DB + Auth | **Supabase** (Postgres, Auth, Row-Level Security) | Per-user isolation enforced in the database; email auth and reset built in |
| Validation | **Zod** shared between client and server | One schema for wizard inputs and server recompute |
| PDF | Print-optimised report route rendered to PDF with **headless Chromium (Playwright)** in a server function, or the browser's print-to-PDF as a fallback | Correct Arabic shaping and RTL; avoid PDF libraries with weak Arabic support |
| Tests | **Vitest** (evaluation logic), **Playwright** (end-to-end journey, RLS isolation) | |
| Hosting | **Vercel + Supabase** (simplest), or Cloudflare Workers + Supabase | |

Fable should confirm or adjust these choices with the owner before Phase 0.

> **Update, 2026-11-10 (owner decision): Supabase was replaced.** Everything runs on a database we host ourselves.
>
> | Concern | Now |
> | --- | --- |
> | Database | PostgreSQL 16 in Docker (`docker-compose.yml`), with Mailpit for local email |
> | ORM and migrations | Drizzle ORM + drizzle-kit, SQL migrations committed in `drizzle/` |
> | Auth | Better Auth: email + password, sessions in Postgres, password reset by email (SMTP via env) |
> | Per-user isolation | Still enforced in the database. The app connects as a restricted role (`wtp_app`, no BYPASSRLS, owns no tables). Every user-owned table has RLS on `owner_id = current_setting('app.user_id')`, set per transaction by one server-side helper (`withUser`). |
> | RII | Column-level grants: the app role cannot select `rii`, `correlation_r` or `priority_pct`. A view exposes a sort position only. |
>
> Wherever this document says "Supabase", `auth.uid()` or `auth.users`, read it as the above. Hosting (section 11, question 1) is correspondingly open: the app needs a Node host plus a PostgreSQL 16 server. The current conventions are in the repository's `CLAUDE.md`.

---

## 7. Seed data

- Load `data/indicators.json` and `data/obstacles_actions.json` into the reference tables with a migration/seed script.
- **Demo account** (`engineer@wtp.iq`): three plants (Al-Rafidain, Dijla, Al-Karkh in Baghdad on the Tigris) and monthly assessments Mar–Aug 2026, using the series embedded in the prototype (`seedDemo()` in `reference/prototype-v4.html`, search for `SERIES`). Profiles: Al-Rafidain stable; Dijla with water-quality, complaint and response-time warnings; Al-Karkh with worsening continuity, reaching critical in September. Include one open manual problem on Dijla (RT-03, Aug 2026) with obstacle "low staffing levels" marked possible. Update SC-02 history values to percentages (for example 0.4–4.5%).
- **Known gap in the source:** in the RII file the HR axis lists obstacle 5 twice with identical figures and has no table for obstacle 6 (O-39). O-39 therefore has `linked_actions: null`. **Ask the researcher for the missing table before seeding.**
- Default limits in `indicators.json` were proposed during prototyping, not taken from the thesis. Confirm with the researcher.

---

## 8. Design system (carry over from the prototype)

- **Principles:** Apple HIG-inspired: clear hierarchy, quiet surfaces, one accent, generous spacing, state shown with icon + text + colour, never colour alone. WCAG AA contrast. Keyboard focus visible. Reduced motion respected.
- **Font:** IBM Plex Sans Arabic (UI), IBM Plex Mono (codes/numbers in tables). Tabular numerals.
- **Colour tokens (light):** bg `#F2F5F7`, surface `#FFFFFF`, text `#14212A`, secondary text `#4E5C66`, line `#E0E6EA`, accent (water blue) `#1B6CA8`, teal `#1A7F7A`, ok `#2B7A4B`, warning `#A35607`, critical `#B8322B`, insufficient-data grey `#5F6B75`, no-limits indigo `#4558AC`. Dark-theme values are in the prototype's `:root` blocks.
- **Signature element:** the threshold scale (value marker over target/warning/critical bands) wherever an indicator value appears.
- **Layout:** sidebar on the start side (desktop), sticky translucent top bar (plant, period, language, user), bottom tab bar under 1024 px; tables stack into cards on phones; dialogs become bottom sheets on phones.
- Reuse the prototype's copy, empty states and microcopy, except where §2 removes text.

---

## 9. Delivery plan

| Phase | Scope | Done when |
| --- | --- | --- |
| **0. Foundation** | Repo, Next.js + TS + Tailwind + shadcn, next-intl (ar/en, RTL/LTR), Supabase project, schema migrations, RLS policies, seed of reference data, CI (lint, typecheck, tests) | App boots in both languages; reference data queryable; RLS test proves user A cannot read user B |
| **1. Auth & shell** | Sign up / in / out / reset, profile (name, job title), login screen per §3.2, app shell (sidebar, top bar, tab bar), design tokens | A new user signs up and lands on an empty dashboard with "add your first plant" |
| **2. Plants & indicators** | Plants CRUD, adoption per plant, indicators page with group filter, user-defined indicators and groups, limits editor with scale preview | Notes 4–10 visibly satisfied |
| **3. Assessments** | 4-step wizard, drafts, server-side recompute and evaluation, limits snapshot, auto problems, results page, indicator drawer, audit trail | Al-Karkh Sept 2026 assessment yields SC-03 and SC-04 critical and opens two problems |
| **4. Problems, obstacles, actions** | Problem page per §3.6 (axes, numbering, confirmed/possible, custom obstacle, ranked actions, show-all, custom action, lifecycle, obstacle-only), problems list, actions log | Notes 11–14 satisfied; choosing an action clears the alert |
| **5. Dashboard & reports** | Dashboard per §3.7, report per §3.8 and note 15, PDF export | PDF renders correct Arabic and English |
| **6. Hardening & launch** | Demo account seed and reset script, accessibility pass, responsive QA (390 px, 768 px, 1440 px), Playwright journey tests in both languages, deploy | The 13-step journey below passes end to end |

**Acceptance journey (both languages):** sign in → dashboard → choose a plant → new monthly assessment → enter readings → validation and calculation → results and alerts → open a problem → select obstacles → mark confirmed/possible → review ranked actions (and "show all") → choose an action → report and PDF.

---

## 10. Out of scope (for now)
- Admin console across users, multi-tenant organisations, shared plants.
- Importing readings from SCADA/sensors or spreadsheets.
- Email/SMS notifications.

---

## 11. Open questions for the owner
1. Hosting and domain: Vercel or Cloudflare? Who owns the Supabase project?
2. Obstacle numbering (note 12): restart at 1 inside each axis, or 1–40 across all axes?
3. The missing HR obstacle-6 (O-39) table in the RII file.
4. Official calculation methods and limits for the 15 indicators, if the thesis defines them.
5. Should "needs further study" stay (it was in the original brief, not mentioned in recent notes)?
6. Report signature block: keep "Prepared by / Approval" lines in the work report?

---

## 12. Prompts

### 12.1 Prompt for Claude Fable 5

```
You are a senior product engineer and technical lead. I am attaching a handoff package for a bilingual (Arabic RTL / English) web app: "نظام مراقبة جودة الخدمة في محطات معالجة المياه — Service Quality Monitoring System for Water Treatment Plants".

The package contains HANDOFF.md (context, client notes, requirements, data model, stack, plan), data/indicators.json, data/obstacles_actions.json, reference/prototype-v4.html (the approved interactive prototype — open it and treat it as the visual and behavioural reference), and the original thesis source files.

Your tasks:
1. Read everything, including the prototype. List any contradictions, gaps or risks you find, and resolve each one with a clear decision (or mark it as a question for me if it truly needs my input). Section 2 (client notes) always overrides the prototype.
2. Confirm or adjust the stack in section 6 and explain any change in one line each.
3. Produce these files, ready to commit:
   - CLAUDE.md — repository instructions for Claude Code: project summary, stack, commands, folder structure, coding conventions (TypeScript strict, server actions, Zod, RLS-first data access, next-intl message keys, RTL rules), definition of done, and "never" rules (never trust client-computed values, never bypass RLS, never show RII in the UI).
   - docs/SPEC.md — the final functional spec, screen by screen, including every string that the client notes change.
   - docs/DATA_MODEL.sql — the full Postgres schema with RLS policies and indexes, plus seed loading from the two JSON files.
   - docs/PLAN.md — phases with tasks, acceptance criteria and test cases.
   - docs/PROMPTS.md — one copy-paste prompt per phase for Claude Code, each self-contained, telling Claude Code what to build, which files to read first, and how to verify (tests and a manual check).
4. Keep the three-stage method (measurement → obstacles → corrective actions) visibly separate, keep "chosen" and "implemented" distinct, and keep per-user data isolation enforced in the database.

Write the specs in English; keep all Arabic UI text exactly as given.
```

### 12.2 Kickoff prompt for Claude Code (if not using Fable first)

```
Read HANDOFF.md fully, then open reference/prototype-v4.html in a browser (demo login engineer@wtp.iq / demo1234) and click through the whole journey. Section 2 of HANDOFF.md (client notes) overrides the prototype.

Start Phase 0 from section 9:
- Scaffold Next.js (App Router, TypeScript strict) with Tailwind, shadcn/ui, Lucide, next-intl (ar default RTL, en LTR).
- Create the Supabase schema from section 5 as SQL migrations, with row-level security on every user-owned table (owner_id = auth.uid()).
- Write a seed script that loads data/indicators.json and data/obstacles_actions.json into the reference tables.
- Add Vitest with unit tests for the evaluation rules in section 4, and a Playwright test proving one user cannot read another user's plants.
- Write CLAUDE.md capturing the stack, commands and conventions you chose.

Stop after Phase 0, show me what you built and the test results, and list any decisions you need from me before Phase 1.
```
