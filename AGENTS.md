# AGENTS

## Code Style
- Use 2 spaces for indentation.
- Prefer ES module syntax.

## Workflow
- Lint any changed JavaScript or JSX files with `npx eslint <files>`.
- Run `npm run build` to ensure the project builds.
- No test script is configured; note this in your testing summary.
- Run `npm run check:schema` before adding new persistence logic; if it reports missing columns, add a checklist note to the PR instead of coding around the gap.
- Add any important information learned into this AGENTS.md file.
- Use ProjectDoc/Eng.md to understand the overall project.
- OAuth redirects must always include `options.redirectTo` when calling `supabase.auth.signInWithOAuth`. Resolve it from the full `window.location` URL (`origin + pathname + search + hash`) and fall back to `VITE_PUBLIC_APP_URL`, `VITE_APP_BASE_URL`, or `VITE_SITE_URL` when a browser location is unavailable.
- Password reset flows must call `supabase.auth.resetPasswordForEmail` with a redirect that lands on `/#/update-password`, and the update form must rely on `AuthContext.updatePassword` so Supabase finalizes the session before returning users to the dashboard.
- Login form submissions must set inline error state whenever Supabase rejects credentials so the page renders the design system's red alert with the failure message.

### Collapsible Table Rows Pattern
- When a table needs drill-down details, manage expansion manually with `useState` keyed by row id.
- Render the summary information in the base `<TableRow>` and immediately follow it with a conditional second `<TableRow>` that holds the drawer content inside a single spanning `<TableCell>` (e.g., `colSpan={totalColumns}`).
- Place the toggle affordance (e.g., a chevron button) inside the summary row; avoid wrapping table semantics in `<Collapsible>` primitives so the DOM remains a valid `<table>` composed of sibling `<tr>` elements.

## Documentation
- When editing files in `ProjectDoc/`, keep `Eng.md` and `Heb.md` in sync and update their version and last-updated fields.

## Notes
- WorkSessions inserts should omit `id` so the database can generate it; include `id` only when updating existing records.
- `/api/work-sessions` now returns full inserted rows (not just IDs) so leave flows can capture the generated `id` for `LeaveBalances.work_session_id`.
- Payroll calculations now rely solely on `WorkSessions.rate_used` and `total_payment`; avoid adding external salary adjustments in reports.
- Global employees use `working_days` for daily rate proration and `paid_leave` rows for paid days off.
- `paid_leave` days are saved without `hours` and the table editor opens them with no hour segments.
- Reports date filters accept `DD/MM/YYYY`, `D/M/YY`, or ISO strings and hours KPIs count only hourly employees.
- WorkSessions deletions verify at least one row was removed; a zero-row delete should surface an error.
- When inserting WorkSessions, avoid duplicates by comparing `employee_id`, `date`, `entry_type`, and `hours`; allow updates to the same row by matching `id`.
- Leave policy settings live in the `Settings` table under the `leave_policy` key; read and write the JSON via the `settings_value` column and reuse the helpers in `src/lib/leave.js` for normalization and calculations.
- `LeaveBalances` is the canonical ledger for allocations (positive `balance`) and usage (negative values, including `-0.5` for half-day when enabled). Always persist the `effective_date` (YYYY-MM-DD) and the descriptive `leave_type`, let Supabase generate timestamps, and surface the toast "חריגה ממכסה ימי החופשה המותרים" when blocking a deduction beyond the configured floor.
- Half-day leave is persisted with `WorkSessions.entry_type = 'leave_half_day'`; metadata no longer carries a `leave.half_day` flag.
- System-paid leave is selected via the "על חשבון המערכת" switch in Time Entry; dropdowns now present only the paid, unpaid, and half-day labels.
- Shared selectors `selectHolidayForDate` and `selectLeaveRemaining` must be the single source of truth for date disabling, payroll totals, and UI badges so reports, employees, and settings stay in sync.
- The Employees → Vacations & Holidays tab is read-only; use the Time Entry flow for any leave creation or adjustments and rely on the collapsible history rows for review.
- Reports CSV export (`Reports.jsx`) now uses `buildCsvRows` with the column order defined in `CSV_HEADERS`; update that helper when adding or reordering export columns.
- `/api/invitations` is the control-plane API for organization invites. It uses `APP_CONTROL_DB_URL` and `APP_CONTROL_DB_SERVICE_ROLE_KEY` for the Supabase admin client, enforces admin/owner membership before writes, auto-expires pending rows once `expires_at` passes, and updates statuses to `accepted`, `declined`, `revoked`, `expired`, or `failed`.
- `/api/settings` surfaces HTTP 424 (`settings_schema_incomplete` / `settings_schema_unverified`) when `tuttiud.setup_assistant_diagnostics()` reports missing tenant tables or policies, and the response includes the failing diagnostic rows so admins rerun the setup script instead of retrying blindly.
- Invitation completion emails land on `/#/complete-registration` with `token_hash` (Supabase invite) and `invitation_token` (control-plane token). The page must call `supabase.auth.verifyOtp({ type: 'invite', token_hash })`, ask for a password, then redirect to `/#/accept-invite` while forwarding the original `invitation_token`.
- The `/components/pages/AcceptInvitePage.jsx` route handles token lookups, renders login/registration CTAs when no session exists, blocks mismatched accounts until they sign out, and wires accept/decline buttons to the secure `/api/invitations/:id/(accept|decline)` endpoints before sending accepted users to the Dashboard.
- TutTiud rebranding placeholder assets live in `public/icon.svg`, `public/icon.ico`, and `public/vite.svg` until final design delivery.
- `tuttiud.setup_assistant_diagnostics()` now validates schema, RLS, policies, and indexes. Keep `SETUP_SQL_SCRIPT` (v2.3) as the source of truth when extending onboarding checks.
- Shared BFF utilities for tenant access (`api/_shared/org-bff.js`) centralize org membership, encryption, and tenant client creation. Reuse them when building new `/api/*` handlers.
- Admin UI is migrating to feature slices. Place admin-only components under `src/features/admin/components/` and mount full pages from `src/features/admin/pages/`. Reusable primitives still belong in `src/components/ui`.
- The refreshed design system lives in `tailwind.config.js` (Nunito typography, primary/neutral/status palettes, spacing tokens) with base primitives in `src/components/ui/{Button,Card,Input,PageLayout}.jsx`. Prefer these when creating new mobile-first UI.
- `src/components/layout/AppShell.jsx` is the new navigation shell. It renders the mobile bottom tabs + FAB and a desktop sidebar, so wrap future routes with it instead of the legacy `Layout.jsx`.

## Future Implementation: Organization Switching
- The legacy AppShell sub-header (removed in the cleanup that consolidated the global header) previously hosted the organization-switching dropdown. When it rendered, it embedded the logic now housed in `src/org/OrgSwitcher.jsx` (see the git history for the pre-removal `AppShell.jsx` block) to list orgs, handle focus, and persist selection. When reintroducing org switching into the refreshed header, reuse that approach instead of recreating it from scratch.
