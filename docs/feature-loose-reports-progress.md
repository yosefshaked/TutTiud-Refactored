# Loose Session Reports – Progress

## Phases & Tasks

### Phase 0: Planning & Foundations
- [x] Create progress tracker file
- [x] Confirm feature scope, constraints, and acceptance criteria
- [x] Identify affected code areas (DB schema, API, instructor UI, admin UI)
- [x] Align with AGENTS/ProjectDoc conventions and logging/auth patterns

### Phase 1: Database & Schema
- [x] Make `tuttiud."SessionRecords".student_id` nullable (idempotent migration)
- [x] Update setup script version + document schema change in AGENTS/ProjectDoc
- [x] Ensure API validation tolerates nullable student_id
- [x] Add metadata merge helper to preserve existing keys on writes
- [x] Verify SessionRecords queries that assume student_id NOT NULL (backend + frontend)

### Phase 2: Backend API (Capture & Resolution)
- [x] Update `/api/sessions` create flow to accept loose reports
- [x] Validate required fields for loose reports (name, reason, date, time, service)
- [x] Write unassigned_details into metadata additively (no clobber)
- [x] Exclude loose reports from standard student history endpoints
- [x] Add admin resolution endpoints (list pending, assign existing, create+assign)
- [x] Resolution: set student_id, remove only `unassigned_details` from metadata
- [x] Add audit logging for creation and resolution actions
- [ ] Add tests/validation scripts updates (where applicable)

### Phase 3: Instructor UI (Capture in New Session Modal)
- [x] Add "Student not in list?" trigger next to student select
- [x] Switch to loose mode: text input for name, disable defaults
- [x] Require manual date, time, service, reason (Other 	 required text)
- [x] Show warning/alert that admin approval is required
- [x] Wire submission payload for loose reports (metadata structure)

### Phase 4: Admin UI (Resolution Workspace)
- [x] Add Pending Reports entry point + badge count on Student page header
- [x] Build list view of `student_id IS NULL` reports with name/reason display
- [x] Action: match to existing student (search + update)
- [x] Action: create new student (prefill name) then update report; surface failure warning if update fails
- [x] Remove `unassigned_details` during resolution only

### Phase 5: Verification & Docs
- [x] Lint touched files (targeted eslint per AGENTS)
- [x] Run API validation script if required (`npm run lint:api`, `node scripts/validate-api-endpoints.js`)
- [x] Add notes to AGENTS/ProjectDoc about schema change and feature behavior
- [ ] Manual QA checklist: capture loose report, view exclusion from standard history, resolve via existing and new student flows

### Phase 6: Edge Cases & Enhancements
- [ ] **#2**: Add "reject report" action (duplication/wrong filling/error/custom reason)
- [x] **#3**: Implement instructor assignment rules (instructor-only, admin/owner with override, non-instructor admin selection)
  - Note: Current implementation preserves original instructor_id from session creation; student's assigned_instructor is separate
- [x] **#4**: Change "default service" to "report service" and make required in both loose capture and resolution
  - Frontend: Label changed to "שירות דיווח *", field marked required, validation added
  - Backend: Service field already required for loose reports in `api/_shared/validation.js`
- [x] **#5**: Sort pending reports by `SessionRecords.date` (oldest first by default)
  - Backend: Changed sort order in GET /api/loose-sessions from `created_at DESC` to `date ASC`
- [ ] **#6**: Add bulk selection (checkboxes + "select all with same name") and bulk assign/create actions
- [x] **#7**: Add admin-only role guard to PendingReportsPage (redirect non-admin to /my-students)
  - Implemented: Uses `normalizeMembershipRole` + `isAdminRole` check, redirects before rendering content
- [ ] **#8**: Add search/filter to pending reports (name, date range, service, instructor)
- [x] **#9**: Add national_id validation during student creation to prevent duplicates
  - Frontend: Added national_id input field (required, maxLength 9) in ResolvePendingReportDialog
  - Backend: Checks for duplicate national_id before creating student, returns 409 with helpful error
  - Error handling: Displays Hebrew message "מספר זהות כבר קיים במערכת" on conflict
  - **⚠️ CODE DUPLICATION**: ResolvePendingReportDialog manually implements student creation logic instead of reusing existing `AddStudentForm` component which has better validation (`useStudentNameSuggestions`, `useNationalIdGuard` hooks)
  - **📋 DUPLICATION ANALYSIS COMPLETED**: See `docs/code-duplication-analysis.md` for comprehensive report
  - **Key Findings**:
    - ResolvePendingReportDialog duplicates data fetching for students (lines 47-77), instructors (lines 95-108), services (lines 110-124)
    - Manual national_id validation (lines 213-216) instead of using `useNationalIdGuard` hook
    - 13+ files with identical data fetching patterns (students/instructors/services)
    - No shared hooks for common data operations
  - **Recommended Actions**:
    1. Create `useStudents()`, `useInstructors()`, `useServices()` hooks in `src/hooks/useOrgData.js`
    2. Refactor ResolvePendingReportDialog to use validation hooks from `useStudentDeduplication.js`
    3. Either embed `AddStudentForm` component or extract minimal `QuickStudentForm` shared component
    4. Replace all manual data fetching (20+ files) with shared hooks
  - **Estimated Impact**: 500+ lines of duplicated code eliminated, single source of truth for critical logic
- [x] **#10**: Verify audit logging includes user_id, user_email, user_role for resolution actions
  - Verified: All resolution actions in `/api/loose-sessions` log userId, userEmail, userRole via `logAuditEvent`
- [ ] **#11**: Allow instructors to track their own loose reports
  - Backend: Add GET endpoint filtering by `instructor_id` (accessible to non-admin instructors)
  - Frontend: Add "My Pending Reports" section/card in instructor Settings or dashboard
  - UI: Show report status (pending/resolved), date, student name (if resolved), action taken
  - Permission: Instructors can view only their own loose reports; cannot resolve them (admin-only)
- [ ] **#12**: Refactor code duplication (see `docs/code-duplication-analysis.md`)
  - **Priority: HIGH** - Technical debt affecting maintainability
  - Phase 1: Create shared data hooks (useStudents, useInstructors, useServices)
  - Phase 2: Refactor ResolvePendingReportDialog validation
  - Phase 3: Replace manual fetching in all 20+ affected files
  - See analysis document for detailed refactoring strategy

## Key Architectural Decisions
- [x] Metadata safety: ensure additive merge when writing `metadata.unassigned_details` (preserve created_by/user_agent/etc.)
  - Implementation: `mergeMetadata` helper in `api/_shared/validation.js` used by `/api/sessions` create flow
- [x] Exclusion strategy: how to omit loose reports from standard student history endpoints without breaking aggregates
  - Implementation: Loose reports excluded in `WHERE student_id IS NOT NULL` clause in student detail queries
- [x] Resolution atomicity: approach for create-student-then-update-report (transaction vs. UI warning fallback)
  - Implementation: Backend creates student in transaction, then updates session; errors surfaced to UI with clear messages
- [x] Validation: enforce loose-report required fields server-side and client-side
  - Server: `api/_shared/validation.js` enforces `service_context`, `time`, `unassigned_details.name`, `.reason`
  - Client: `NewSessionForm.jsx` validates loose mode fields before submission
- [x] Logging/Audit: which actions are logged and how (creation, resolution)
  - Creation: `SESSION_CREATED` action with `is_loose: true` in details
  - Resolution: `SESSION_RESOLVED` action with resolution mode (`assign_existing` or `create_and_assign`)
