# Tuttiud Student Support Platform

Tuttiud is a Vite + React application for managing instructors, students, and instructional session records. Supabase provides tenant data storage while Azure Functions guard every privileged operation.

## 🚀 MVP priorities

The refactored codebase focuses on four launch stories:

1. **Instructor session logging** – members create and update `SessionRecords` for their assigned students.
2. **Instructor dashboard** – members only see students where `assigned_instructor_id` matches their profile.
3. **Administrator control actions** – admins back up tenant data, create students, and map students → instructors.
4. **Administrator roster visibility** – admins can review the full student list with instructor assignments.

## 🧭 Onboarding checklist

The onboarding wizard (`Settings → Supabase Setup`) leads every new organization through three steps:

1. **Run the canonical SQL** – copy the script exported from [`src/lib/setup-sql.js`](src/lib/setup-sql.js) into the Supabase SQL editor and execute it. Version 2.3 extends the diagnostics to cover RLS, policies, and required indexes.
2. **Paste the dedicated key** – grab the `APP_DEDICATED_KEY` JWT produced by the script and drop it into the wizard.
3. **Validate & store** – the wizard runs `tuttiud.setup_assistant_diagnostics()` (schema/RLS/policy/index checks), encrypts the JWT through `/api/save-org-credentials`, and the API now persists `dedicated_key_saved_at`, `verified_at`, and `setup_completed` before the UI records verification and unlocks the rest of the app.

All states (loading, error, success) are surfaced inline with accessible messages (`aria-live`). The wizard can be reopened at any time to re-run diagnostics or rotate the key.

## 🔑 Key UI behavior

- **Supabase Setup Assistant** (`src/components/settings/SetupAssistant.jsx`) is the single entry point for onboarding. It owns the SQL copy helpers, JWT capture, and validation flow.
- **App shell** (`src/components/layout/AppShell.jsx`) delivers the mobile-first navigation: a bottom tab bar with a central session FAB on phones and a desktop sidebar for wider screens.
- **Admin Student Management** (`src/features/admin/pages/StudentManagementPage.jsx`) is the new mobile-first roster experience. It fetches `/api/students` on load, renders loading/error/empty states, opens `AddStudentForm` for creation, and drives instructor assignment through `AssignInstructorModal`.
- **Feature-sliced admin components** live in `src/features/admin/components/`. Each component is scoped to the admin feature (forms, modals) while shared primitives stay in `src/components/ui`.
- **Org context** (`src/org/OrgContext.jsx`) stores the encrypted dedicated key timestamp (`dedicated_key_saved_at`) and still toggles `setup_completed` after verification, complementing the server-side persistence added to `/api/save-org-credentials`.
- **Runtime verification helpers** (`src/runtime/verification.js`) expose `verifyOrgConnection({ dataClient })` which runs `tuttiud.setup_assistant_diagnostics()` and returns the diagnostic rows for custom UI messaging.
- Feature modules (students, instructors, sessions) must load data exclusively through secure `/api/*` endpoints. The frontend never uses the dedicated JWT directly.

## 🎨 Design system foundations

- **Tailwind base theme** – `tailwind.config.js` now centers on the Nunito font family, a calm violet primary color ramp, balanced neutral grays, and dedicated success/warning/error accents. The spacing scale introduces tokens from `2xs` to `3xl` so mobile layouts feel open and touch-friendly.
- **Reusable primitives** – New mobile-first components live in `src/components/ui/Button.jsx`, `Card.jsx`, `Input.jsx`, and `PageLayout.jsx`. Compose them when building fresh views to guarantee consistent padding, typography, and contrast.
- **Adoption plan** – Existing screens will migrate in future tasks. For now, these primitives provide the foundation for the upcoming redesign.

## 🔐 Secure API endpoints (MVP)

- `GET /api/instructors` – admin/owner list of instructor IDs + names derived from `org_memberships` and `profiles`.
- `GET /api/students` – admin/owner roster of every student row from `tuttiud."Students"`.
- `POST /api/students` – admin/owner creation of student records with optional instructor assignment.
- `PUT /api/students/{studentId}` – admin/owner updates to student metadata (name, contact info, instructor).
- `GET /api/my-students` – member/admin/owner view of students whose `assigned_instructor_id` equals the caller.
- `POST /api/sessions` – member/admin/owner insertion of `SessionRecords` with assignment verification for members.

## 📚 Documentation

- English & Hebrew project docs live in [`ProjectDoc/Eng.md`](ProjectDoc/Eng.md) and [`ProjectDoc/Heb.md`](ProjectDoc/Heb.md). Update both together.
- Any onboarding or AI-related insights belong in [`AGENTS.md`](AGENTS.md).

## 🛠 Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `api/local.settings.json` with Supabase control credentials (URL, anon key, service role, and encryption key for `/api/save-org-credentials`).
3. Start Vite:
   ```bash
   npm run dev
   ```
4. In another terminal launch the Azure Static Web Apps emulator so `/api/config` and the secure proxies are available:
   ```bash
   swa start http://localhost:5173 --api-location api
   ```

## 🏗 Building for Azure Static Web Apps

```bash
npm run build
```

The command emits static assets into `dist/`. Configure Azure Static Web Apps with `app_location: "/"`, `output_location: "dist"`, `api_location: "api"`, and `npm run build` as the build command.

## ⚙️ Runtime configuration

At bootstrap the SPA calls `GET /api/config`. Without credentials the function returns the shared Supabase URL and anon key defined by `APP_SUPABASE_URL` / `APP_SUPABASE_ANON_KEY`.

After login the client requests `GET /api/org/<org-id>/keys` with `X-Supabase-Authorization: Bearer <supabase_access_token>`. The API verifies membership, returns the tenant Supabase URL + anon key, and the frontend instantiates an isolated data client. All writes continue to flow through the server-side proxies.

Visit `/#/diagnostics` during development to inspect the last runtime configuration payload. Sensitive values are masked except for the last four characters.

## 🧪 Guardrails

- Reuse the client helpers from `src/lib/supabase-manager.js` – do not instantiate Supabase clients manually inside components.
- Normalize thrown errors with `asError` (`src/lib/error-utils.js`).
- Run the following before committing changes that touch Supabase flows:
  ```bash
  npm run build
  node --test
  ```

## ❤️ Health check

`/api/healthcheck` responds with `{ "ok": true }` and can be used for deployment probes.
