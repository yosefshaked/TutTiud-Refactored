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
	- If global lint is run across the entire repo, there are legacy violations unrelated to recent changes; follow the workflow and lint only the files you touched in a PR. Address broader lint cleanup in a dedicated maintenance pass.
	- When preserving a function signature for temporarily disabled exports, mark intentionally unused parameters as used with `void param;` (and/or prefix with `_`) to satisfy `no-unused-vars` without altering the public API.
- Use ProjectDoc/Eng.md to understand the overall project.
- **Refer to [ProjectDoc/Conventions.md](ProjectDoc/Conventions.md)** for folder structure, naming conventions, API patterns, and feature organization. Update it when adding new patterns or changing structure (with approval).
- OAuth redirects must always include `options.redirectTo` when calling `supabase.auth.signInWithOAuth`. Resolve it from the full `window.location` URL (`origin + pathname + search + hash`) and fall back to `VITE_PUBLIC_APP_URL`, `VITE_APP_BASE_URL`, or `VITE_SITE_URL` when a browser location is unavailable.
- Password reset flows must call `supabase.auth.resetPasswordForEmail` with a redirect that lands on `/#/update-password`, and the update form must rely on `AuthContext.updatePassword` so Supabase finalizes the session before returning users to the dashboard.
- Login form submissions must set inline error state whenever Supabase rejects credentials so the page renders the design system's red alert with the failure message.

### Request validation and payload limits (2025-10)
- A shared server-side validation helper lives at `api/_shared/validation.js`.
  - `parseJsonBodyWithLimit(req, limitBytes, { mode, context, endpoint })` safely parses JSON and logs when payloads exceed a soft limit. Default rollout uses `mode: 'observe'` to avoid breaking clients.
  - Centralized validators expose SOT for specific flows (e.g., `validateSessionWrite`, `validateInstructorCreate`, `validateInstructorUpdate`). Prefer using these from API routes instead of inlining validation logic.
- Endpoints updated to use the helper in observe-mode: `api/sessions`, `api/settings`, `api/instructors`.
- History quota scaffold: `api/_shared/history-quota.js` provides `ensureCapacity` in observe-only mode to collect size telemetry for settings histories without enforcing limits yet.
- Future phases will introduce per-key quotas and pruning/archival for history-like settings. Until then, do not hard-reject large settings writes without product sign-off. Document changes in PRs and update this section when enforcement is enabled.

### Backup and restore (2025-01)
- `/api/backup` (POST) creates encrypted local backups with weekly cooldown (7 days). Requires admin/owner role and `permissions.backup_local_enabled = true` in `org_settings`.
- `/api/restore` (POST) decrypts and restores backups. Requires admin/owner role and same permission flag. Supports optional `clear_existing` flag for clean restore.
- Shared backup utilities in `api/_shared/backup-utils.js`:
  - `encryptBackup(data, password)`: AES-256-GCM + gzip compression, returns encrypted Buffer
  - `decryptBackup(encryptedData, password)`: reverses encryption, returns manifest object
  - `exportTenantData(tenantClient, orgId)`: queries all tenant tables (Students, Instructors, SessionRecords, Settings, Services), returns manifest v1.0
  - `validateBackupManifest(manifest)`: checks version/schema compatibility
  - `restoreTenantData(tenantClient, manifest, options)`: transactional restore with optional `clearExisting` flag
- Backup manifests are JSON with structure: `{ version: '1.0', schema_version: 'tuttiud_v1', org_id, created_at, metadata: { total_records }, tables: [{ name, records }] }`
- Password generation: System auto-generates a human-friendly product-key style password (e.g., ABCD-EF12-3456-7890-ABCD, ~80-bit entropy). The user must save it from the response to decrypt later.
- Cooldown enforcement: checks `org_settings.backup_history` array for last successful backup within 7 days; 429 response includes `next_allowed_at` and `days_remaining`. Can be bypassed once by setting `permissions.backup_cooldown_override = true` in control DB; the flag is automatically reset to `false` after a successful backup.
- Audit trail: all backup/restore operations appended to `org_settings.backup_history` JSONB array (last 100 entries kept) with type, status, timestamp, initiated_by, size_bytes/records_restored, error_message.
- Control DB schema: run `scripts/control-db-backup-schema.sql` to add `org_settings.permissions` (jsonb) and `org_settings.backup_history` (jsonb) columns.
- Permissions model: Centralized in `permission_registry` table (control DB). Run `scripts/control-db-permissions-table.sql` to create the registry with default permissions for all features. Use `initialize_org_permissions(org_id)` DB function to auto-populate `org_settings.permissions` from registry defaults when null/empty.
  - Available permissions: `backup_local_enabled`, `backup_cooldown_override`, `backup_oauth_enabled`, `logo_enabled`.
  - Shared utilities: `api/_shared/permissions-utils.js` provides `ensureOrgPermissions()`, `getDefaultPermissions()`, `getPermissionRegistry()`.
  - API endpoint: `GET /api/permissions-registry` returns permission metadata (optionally filtered by category) or defaults-only JSON.
  - New (2025-10): `session_form_preanswers_enabled` (boolean) and `session_form_preanswers_cap` (number, default 50) control the preconfigured answers feature and per-question cap. The registry now stores `default_value` as JSONB to support non-boolean defaults.
