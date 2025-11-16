# AGENTS

## Code Style
- Use 2 spaces for indentation.
- Prefer ES module syntax.

## Workflow
- For premium features, always check permissions in both frontend (UI) and backend (API) before allowing access.
- PDF export feature uses Puppeteer with `@sparticuz/chromium` for serverless Azure Functions deployment.
- Lint any changed JavaScript or JSX files with `npx eslint <files>`.
- Run `npm run build` to ensure the project builds.
- No test script is configured; note this in your testing summary.
- Run `npm run check:schema` before adding new persistence logic; if it reports missing columns, add a checklist note to the PR instead of coding around the gap.
- Instructor color assignments live in `api/_shared/instructor-colors.js`. Use `ensureInstructorColors()` before returning instructor records or aggregations so every row keeps a unique `metadata.instructor_color` (solid or gradient).
- `/api/weekly-compliance` powers the dashboard widget with aggregated schedules, legend entries, and dynamic hour ranges. Frontend work should consume its payload instead of duplicating aggregation logic.
- Weekly compliance status logic: `/api/weekly-compliance` marks undocumented sessions scheduled for the current day as `missing`; only future days are returned as `upcoming`.
- Add any important information learned into this AGENTS.md file.
	- If global lint is run across the entire repo, there are legacy violations unrelated to recent changes; follow the workflow and lint only the files you touched in a PR. Address broader lint cleanup in a dedicated maintenance pass.
	- When preserving a function signature for temporarily disabled exports, mark intentionally unused parameters as used with `void param;` (and/or prefix with `_`) to satisfy `no-unused-vars` without altering the public API.
  - Control DB access is now lazy and stateless. The team directory fetch (members + invites) is only enabled while the Settings → Team Members dialog is open. Backend endpoints create a fresh Supabase admin client per request (no global caching) so connections are “woken” on demand and naturally closed after the response. Tenant data client remains unaffected.
- Use ProjectDoc/Eng.md to understand the overall project.
- **Refer to [ProjectDoc/Conventions.md](ProjectDoc/Conventions.md)** for folder structure, naming conventions, API patterns, and feature organization. Update it when adding new patterns or changing structure (with approval).
- OAuth redirects must always include `options.redirectTo` when calling `supabase.auth.signInWithOAuth`. Resolve it from the full `window.location` URL (`origin + pathname + search + hash`) and fall back to `VITE_PUBLIC_APP_URL`, `VITE_APP_BASE_URL`, or `VITE_SITE_URL` when a browser location is unavailable.
- Password reset flows must call `supabase.auth.resetPasswordForEmail` with a redirect that lands on `/#/update-password`, and the update form must rely on `AuthContext.updatePassword` so Supabase finalizes the session before returning users to the dashboard.
- Login form submissions must set inline error state whenever Supabase rejects credentials so the page renders the design system's red alert with the failure message.
- **Dashboard Layout Pattern (2025-11)**: The Weekly Compliance View uses a unified sticky header design. The InstructorLegend is integrated directly into the calendar widget (not a separate floating component) and appears as a horizontal bar at the top of the sticky header, above the day column headers. The entire header block (legend + day headers) uses `position: sticky` with `top: 0` and stays anchored while the calendar body scrolls. No complex JavaScript positioning logic is needed.
  - **Day view integration**: The DayScheduleView (both mobile and desktop day mode) also includes the InstructorLegend in a sticky header that stays visible while scrolling through time slots.
  - **Solid backgrounds**: Both week and day view sticky headers use solid `bg-surface` (no transparency or backdrop blur) to ensure clean visual separation when scrolling. Day header backgrounds changed from `bg-muted/30` to `bg-muted` for consistency.

### Invitation and Password Reset Flow Improvements (2025-11)
- **CompleteRegistrationPage** now distinguishes between different OTP error types:
  - Expired tokens: "ההזמנה פגה. נא לבקש מהמנהל לשלוח הזמנה חדשה."
  - Already-used tokens: Shows message with "Forgot Password?" link to `/forgot-password`.
  - Generic errors: Helpful fallback messages guiding users to appropriate recovery path.
