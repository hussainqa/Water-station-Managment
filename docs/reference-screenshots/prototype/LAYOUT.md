# Prototype v4 layout reference (login + app shell)

Source: `docs/handoff/reference/prototype-v4.html` (line numbers below refer to it). Screenshots: this folder, regenerated with `npx tsx scripts/prototype-screenshots.ts`.
Items marked **[inferred]** were read off the screenshots, not the source.

## 0. Global tokens
- Font: `--font` = "IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif (weights 400/500/600/700, Google Fonts). Mono: "IBM Plex Mono" 400/500. Body 15px / line-height 1.6.
- Radii: `--r-xl` 20, `--r-lg` 16, `--r-md` 12, `--r-sm` 8. Inputs and buttons 11px, large button 13px, auth card 24px.
- Light colours: `--bg #F2F5F7`, `--surface #FFF`, `--surface-2 #F7F9FA`, `--fg #14212A`, `--fg-2 #4E5C66`, `--fg-3 #68757F`, `--line #E0E6EA`, `--line-2 #CFD8DE`, `--accent #1B6CA8`, `--accent-soft #E5EFF7`, `--accent-ink #155585`, `--teal #1A7F7A`, `--crit #B8322B`, `--glass rgba(242,245,247,.78)`.
- Shadow `--shadow: 0 1px 2px rgba(16,34,46,.05), 0 6px 20px rgba(16,34,46,.05)`.
- Dark theme: the same variables are redefined (e.g. `--bg #0D1317`, `--surface #161F25`, `--accent #5EAAE4`, `--accent-fg #06131C`). Mechanism: `@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){...} }` plus an explicit `:root[data-theme="dark"]` block (lines 23-45). No in-app theme toggle exists. The theme follows the OS, and `data-theme` can force it.
- Direction: `<html dir>` and `lang` are set by `applyDir()` (`rtl` for `ar`, the default; `ltr` for `en`). Layout uses logical properties (`inset-inline-start`, `margin-inline-start`, `padding-inline-*`). The shell grid is not mirrored by hand; it flips because the document direction flips.
- Numbers use `.n` (`direction:ltr; unicode-bidi:isolate; tabular-nums`). The body has `padding-inline: max(16px, env(safe-area-inset-*))`.
- Icons: inline SVG, 24 viewBox, stroke 1.8, no fill, round caps (Lucide-style; paths copied from Lucide). `.ic` is 18px, `.sm` 15px, `.lg` 22px.

## 1. Login / sign-up (`pageAuth`, line 1215; CSS 540-562, 443)
**Structure:** a single centred card on the `--bg` page. It is not split. (`.login`, `.login-art` and `.flow` CSS exist but are unused by `pageAuth`; ignore them.)
- `.auth`: `min-height:100vh`, flex column, centred both ways, `padding-block:28px`, `gap:14px`.
- `.auth-top` (width `min(540px,100%)`, flex end): the language switch. It sits at the inline-end of the column, so top-left in Arabic/RTL and top-right in English/LTR, above the card.
- `.auth-card`: `width:min(540px,100%)`, surface, 1px `--line` border, radius 24, `--shadow`, `padding:clamp(20px,4.5vw,36px)`, flex column, `gap:22px`.

**Order top to bottom inside the card:**
1. `.inst` header row: grid `60px 1fr 60px`, gap 12, centred text, `padding-bottom:18px`, bottom border `--line`.
   - Slot 1 (inline-start, so right in RTL): ministry logo (`LOGOS.ministry`, base64 webp). Slot 3: university logo (`LOGOS.university`).
   - Both are `.emb`: 60x60, circle, 1px `--line` border, `object-fit:contain`, white background with 3px padding when an image is present. Fallback icons are `landmark` and `grad`.
   - Centre: `<b>` ministry name (14px/600, line-height 1.5), then `<small>` "university · college" (12.5px, `--fg-2`).
2. `.sys` block, centred, gap 8:
   - System logo: 48x48, radius 15, `--accent` background, white drop glyph (24 viewBox, 26px, stroke 1.9).
   - `<h1>`: `clamp(20px,3.4vw,24px)`/700, `max-width:24ch`.
   - `<p>` description: 14px, `--fg-2`, `max-width:46ch` (REMOVE, see 1.3).