- Frontend: Backup card in Settings page shows grayed-out state when `backup_local_enabled = false` with message "גיבוי אינו זמין. נא לפנות לתמיכה על מנת לבחון הפעלת הפונקציה". Uses `initialize_org_permissions` RPC on load to ensure permissions exist.
 - Frontend: Backup card now consumes `GET /api/backup-status` to determine `enabled`, cooldown, and one-time override; the card is disabled with the above message when `enabled=false`, and shows a cooldown banner with an "override available" badge when applicable.
- OAuth backup destinations (Google Drive, OneDrive, Dropbox) planned but not yet implemented; permission flags reserved.
- Admin tool: `test/verify-backup.cjs` allows super admins to verify backup file integrity and decryptability.
  - Usage: `node test/verify-backup.cjs <backup-file-path> <password>`
  - Prints manifest summary if successful, error if invalid or wrong password.
  - Use for compliance, restore validation, and support troubleshooting.

### Custom Logo Feature (2025-10)
- `/api/org-logo` (GET/POST/DELETE) manages organization custom logos. Requires `permissions.logo_enabled = true` in `org_settings`.
  - GET: Returns `logo_url` (URL string or null). Available to all org members.
  - POST: Admin/owner only. Accepts `logo_url` (URL string). Validates URL format.
  - DELETE: Admin/owner only. Removes logo by setting `logo_url` to null.
- Control DB schema: run `scripts/control-db-logo-schema.sql` to add `org_settings.logo_url` (text) column.
- Frontend: `LogoManager.jsx` in Settings page allows setting/removing custom logo URL when `logo_enabled = true`.
  - Disabled state shown with message "לוגו מותאם אישית אינו זמין. נא לפנות לתמיכה" when `logo_enabled = false`.
  - Accepts public image URLs (PNG, JPG, SVG, GIF, etc.).
  - Stores logo URL as plain text in control DB (no file upload, references external images).
- Global display: `OrgLogo.jsx` component fetches and displays custom logo in AppShell header (desktop sidebar + mobile header). Falls back to TutTiud logo (`/icon.svg`) when no logo is set.
- Logo refresh: Component refetches when `activeOrgId` changes, ensuring correct logo displays after org switch.
- Logo sizing: Uses `object-contain` with white background padding to ensure logos fit nicely in all display locations (48px container).

### Collapsible Table Rows Pattern
- When a table needs drill-down details, manage expansion manually with `useState` keyed by row id.
- Render the summary information in the base `<TableRow>` and immediately follow it with a conditional second `<TableRow>` that holds the drawer content inside a single spanning `<TableCell>` (e.g., `colSpan={totalColumns}`).
- Place the toggle affordance (e.g., a chevron button) inside the summary row; avoid wrapping table semantics in `<Collapsible>` primitives so the DOM remains a valid `<table>` composed of sibling `<tr>` elements.

## Documentation
- When editing files in `ProjectDoc/`, keep `Eng.md` and `Heb.md` in sync and update their version and last-updated fields.