- **OrgMembersCard** (Settings → Team Members):
  - Displays visual indicators for expired pending invitations (amber badge with clock icon).
  - Shows expired invites count in card header badge when admin/owner has expired invitations.
  - Each expired invite displays amber-highlighted row with explanation and "שלח הזמנה מחדש" button.
  - Reinvite handler calls `createInvitation` with same email; backend auto-handles expired invites by marking old as expired and creating new token + sending new email.
  - Helper function `isInvitationExpired()` checks if `expires_at` timestamp has passed.
  - Admins can edit a member’s display name inline; saving updates `profiles.full_name` and Supabase Auth metadata so future sessions show the refreshed name.
- **UpdatePassword** page improved error handling:
  - Distinguishes between expired recovery tokens vs already-used tokens.
  - Shows appropriate messages: expired → request new reset; used → try logging in or request new reset.
- **OrgSelection** page now includes logout button:
  - Positioned in top-left corner (RTL: top-right visually).
  - Uses `useAuth().signOut()` to log out and redirect to `/login`.
  - Provides escape path for users who want to sign out during org selection.
- **Backend invitation flow** (`/api/invitations`):
  - When creating new invitation for same email, automatically marks expired pending invites as expired before creating new one.
  - Returns 409 "invitation already pending" only if existing invitation is still valid (not expired).
  - Reinvitation effectively creates new Supabase OTP token and sends new email with updated expiry.
  - `GET /api/invitations/token/:token` now enriches the payload with `auth` state when available:
    `{ auth: { exists, emailConfirmed, lastSignInAt } }`. This is resolved via the control DB RPC below.

### Control DB RPC: user_verification_state (2025-11)
- New script: `scripts/control-db-auth-utils.sql` creates a SECURITY DEFINER SQL function:
  - `public.user_verification_state(user_email text)` → returns one row `{ user_exists, email_confirmed, last_sign_in_at }` from `auth.users`.
  - Used by `/api/invitations` to disambiguate "invalid or expired" links (already-used vs truly expired) without exposing service role to the client.
- Deployment: run this script once against the control database in Supabase SQL editor.
- Admin API endpoint: `GET /api/invitations/check-auth?email=...` allows admins to query user verification state by email.
  - Requires admin/owner role in at least one organization.
  - Returns `{ email, auth: { exists, emailConfirmed, lastSignInAt } }`.
  - Frontend client helper: `src/api/check-auth.js` exports `checkAuthByEmail(email, { session, signal })`.
  - Useful for admin UIs to display user status (e.g., "pending verification", "verified", "not registered") before reinviting or troubleshooting invitation issues.

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
  - `exportTenantData(tenantClient, orgId)`: queries all tenant tables (Students, Instructors, SessionRecords, Settings), returns manifest v1.0
  - `validateBackupManifest(manifest)`: checks version/schema compatibility
  - `restoreTenantData(tenantClient, manifest, options)`: transactional restore with optional `clearExisting` flag in dependency order
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

### PDF Export Feature (2025-11)
- `/api/students/export` (POST) generates professional PDF reports of student session records. Premium feature requiring `permissions.can_export_pdf_reports = true`.
  - Validates admin/owner role and permission before processing
  - Generates Hebrew/RTL-ready PDF with student info, session history, and custom branding
  - Uses Puppeteer with `@sparticuz/chromium` for serverless Azure Functions deployment
  - Co-branding: Always displays TutTiud logo; optionally includes custom org logo if `permissions.can_use_custom_logo_on_exports = true`
  - File naming: `[Student_Name]_Records_[Date].pdf`
  - Resource management: Browser instance always closed in finally block to prevent memory leaks
- Permissions added to `scripts/control-db-permissions-table.sql`:
  - `can_export_pdf_reports` (boolean, default false) - Controls access to PDF export feature
  - `can_use_custom_logo_on_exports` (boolean, default false) - Controls custom logo on exports