3. Form (sign-in) or sign-up form (below).
4. `.auth-switch` link line (14px, `--fg-2`, centred); the link is `.linkbtn` (`--accent`, 600).
5. Sign-in mode only: `.demo-cred` box (1px dashed `--line-2`, radius 12, padding 10x12, 13px) with the "Demo account" text and a ghost button. See section 6; the client wants this removed too.
6. `.credits`: top border, `padding-top:16px`, 2-column grid with gap 10. Each cell has `--surface-2` background, radius 12, padding 10x12. The label is `small` 12px `--fg-3`; the value is `b` 13.5px/600.
7. Bottom line (centred `p.faint`, 12.5px). See 1.3.

### 1.1 Strings
| Element | العربية | English |
|---|---|---|
| Ministry | وزارة التعليم العالي والبحث العلمي | Ministry of Higher Education and Scientific Research |
| Univ · college | جامعة بغداد · كلية الهندسة | University of Baghdad · College of Engineering |
| Title (h1) | نظام مراقبة جودة الخدمة في محطات معالجة المياه | Service Quality Monitoring System for Water Treatment Plants |
| Lang switch | عربي / EN (always these two labels) | same |
| Email label | البريد الإلكتروني | Email |
| Email placeholder | name@example.iq | name@example.iq |
| Password label | كلمة المرور | Password |
| Show/hide password (aria) | إظهار / إخفاء كلمة المرور | Show / Hide password |
| Sign-in button | تسجيل الدخول | Sign in |
| To sign-up | ليس لديك حساب؟ **إنشاء حساب** | No account yet? **Create an account** |
| Researcher box | إعداد الباحث / الحسين عبد الخالق عبد العزيز | Researcher / Alhussien Abdalkhaliq Abdulaziz |
| Supervisor box | إشراف / أ.د. عباس محمد برهان | Supervisor / Prof. Abbas Mohammed Burhan |

Sign-in fields: `#lg-email` (envelope icon, `type=email`, `.input.ltr`) and `#lg-pass` (lock icon at the start, eye toggle at the end). Each input is `.input`: min-height 44, radius 11, border `--line-2`, 15px text, `padding-inline-start:40px` for the icon. Focus: border `--accent` plus a 3px ring of 22% accent. Field label: 13px/500, gap 6. The sign-in form has `gap:16px`. The primary button is `.btn.primary.lg` (min-height 48, 15.5px/500, radius 13, full width because the `.stack` is a flex column).
Error callout (sign-in): `.callout.crit` with an octagon icon. Strings: `أدخل البريد الإلكتروني وكلمة المرور للمتابعة.` / `Enter your email and password to continue.`, and `البريد الإلكتروني أو كلمة المرور غير صحيحة. تحقّق منهما وحاول مجدداً.` / `The email or password is incorrect. Check them and try again.`

Sign-up mode (same card and header, form replaced; `gap:14px`):
- H2 (17px): إنشاء حساب جديد / Create a new account. Sub (13.5px `.muted`): لكل حساب محطاته الخاصة، ولا يصل إليها المستخدمون الآخرون. / Each account has its own plants; other users cannot access them.
- Row 1 (`.fgrid`, 2 columns): الاسم الكامل / Full name; المنصب (الوظيفة) / Job title.
- Email: البريد الإلكتروني / Email.
- Row 2 (2 columns): كلمة المرور / Password; تأكيد كلمة المرور / Confirm password.
- Required marker: red `*` (`.req`).
- Hint: `8 أحرف على الأقل. يُحفظ الحساب في هذا المتصفح فقط ضمن النموذج التجريبي.` / `At least 8 characters. In this prototype the account is stored in this browser only.` (12.5px `--fg-3`; the second sentence is a demo-ism, see section 6.)
- Button (with `userplus` icon): إنشاء الحساب / Create account. Switch line: لديك حساب؟ **تسجيل الدخول** / Already have an account? **Sign in**.
- Validation messages: lines 1203-1211.
- Credits, bottom line and institution header remain in sign-up mode. Fields have no icons in sign-up.