## Notes
- Instructors are managed in the tenant `tuttiud."Instructors"` table. Records are not deleted; set `is_active=false` to disable. Clients should hide inactive instructors from selection.
- Student creation requires selecting an active instructor. If a student's assigned instructor is later disabled, surfaces a warning in the roster and prompts reassignment; historical reports remain attributed via `assigned_instructor_id`.
- `/api/instructors` returns only active instructors by default. Use `include_inactive=true` to fetch disabled ones for admin UIs.
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
	- Legacy note (2025-10): The old selectors module at `src/lib/selectors.js` has been deprecated and replaced with no-op stubs to prevent accidental usage during the WorkSessions → SessionRecords migration. Do not import from `src/lib/selectors.js` or `src/selectors.js`. When reintroducing equivalents, implement them under feature slices using `SessionRecords` as the data source and update this note accordingly.
- The Employees → Vacations & Holidays tab is read-only; use the Time Entry flow for any leave creation or adjustments and rely on the collapsible history rows for review.
- Reports CSV export (`Reports.jsx`) now uses `buildCsvRows` with the column order defined in `CSV_HEADERS`; update that helper when adding or reordering export columns.
- `/api/invitations` is the control-plane API for organization invites. It uses `APP_CONTROL_DB_URL` and `APP_CONTROL_DB_SERVICE_ROLE_KEY` for the Supabase admin client, enforces admin/owner membership before writes, auto-expires pending rows once `expires_at` passes, and updates statuses to `accepted`, `declined`, `revoked`, `expired`, or `failed`.
- `/api/settings` surfaces HTTP 424 (`settings_schema_incomplete` / `settings_schema_unverified`) when `tuttiud.setup_assistant_diagnostics()` reports missing tenant tables or policies, and the response includes the failing diagnostic rows so admins rerun the setup script instead of retrying blindly.
- Invitation completion emails land on `/#/complete-registration` with `token_hash` (Supabase invite) and `invitation_token` (control-plane token). The page must call `supabase.auth.verifyOtp({ type: 'invite', token_hash })`, ask for a password, then redirect to `/#/accept-invite` while forwarding the original `invitation_token`.
- The `/components/pages/AcceptInvitePage.jsx` route handles token lookups, renders login/registration CTAs when no session exists, blocks mismatched accounts until they sign out, and wires accept/decline buttons to the secure `/api/invitations/:id/(accept|decline)` endpoints before sending accepted users to the Dashboard.
- TutTiud rebranding placeholder assets live in `public/icon.svg`, `public/icon.ico`, and `public/vite.svg` until final design delivery.
- `tuttiud.setup_assistant_diagnostics()` now validates schema, RLS, policies, and indexes. Keep `SETUP_SQL_SCRIPT` (v2.4) as the source of truth when extending onboarding checks.
- Shared BFF utilities for tenant access (`api/_shared/org-bff.js`) centralize org membership, encryption, and tenant client creation. Reuse them when building new `/api/*` handlers.
- Admin UI is migrating to feature slices. Place admin-only components under `src/features/admin/components/` and mount full pages from `src/features/admin/pages/`. Reusable primitives still belong in `src/components/ui`.
- The refreshed design system lives in `tailwind.config.js` (Nunito typography, primary/neutral/status palettes, spacing tokens) with base primitives in `src/components/ui/{Button,Card,Input,PageLayout}.jsx`. Prefer these when creating new mobile-first UI.
- `src/components/layout/AppShell.jsx` is the new navigation shell. It renders the mobile bottom tabs + FAB and a desktop sidebar, so wrap future routes with it instead of the legacy `Layout.jsx`.

### Onboarding Tour System (2025-10)
- Custom tour implementation lives in `src/features/onboarding/`:
  - `customTour.js`: Singleton tour bus with `openTour()`, `closeTour()`, `nextStep()`, `prevStep()`, `subscribe()`, `getState()`
  - `components/CustomTourRenderer.jsx`: Portal-based overlay with SVG mask for spotlight effect, popover with RTL support, smart placement (top/bottom/left/right based on available space)
  - `components/WelcomeTour.jsx`: Auto-launches tour for new users, marks onboarding completed on close
  - `components/OnboardingCard.jsx`: Manual tour launcher in Settings (does NOT mark as completed)
  - `components/TourSteps.jsx`: Tour step definitions with role-based steps (admin vs member)
  - `styles/tour.css`: Custom tour styling with premium shadows, gradients, responsive breakpoints, RTL support