- Frontend: Export button on `StudentDetailPage` for admin/owner roles only
  - Conditional rendering: enabled button for permitted orgs, disabled with tooltip for non-permitted orgs
  - Tooltip message: "ייצוא ל-PDF הוא תכונת פרימיום. צור קשר עם התמיכה כדי להפעיל תכונה זו."
  - Uses toast notifications for success/error feedback
  - API client: `src/api/students-export.js` exports `exportStudentPdf()` and `downloadPdfBlob()`

### Collapsible Table Rows Pattern
- When a table needs drill-down details, manage expansion manually with `useState` keyed by row id.
- Render the summary information in the base `<TableRow>` and immediately follow it with a conditional second `<TableRow>` that holds the drawer content inside a single spanning `<TableCell>` (e.g., `colSpan={totalColumns}`).
- Place the toggle affordance (e.g., a chevron button) inside the summary row; avoid wrapping table semantics in `<Collapsible>` primitives so the DOM remains a valid `<table>` composed of sibling `<tr>` elements.

### Dialog Footer Pattern (2025-10)
- `DialogContent` accepts an optional `footer` prop to render sticky footer buttons outside the scrollable content area.
- Forms inside dialogs should:
  - Accept a `renderFooterOutside` prop (default `false` for backward compatibility).
  - Export a separate `*FormFooter` component that renders the action buttons.
  - Add an `id` attribute to the `<form>` element for programmatic submission.
  - Conditionally render the inline footer when `renderFooterOutside={false}`.
- Parent dialogs pass the footer to `DialogContent` via the `footer` prop and trigger submission using `document.getElementById('form-id')?.requestSubmit()`.
- This pattern ensures footers remain visible at the bottom of the dialog on both mobile and desktop without being hidden by scrolling content.
- Footer styling: `sm:rounded-b-lg` matches dialog's bottom corners on desktop; mobile dialogs are positioned from top with proper spacing (`top-[2rem]`) and reserve space for bottom navigation (`max-h-[calc(100vh-12rem)]`).
- Mobile browser compatibility (2025-11): The 12rem (192px) vertical reserve (2rem top + 10rem bottom) accounts for mobile browser UI chrome (including floating scroll buttons), app's bottom navigation, and safe spacing. Dialog is anchored from top to maximize usable space while keeping buttons visible on browsers like Samsung Galaxy.
- FAB button (mobile navigation): positioned at `-top-8` to float above the bottom nav bar.
- Examples: `NewSessionForm`/`NewSessionFormFooter`, `AddStudentForm`/`AddStudentFormFooter`, `EditStudentForm`/`EditStudentFormFooter`.

### Mobile Bottom Navigation (2025-11)
- The mobile navigation bar (`MobileNavigation` in `AppShell.jsx`) uses `position: fixed` with `bottom-0` and `inset-x-0` to stay anchored at the bottom.
- Performance optimizations for smooth scrolling on mobile browsers:
  - Uses solid `bg-surface` (100% opacity) instead of translucent to avoid rendering issues during fast scrolling.
  - Removed `backdrop-blur` which can cause performance issues on some mobile devices.
  - Added `willChange: 'transform'` CSS hint to optimize browser rendering and prevent jitter/jumping during scroll.
  - Added `translateZ(0)` transform to force GPU acceleration and keep navigation in its own compositing layer, preventing scroll jank.
  - Explicitly sets `position: 'fixed'` in inline style to reinforce fixed positioning behavior.
  - Added `isolation: 'isolate'` to create a new stacking context and prevent interference from browser's floating UI elements (e.g., scroll-to-top buttons).