### 1.2 At 390 px (@media max-width:760px, line 589)
- `.credits` becomes 1 column (the researcher and supervisor boxes stack).
- `.inst` grid becomes `48px 1fr 48px` and `.emb` becomes 48x48.
- `.fgrid` becomes 1 column (sign-up fields stack).
- The card padding clamps to about 20px. The card is full width minus the 16px body padding.
- The language switch stays above the card, at the inline-end.
- The brief ministry and university text wraps to 3-4 lines **[inferred from screenshot]**.

### 1.3 Lines the client asked to remove (both are in `pageAuth`)
1. **Description under the system title**: `<p>` inside `.sys` (`<p>${L(INFO.desc)}</p>`, line ~1221, data at line 725).
   - AR: `منصة علمية لمراقبة جودة الخدمة وتقييم الأداء التشغيلي لمحطات معالجة المياه ودعم اتخاذ القرار.`
   - EN: `A scientific platform for monitoring service quality and evaluating the operational performance of water treatment plants, supporting engineering decisions.`
   - Position: directly below the h1, inside the centred system block, between the title and the first form field.
2. **Bottom line** of the card: `<p class="faint" style="text-align:center;font-size:12.5px">${INFO.thesis} · ${INFO.college} · ${INFO.univ}</p>`. It is the last child of `.auth-card`, below the researcher/supervisor boxes.
   - AR: `رسالة ماجستير · كلية الهندسة · جامعة بغداد`
   - EN: `Master’s thesis · College of Engineering · University of Baghdad`

## 2. App shell >= 1024 px (CSS lines 62-100)
- `.shell`: grid `252px minmax(0,1fr)`, `gap:20px`, `padding-block:16px`, `min-height:100vh`. Horizontal padding comes from the body (16px). The sidebar is the first grid child, so it sits on the **start edge: right in Arabic, left in English**.
- `.main`: flex column, `min-width:0`. There is **no max-width** on the content; it fills the grid cell. Pages are `.page` (flex column, `gap:20px`, `padding-bottom:40px`).
- **Sidebar** (`.sidebar`): floating card. `position:sticky; top:16px; height:calc(100vh - 32px)`, surface background, 1px `--line` border, radius 20, `--shadow`, `padding:18px 12px 12px`, `overflow:auto`.
  - Brand block (`.brand`, `padding:2px 8px 16px`, gap 10): logo tile 38x38, radius 11, `--accent` background, white drop glyph 22px, then the name (14.5px/700) with a `<small>` sub line (12px `--fg-2`).
    - Name: نظام مراقبة جودة الخدمة / Service Quality Monitoring. Sub: محطات معالجة المياه / Water Treatment Plants.
  - Groups (`.nav-group`, `padding:10px 0 4px`). Group heading `.nav-label`: 12px/500 `--fg-3`, padding `0 10px 4px`.
  - Nav item (`.nav-item`): flex, gap 10, `padding:8px 10px`, radius 10, 14.5px, min-height 38, icon colour `--fg-2`, hover background `--bg`.
  - Active item: `background:--accent-soft; color:--accent-ink; font-weight:600`, icon `--accent`, `aria-current="page"`.
  - Badge (`.badge`): `margin-inline-start:auto`, `--crit` background, white 11.5px/600, pill, min-width 20, height 20. It appears only on "Problems & obstacles" and shows the count of open problems (1 in demo data).
  - Footer (`.side-foot`, `margin-top:auto`, `padding-top:12px`): the same `.nav-item` style, with no dividers.
    - "Reset demo data" is shown only for the demo account. Icon `refresh`.
    - "Sign out" is always shown. Icon `logout`.

| # | Group (ar / en) | Item ar / en | Prototype icon, Lucide equivalent |
|---|---|---|---|
| 1 | المراقبة / Monitoring | لوحة التحكم / Dashboard | `dash` = LayoutDashboard (4 rects) |
| 2 | | محطات المياه / Water plants | `factory` = Factory |
| 3 | | مؤشرات الأداء / Performance indicators | `gauge` = Gauge |
| 4 | التقييم / Assessment | تقييم جديد / New assessment | `fileplus` = FilePlus |
| 5 | | نتائج التقييمات / Assessment results | `activity` = Activity |
| 6 | | المشكلات والعوائق / Problems & obstacles | `listchecks` = ListChecks (badge) |
| 7 | | الإجراءات التصحيحية / Corrective actions | `wrench` = Wrench |
| 8 | التقارير / Reports | التقارير والتحليل التاريخي / Reports & history | `file` = FileText |
| foot | | إعادة تعيين بيانات العرض / Reset demo data | `refresh` = RefreshCw |
| foot | | تسجيل الخروج / Sign out | `logout` = LogOut |