- Tour features:
  - SVG masking creates spotlight effect (grayed overlay with cutout around target element)
  - Smart positioning algorithm chooses best placement based on available viewport space
  - ESC key, X button, and Done button all close the tour
  - Overlay click closes only on the last step
  - Mobile-optimized with touch-friendly 44px minimum button heights
  - Welcome/no-target steps position center-high (~35% viewport height) on both desktop and mobile
  - Progress bar with gradient fill and smooth transitions
  - Scroll/resize listeners update layout dynamically
  - Centers gracefully when target element not found
- Accessibility: ARIA roles, keyboard navigation (ESC), proper z-index layering, RTL text alignment
- Note: Replaced driver.js dependency with custom implementation for better control and professional UX

- Frontend API clients are being colocated under feature slices:
	- Sessions: `src/features/sessions/api/work-sessions.js`
	- Services: `src/features/services/api/index.js`
	- Settings: `src/features/settings/api/{settings.js,index.js}` (server API + client helpers)
	Legacy files under `src/api/` now re-export from the new paths to ease migration. Prefer importing from the feature locations going forward.

### Forms UI Layer (2025-10)
- Centralized form field components live in `src/components/ui/forms-ui/` to provide consistent RTL-first design, error handling, and labeling across all forms.
- Available field components:
  - **`FormField`**: Base wrapper that handles label, description, and error display. All other field components use this internally. Automatically applies `dir="rtl"` and right-aligned text to all child elements.
  - **`TextField`**: Text input with support for various types (text, email, number, date, etc.). Includes dir prop for RTL/LTR control.
  - **`TextAreaField`**: Multi-line text input with configurable rows.
  - **`SelectField`**: Dropdown using Radix Select with options array `[{ value, label }]`.
  - **`PhoneField`**: Israeli phone input with LTR dir (correct for phone numbers) and RTL-aligned label/description.
  - **`DayOfWeekField`**: Day-of-week selector using DayOfWeekSelect component.
  - **`ComboBoxField`**: Free text + suggestions dropdown (service selection, etc.).
  - **`TimeField`**: Time picker with 15-min snapping and HH:MM display.
- All field components accept consistent props: `id`, `label`, `value`, `onChange`, `required`, `disabled`, `description`, `error`, `placeholder`.
- Import from barrel: `import { TextField, SelectField, ... } from '@/components/ui/forms-ui';`
- **RTL Form Structure Requirements**:
  - Form elements must have `dir="rtl"` on the `<form>` tag itself.
  - All `<Label>` components need `className="block text-right"` for proper Hebrew text alignment.
  - Description and error text should include `text-right` class.
  - Form footers with buttons should use `flex-row-reverse` to ensure proper RTL button ordering (primary action on right).
  - Phone inputs remain LTR (`dir="ltr"`) as phone numbers are universally left-to-right, but labels and descriptions stay RTL-aligned.
- Dialog components (`src/components/ui/dialog.jsx`) updated for RTL:
  - Close button positioned on left (RTL standard).
  - DialogHeader text aligned right.
  - DialogFooter uses flex-row-reverse with gap for proper RTL button ordering.
  - Content scrolling contained within dialog body using `.dialog-scroll-content` class with custom scrollbar styling (thin, natural appearance, hover feedback).
- Custom scrollbar styles in `src/index.css` under `.dialog-scroll-content` class provide thin, semi-transparent scrollbars that match design system colors.
- Forms fully migrated to RTL structure: `AddStudentForm`, `NewSessionForm`.
- Migration strategy: All new forms must follow RTL patterns from the start; existing forms should be updated to match the RTL structure during maintenance.

### Session Form Question Types (2025-10)
- Session form questions are managed via `SessionFormManager.jsx` (Settings page) and rendered in `NewSessionForm.jsx`.
- Question type definitions in `QUESTION_TYPE_OPTIONS`:
  - `textarea` - Multi-line text input
  - `text` - Single-line text input
  - `number` - Numeric input
  - `date` - Date picker
  - `select` - Dropdown menu
  - `radio` - Traditional radio buttons with visible circular inputs (vertical stack)
  - `buttons` - Modern button-style selection with hidden radio inputs (horizontal flex wrap, full button is clickable with primary color fill when selected)
  - `scale` - Numeric range slider with min/max/step configuration
- Visual distinction between `radio` and `buttons`:
  - **`radio`**: Displays as a vertical list with visible radio button circles; uses subtle hover and border highlight when selected
  - **`buttons`**: Displays as horizontally wrapped button group; radio input is hidden (`sr-only`); selected button gets primary background with white text and shadow; unselected buttons have neutral border with hover effects