- The navigation responds to keyboard visibility via `useKeyboardAwareBottomOffset` which translates it upward when the virtual keyboard is shown.
- Z-index is set to `z-[60]` to ensure it stays above dialogs and other UI elements.

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
- `/api/invitations` is the control-plane API for organization invites. It uses `APP_CONTROL_DB_URL` and `APP_CONTROL_DB_SERVICE_ROLE_KEY` for the Supabase admin client, enforces admin/owner membership before writes, auto-expires pending rows once `expires_at` passes, and updates statuses to `accepted`, `declined`, `revoked`, `expired`, or `failed`.
  - Invitation expiry is calculated automatically using smart precedence (global):
    1. **Registry override (global)**: `permission_registry.invitation_expiry_seconds` (integer, seconds) takes priority if set.
    2. **Supabase auth config**: Reads `MAILER_OTP_EXP` from `auth.config` via `get_auth_otp_expiry_seconds()` RPC (seconds).
    3. **Hardcoded fallback**: 24 hours (86400 seconds) if both above are unavailable or fail.
  - Backend uses `calculate_invitation_expiry(org_id)` RPC (control DB) to compute `expires_at` timestamp when client doesn't explicitly provide expiration.
  - Control DB schema: Run `scripts/control-db-invitation-expiry.sql` to deploy the RPC functions (`get_auth_otp_expiry_seconds` and `calculate_invitation_expiry`).
  - Permission registry: `invitation_expiry_seconds` (integer, default null) in `permission_registry` table allows global customization without modifying Supabase auth settings.
  - Clients can still explicitly provide `expiresAt`/`expires_at` in the POST request body to override automatic calculation.
- `/api/settings` surfaces HTTP 424 (`settings_schema_incomplete` / `settings_schema_unverified`) when `tuttiud.setup_assistant_diagnostics()` reports missing tenant tables or policies, and the response includes the failing diagnostic rows so admins rerun the setup script instead of retrying blindly.
- Invitation completion emails land on `/#/complete-registration` with `token_hash` (Supabase invite) and `invitation_token` (control-plane token). The page must display the invited email, wait for the user to click the manual confirmation button, then call `supabase.auth.verifyOtp({ type: 'invite', token_hash })` before redirecting to `/#/accept-invite` while forwarding the original `invitation_token`.
- The `/components/pages/AcceptInvitePage.jsx` route requires an authenticated session, reloads invitation status via `/api/invitations/token/:token`, blocks mismatched accounts until they sign out, and surfaces state-specific UI (pending actions, accepted success CTA, or invalid-link notice) while wiring accept/decline buttons to the secure `/api/invitations/:id/(accept|decline)` endpoints.
- TutTiud rebranding placeholder assets live in `public/icon.svg`, `public/icon.ico`, and `public/vite.svg` until final design delivery.
- `tuttiud.setup_assistant_diagnostics()` now validates schema, RLS, policies, and indexes. Keep `SETUP_SQL_SCRIPT` (v2.4) as the source of truth when extending onboarding checks.
- Shared BFF utilities for tenant access (`api/_shared/org-bff.js`) centralize org membership, encryption, and tenant client creation. Reuse them when building new `/api/*` handlers.
- Admin UI is migrating to feature slices. Place admin-only components under `src/features/admin/components/` and mount full pages from `src/features/admin/pages/`. Reusable primitives still belong in `src/components/ui`.
- The refreshed design system lives in `tailwind.config.js` (Nunito typography, primary/neutral/status palettes, spacing tokens) with base primitives in `src/components/ui/{Button,Card,Input,PageLayout}.jsx`. Prefer these when creating new mobile-first UI.
- `src/components/layout/AppShell.jsx` is the new navigation shell. It renders the mobile bottom tabs + FAB and a desktop sidebar, so wrap future routes with it instead of the legacy `Layout.jsx`.