- **Top bar** (`.topbar`): `position:sticky; top:0; z-index:30`, flex, gap 10, `flex-wrap:wrap`, `padding:10px 4px`, `margin-bottom:6px`. Translucent: `background:var(--glass)` (rgba(242,245,247,.78)) with `backdrop-filter:saturate(1.6) blur(18px)`. No border or shadow. Height is about 52px (40px controls plus padding). Controls, in DOM order (the first sits at the start edge):
  1. `.menu-btn`: hamburger, `display:none` on desktop.
  2. Plant selector (`.ctx`): a white pill with a 1px `--line` border, radius 12, min-height 40, containing the `factory` icon, a label (12.5px `--fg-3`) and a native `<select>` (14px/500, max-width 220). Label: المحطة / Plant. Options: جميع المحطات / All plants, then each plant's short name. With no plants the select is disabled and shows لا توجد محطات / No plants yet.
  3. Period selector (`.ctx`, `cal` icon). Label: فترة المتابعة / Monitoring period. Options (`rangeLabel`):

     | Value | ar | en |
     |---|---|---|
     | 1 | آخر شهر | Last month |
     | 3 | آخر 3 أشهر | Last 3 months |
     | 6 | آخر 6 أشهر | Last 6 months |
     | 9 | آخر 9 أشهر | Last 9 months |
     | 12 | آخر سنة | Last 12 months |
     | all | كامل السجل | Full history |

     The default shown in the screenshots is "Last 6 months".
  4. `.grow` spacer (flex 1).
  5. Language switch (`.lang`): inline-flex, `--bg-2` background, radius 10, padding 3, gap 2. Buttons are 13px/600, min-height 30, padding 4x10, radius 8. The active one has a `--surface` background and a light shadow. Order in DOM: عربي then EN.
  6. User chip (`.user`): white pill, border, radius 12, min-height 40. Text block `.who` (13.5px name, then a `small` 11.5px `--fg-3` job title), then a 30px circular avatar (`--teal-soft` background, `--teal` text, 13px/600, initials, e.g. "SJ" / "س ج"). The chip is **not clickable**: no menu opens. The sign-out and reset controls live only in the sidebar footer.
- Demo account values: م. سارة الجبوري / Eng. Sara Al-Jubouri; مهندسة تقييم الأداء / Performance assessment engineer.
- Directly under the top bar is the `.demo-strip` (see section 6), which is not part of the top bar but is rendered by `topbar()`.
- At 1024-1180 px the sidebar stays and the dashboard stats become 3 columns (`@media max-width:1180px`).

## 3. Shell under 1024 px (`@media (max-width:1023px)`, lines 475-491)
- Shell grid becomes 1 column with `padding-bottom:calc(84px + env(safe-area-inset-bottom))`.
- Sidebar: `display:none`. The hamburger button (`.menu-btn`, top bar start) sets `S.navOpen`; the sidebar then becomes a fixed drawer at `inset-inline-start:10px`, top/bottom 10px, width `min(290px, 100vw-20px)`, `z-index:85`, `--shadow-lg`. A scrim of `rgba(10,20,28,.35)` sits behind it (`z-index:84`). The drawer contains the full nav including the footer sign-out and reset controls (see `usermenu-*-390.png`).
- **Bottom tab bar** (`.tabbar`): fixed to the bottom, full width, `z-index:40`. Padding is `6px max(10px, safe-area-right) calc(6px + env(safe-area-inset-bottom)) max(10px, safe-area-left)`. It has the glass background with `blur(20px)`, a top border 1px `--line`, and `justify-content:space-around`. Each button is flex 1, a column, gap 2, 11px/500, `--fg-3`, min-height 48, with a 22px icon. The active button is `--accent` (no pill; `aria-current`). The "Problems" tab shows an 8px `--crit` dot (`.dot`) instead of a number, at `inset-inline-end:calc(50% - 18px)`. Bar height is about 60px plus the safe-area inset. The five tabs:

| # | ar | en | Icon |
|---|---|---|---|
| 1 | الرئيسية | Home | `dash` |
| 2 | المحطات | Plants | `factory` |
| 3 | التقييمات | Results | `activity` |
| 4 | المشكلات | Problems | `listchecks` |
| 5 | التقارير | Reports | `file` |

  Tab 1 is on the start edge: right in RTL, left in LTR. Items such as KPIs, New assessment and Corrective actions are reachable only through the drawer.
- Top bar keeps: hamburger, plant select, period select, language switch, user chip. At 1023px and below `.user .who` (the name text) is hidden. At <=760px the chip and the `.ctx` labels are hidden entirely, and the selects shrink to `max-width:130px`. At 390 px the bar wraps into two rows: hamburger and the two selects on row one, the language switch alone on row two **[inferred from screenshot]**. It stays sticky.
- At <=420px: `.stat` padding 12, `.val` 24px, `.ph .acts` full width.

## 4. Dashboard (`pageDashboard`, line 1263)
- Header (`.ph`): eyebrow (12.5px `--fg-3`): `N محطات · <period>` / `N plants · <period>`, then h1 (`.h1`, 28px/700; 23px at <=760px) لوحة التحكم / Dashboard. The primary button (end side, `plus` icon) is تقييم جديد / New assessment. There is no subtitle line.
- `.stats`: 5-column grid, gap 14. It is 3 columns <=1180px and 2 columns <=760px. Stat tile: surface, border, radius 16, padding 16, `--shadow`. Layout: a 28px icon square (radius 9, soft tinted background), the label (13px/500 `--fg-2`), a value (30px/600) with an optional small suffix, and a foot line (12.5px `--fg-3`).

| Tile ar / en | Foot (sample) |
|---|---|
| المحطات المسجلة / Registered plants | منها لديها تقييمات معتمدة / with approved assessments |
| التقييمات المنجزة / Assessments completed | ضمن فترة المتابعة / Within the monitoring period |
| ضمن الحدود المقبولة / Within acceptable limits (value `34 / 44`) | من المؤشرات المقيّمة في آخر تقييم / Of indicators evaluated in the latest assessment |
| تحتاج متابعة / Need follow-up | دون تجاوز حرج / No critical deviation |
| مشكلات تتطلب تقييماً / Problems to review | بانتظار تحديد العوائق أو الإجراء / Awaiting obstacles or an action |

- Below the tiles is a 12-column grid (gap 16): "Indicator status breakdown" (توزيع حالات المؤشرات, span 5), "Alerts" (قائمة التنبيهات, span 7), "Latest assessments" (آخر التقييمات, span 12). At <=1180px every card spans 12.
- Card: `.card` padding 18, radius 16, h2 16.5px/600, desc 13px `--fg-2`.
- **Empty state** (account with no plants, e.g. a fresh sign-up; `seedEmpty(name)` at line 919 gives `stations:[]`): the dashboard shows only the header (title, no button, no eyebrow) and one `.card` with `emptyState('factory', ...)`. `.empty` is a centred column, padding 34x16; the icon tile is 52x52, radius 16, `--bg`; h3 is 16px; p is 14px, max-width 52ch.
  - Title: AR `ابدأ بإضافة محطتك الأولى` / EN `Start by adding your first plant`.
  - Text: AR `المحطات التي تضيفها خاصة بحسابك. بعد إضافة المحطة يمكنك إنشاء أول تقييم لها.` / EN `Plants you add are private to your account. After adding a plant you can create its first assessment.`
  - Call to action: primary button with a `plus` icon, AR `إضافة محطة` / EN `Add a plant` (opens the `addStation` sheet).
  - The top-bar plant select then shows "No plants yet" / لا توجد محطات (disabled). The sidebar and tabs are unchanged.
  - On sign-up a toast is also shown: `أهلاً <name> — أُنشئ حسابك. ابدأ بإضافة محطتك الأولى.` / `Welcome, <name> — your account is ready. Start by adding your first plant.`
  - Not captured as a screenshot (not requested).