- Both types use the same data structure (options array) and validation rules (minimum 2 options required).
- **Metadata support**: The `Settings` table includes a `metadata` jsonb column for storing auxiliary configuration. For `session_form_config`, this holds preconfigured answer lists for `text`/`textarea` questions under `metadata.preconfigured_answers[question_id]`. The cap is enforced server-side using control DB permissions and respected in the editor UI.

### Tenant schema policy
- All tenant database access must use the `tuttiud` schema. Do not query the `public` schema from this app.
- Supabase tenant clients must set `db: { schema: 'tuttiud' }`. Existing endpoints that used default schema have been updated accordingly (`/api/services`, `/api/work-sessions`).

### Legacy: WorkSessions vs SessionRecords
- WorkSessions is a legacy construct kept temporarily for compatibility with existing import and payroll flows.
- New session data entry uses `SessionRecords` via `/api/sessions` and history reads via `/api/session-records`.
- Plan to migrate remaining WorkSessions consumers (e.g., import flows) to `SessionRecords` once mapping and reporting requirements are finalized.

### UI Tokens: Popover/Select backgrounds
- Our Select/Popover primitives use classes like `bg-popover` and `text-popover-foreground`. Ensure Tailwind maps these tokens to CSS variables. We extended `tailwind.config.js` colors to include `popover`, `popover-foreground`, `muted`, `accent`, `secondary`, `destructive`, and `card` using `hsl(var(--token))` so dropdown lists render with a visible background.
- CSS variables are defined in `src/index.css` under `:root` and `.dark`. If adding new shadcn tokens, update both `index.css` and `tailwind.config.js` accordingly.

### Popover/Select scroll and input patterns (2025-10)
- When using overlays inside `Dialog`, body scroll is locked by react-remove-scroll. To allow dropdowns to scroll:
  - Add `data-scroll-lock-ignore` and/or `data-rs-scroll` on the overlay content element.
  - Add `pointer-events-auto` and `overscroll-behavior: contain` to the content.
  - Prefer the scroll container (`Viewport` or list wrapper) with `max-height` and `overflow-y-auto`.
- Do not wrap editable `<Input>` controls in `PopoverTrigger`. It makes the field behave like a button and can block typing.
  - Preferred structure: render `<Input>` normally; wrap only the chevron button with `PopoverTrigger asChild`.
  - Use an "auto-commit on close" pattern to save free text:
    - Track `query` (typed text) and `lastCommitted` via ref.
    - Commit on Enter and in a `useEffect` that runs when `open` goes false.
- Components aligned to this pattern:
  - `src/components/ui/ComboBoxInput.jsx` (generic string combobox; suggestions + free text)
  - `src/components/ui/TimePickerInput.jsx` (HH:MM snapping to 15-min increments; persists as `HH:MM:SS`)

### Accessibility Controls (2025-10)
- In-app Accessibility menu adds persistent controls for:
  - Font scale (90%–140%) via `--a11y-font-scale` (applied on `html`).
  - High-contrast theme toggle (adds `a11y-hc` class on `html`).
  - Text spacing toggle (adds `a11y-text-spacing` class; increases letter/word spacing and line-height).
  - Underline links toggle (adds `a11y-underline-links` class; underlines all anchors with offset + thickness).
  - Dyslexia-friendly font toggle (adds `a11y-dyslexia-font` class; uses `'OpenDyslexic', 'Atkinson Hyperlegible', Nunito, system-ui` stack; bundle a font file later if needed).
- Styles are injected once at runtime by `AccessibilityProvider` (style tag `#a11y-dynamic-styles`) to avoid global CSS churn. If we later prefer static CSS, move the rules into `src/index.css` under `@layer base` and remove the injector.
- Persistence uses localStorage keys `a11y:*`. The provider exposes `useAccessibility()` for UI wiring.

## Future Implementation: Organization Switching
- The legacy AppShell sub-header (removed in the cleanup that consolidated the global header) previously hosted the organization-switching dropdown. When it rendered, it embedded the logic now housed in `src/org/OrgSwitcher.jsx` (see the git history for the pre-removal `AppShell.jsx` block) to list orgs, handle focus, and persist selection. When reintroducing org switching into the refreshed header, reuse that approach instead of recreating it from scratch.