### Weekly Compliance Calendar Layout (2025-11) - Heatmap Implementation
- The Weekly Compliance View uses a **compliance heatmap** approach optimized for high-density session tracking.
- Main view (`ComplianceHeatmap.jsx`): Grid showing days × time slots with color-coded cells indicating documentation compliance percentage:
  - 🟢 Success Green (#22C55E, 100%): Excellent compliance
  - 🟡 Warning Yellow (#FACC15, 76-99%): Needs attention
  - � Warning Orange (#F97316, 0-75%): Requires action
  - ⚪ Neutral Gray (#E5E7EB): No sessions scheduled / Upcoming sessions (not yet due)
- **UI Design Principles (2025-11)**:
  - Each cell uses larger padding (p-4), border-2, and bold text for better visual hierarchy
  - **Color saturation (2025-11)**: Upgraded from -100/-950 to -200/-900 for bolder, more visible states; text upgraded to -950/-50 for maximum contrast
  - **Tight spacing (2025-11)**: Cell content uses gap-1 and leading-tight to reduce whitespace and improve density
  - "תצוגה מפורטת" button styled with outline variant, primary color accents, 📊 icon prefix for visibility
  - Instructor legend removed from week view to reduce visual clutter
  - Cell spacing increased (px-3 py-3) for better touch targets and readability
- Each cell displays: status icon counts (✓×N ✗×N ⚠×N), ratio (documented/total), and percentage.
- Click any cell opens `SessionListDrawer.jsx` showing detailed session list for that hour with:
  - **Drawer placement (2025-11)**: Opens on left side (RTL convention: primary content right, secondary left)
  - Sessions grouped by exact time (handles :15/:45 naturally)
  - Status icons (✓ documented, ✗ missing, ⚠ upcoming)
  - **Instructor colors displayed** (2025-11): Color bar on right edge of card + color dot next to instructor name
  - Instructor color rendering handles both solid colors and gradients (gradient- prefix converted to linear-gradient CSS)
  - **Quick documentation (2025-11)**: "תעד עכשיו" button opens `NewSessionModal` with pre-filled student + date; default service auto-selected if configured
  - **RTL layout (2025-11)**: Cards use `dir="rtl"` with text on right, status icon center, buttons on left; proper Hebrew reading flow
- "תצוגה מפורטת" button per day opens `DayTimelineView.jsx` - resource timeline showing instructor lanes with sessions positioned precisely by time.
- **Day timeline RTL fixes (2025-11)**:
  - Timeline flows right-to-left (RTL): latest hour on right, earliest on left (Hebrew reading direction)
  - Hours array reversed (maxHour → minHour) for proper RTL display
  - Position calculated from right edge: `(maxHour - timeMinutes) * 120px`
  - Session chips contain RTL content (`dir="rtl"`) for Hebrew text display
  - Grid lines use `border-r` (right border) for RTL layout
  - Instructor column reduced from 192px to 128px for more timeline space and better student name visibility
  - Vertical spacing optimized: py-1 for rows, minHeight 60px (was 120px) to eliminate unused space
  - Container includes `overflow-hidden` to prevent chips from sliding outside bounds
  - **Session duration (2025-11)**: Chip width = 110px (30-minute sessions, allowing full student names); positioned at 120px per hour scale
  - **Smart stacking (2025-11)**: `calculateStackPosition` detects time overlaps and fills gaps; sessions stack only when overlapping, reusing vertical space when prior sessions end
  - Stacking uses 36px per row for comfortable spacing
- Day timeline uses instructor rows with horizontal time grid (dynamic hours based on actual sessions, 120px per hour).
- Sessions positioned as clickable chips at exact times, stacking intelligently to avoid wasted vertical space.
- Scales infinitely: works with any number of instructors/students/sessions without overlap issues.
- Mobile: Week heatmap remains functional; day timeline best viewed in landscape.
- Legacy: React Big Calendar approach (ModernWeeklyCalendar.jsx) deprecated due to event density issues.
- Demo: `demo-resource-timeline-week.html` shows what a full week resource timeline would look like (horizontal scroll, all days visible).

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

### Student Lifecycle & Visibility (2025-11)
- Tenant students now include an `is_active` boolean (default `true`). The setup script (`src/lib/setup-sql.js`) adds the column with `ADD COLUMN IF NOT EXISTS` and backfills existing rows, so rerunning the script on legacy tenants is safe.
- `/api/students` defaults to `status=active`; pass `status=inactive`, `status=all`, or `include_inactive=true` (legacy) when maintenance flows need archived rows. `PUT` handlers accept `is_active` alongside the existing roster fields.
- `/api/my-students` respects the org setting `instructors_can_view_inactive_students`. Instructors only see inactive records when the flag is enabled; admins/owners always see them when requesting `status=all`.
- Admin UI (`StudentManagementPage.jsx`) persists the Active/Inactive/All filter in `sessionStorage`, badges inactive rows, and exposes the toggle in `EditStudentForm.jsx`. Instructor surfaces (`MyStudentsPage.jsx`, `NewSessionModal.jsx`, `NewSessionForm.jsx`) automatically hide inactive students unless the setting is on.
- Settings page adds `StudentVisibilitySettings.jsx` (eye-off card) so admins control the instructor flag through `fetchSettingsValue`/`upsertSetting`. Keep the copy bilingual and honor API permission checks when extending the card.

### Student Tags Catalog (2025-11)
- Tenant tag definitions live in the `tuttiud."Settings"` row keyed `student_tags` (JSONB array of `{ id, name }`).
- Backend: `GET /api/settings/student-tags` returns the catalog for any org member; `POST /api/settings/student-tags` appends a tag (admin/owner only) and regenerates the row via Supabase upsert.
- Frontend: use `useStudentTags()` (`src/features/students/hooks/useStudentTags.js`) to load/create tags and render `StudentTagsField.jsx` for the dropdown + admin-only creation modal in student forms.
- Tag normalization helpers live in `src/features/students/utils/tags.js`; reuse `normalizeTagIdsForWrite` and `buildTagDisplayList` whenever sending or displaying student tags to keep the uuid[] contract authoritative.
- **Tag Management UI** (2025-11): Admin/owner users can manage tags via Settings page card (`TagsManager.jsx`):
  - Create new tags with duplicate name validation
  - Edit existing tag names (updates propagate to all tagged students via settings catalog)
  - Delete tags with confirmation guard; deletion removes tag from catalog and all student rows via `/api/students-remove-tag`
  - Backend uses `tuttiud.remove_tag_from_students(tag_uuid)` PostgreSQL function for efficient bulk removal with fallback to manual iteration
  - Tag deletion is permanent; confirmation dialog warns users that operation cannot be undone
  - Full RTL support with proper Hebrew text alignment and flex-row-reverse layouts

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
- **Session form versioning** (2025-11):
  - Backend (`/api/sessions`) saves `SessionRecords.metadata.form_version` by extracting from `Settings.session_form_config.current.version` (primary) or `Settings.session_form_config.version` (legacy fallback).
  - **Shared version lookup utility**:
    - `extractQuestionsForVersion(formConfig, version)` contains the core logic for extracting questions from versioned config
    - Frontend: `src/features/sessions/utils/version-lookup.js`
    - Backend: `api/_shared/version-lookup.js` (copy kept in sync with frontend)
    - Handles nested structure `config.current.questions`, legacy `config.current` array, and flat `config.questions`
    - Searches history array for specific versions
    - Note: Two copies needed because Azure Static Web Apps deploys API and frontend separately; keep them synchronized
  - Frontend (`StudentDetailPage.jsx`) uses `getQuestionsForVersion` helper (`src/features/sessions/utils/version-helpers.js`):
    - Calls shared `extractQuestionsForVersion` to get raw questions
    - Then normalizes via `parseSessionFormConfig` (adds `key` field from `id`, proper structure, etc.)
  - PDF export (`api/students-export/index.js`):
    - Imports and uses shared `extractQuestionsForVersion` directly (no normalization needed)
    - Uses `buildAnswerList` with question map that looks up by `id`, `key`, or `label` to match raw questions
  - When displaying session records:
    1. Checks `session.metadata.form_version` for each record
    2. If version is set, retrieves matching questions from `session_form_config.current.questions` or `session_form_config.history[].questions`
    3. If version is null/missing, falls back to current form configuration
  - This gracefully handles legacy records (no version) while supporting future versioned forms when history tracking is implemented.
  - Database structure: `session_form_config` is stored as `{"current": {"version": N, "saved_at": "...", "questions": [...]}, "history": [...]}`

### Tenant schema policy
- All tenant database access must use the `tuttiud` schema. Do not query the `public` schema from this app.
- Supabase tenant clients must set `db: { schema: 'tuttiud' }`. Existing endpoints that used default schema have been updated accordingly.

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