- In the full-page `dashboard-*-390.png` the fixed tab bar appears mid-image. This is a Playwright full-page capture artifact; use `shell-*-390.png` for the true appearance.

## 5. Breakpoints (all `max-width`, desktop-first)
`1180px` (stats 3 columns, cards stack), `1023px` (sidebar becomes a drawer, tab bar appears, hamburger shows, user name hidden, `.login` unused), `760px` (stats 2 columns, forms 1 column, credits stack, `.inst` 48px, `.h1` 23px, topbar labels and user chip hidden, tables become stacked cards, sheets become bottom sheets), `420px` (tighter stat tiles, full-width actions). Others: `print`, `prefers-reduced-motion`. The desktop shell is therefore >=1024px (Tailwind `lg` is 1024, so use `max-lg` / `lg:` for the shell); the form breakpoint is 761/760 (custom, near `md`=768).

## 6. "Demo" / "illustrative" items the client wants removed
1. **Top-bar demo strip** (`.demo-strip`, line 1182; on every shell page, under the top bar; background `--nl-soft`, 12.5px, flask icon).
   - AR: **بيانات تجريبية** — قراءات المحطات والمحددات المعروضة لأغراض العرض والاختبار. المؤشرات والعوائق والإجراءات التصحيحية وقيم RII والارتباط مأخوذة من جداول البحث.
   - EN: **Demo data** — plant readings and limits are for demonstration and testing. Indicators, obstacles, corrective actions, RII and correlation values come from the thesis tables.
2. **Login "Demo account" box** (`.demo-cred`, sign-in mode only): AR `حساب العرض: engineer@wtp.iq / demo1234` with the button `تعبئة حساب العرض`; EN `Demo account: engineer@wtp.iq / demo1234` with the button `Fill demo account`. It sits between the "Create an account" line and the researcher box.
3. **Sidebar footer** "Reset demo data" / إعادة تعيين بيانات العرض (demo account only), and its confirm sheet: `إعادة تعيين بيانات العرض؟` / `Reset the demo data?` and its body text (line 1961).
4. **Sign-up hint** second sentence: `يُحفظ الحساب في هذا المتصفح فقط ضمن النموذج التجريبي.` / `In this prototype the account is stored in this browser only.`
5. **Illustrative tag** `demoTag()` (line 1042): AR `مثال توضيحي` / EN `Illustrative example` (blue tag with a flask icon). It appears on KPI cards and in the drawer header for indicators flagged `k.demo`. The table cell shows `· مثال` / `· example` (line 1545).
6. **Report watermark** (line 1786): `تقرير مُولَّد من بيانات تجريبية لأغراض العرض — لا يمثل نتائج ميدانية.` / `Report generated from demo data for presentation — not field results.`
7. **Limits callout** (line 1893, edit-limits sheet): `الحدود في هذا النموذج تجريبية وليست قيماً علمية معتمدة. ...` / `Limits in this prototype are illustrative, not approved scientific values. ...`
8. **Default limits note** in the data (lines 914 and 920): `المحددات الافتراضية التجريبية` / `Default illustrative limits`, `الإصدار الأول للمحددات التجريبية` / `First version of the illustrative limits`. These are data strings and appear in the limits-version history.
- The seeded sample data (3 plants Al-Rafidain, Dijla, Al-Karkh; user "Eng. Sara Al-Jubouri") is itself demo content.

## 7. Screenshot index
All were taken with Chromium, light scheme unless noted. For each of `{ar,en} x {1440,390}`: `login-`, `signup-`, `dashboard-` (full page), `shell-` (viewport) and `usermenu-` (viewport). On desktop `usermenu-*-1440.png` equals the shell because the sidebar footer is always visible. On phone it shows the opened drawer with Reset demo data and Sign out. Dark: `login-ar-1440-dark.png`, `shell-ar-1440-dark.png`. The 390 px shots are 780 px wide (device scale factor 2). Note: Google Fonts need network access; the screenshots show IBM Plex because the fonts loaded.
