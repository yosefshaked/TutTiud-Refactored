# Feature Progress: Import Legacy Reports

This file tracks the implementation progress for the legacy CSV import feature.

## Phase 1: Backend Foundation (Complete)

- [x] Updated `SessionRecords` schema to include the `is_legacy` flag.
- [x] Registered the `can_reupload_legacy_reports` permission in the control database.
- [x] Updated all relevant project documentation.

## Phase 2: Frontend UI & Modal Workflow (Complete)

- [x] Implement the student-page entry point, modal workflow, and UI mapping logic.

## Phase 3: Backend API Endpoint (To Do)

- [ ] Build the `/api/students/{id}/legacy-import` endpoint.

## Phase 4: Universal Display Logic (To Do)

- [ ] Extend session rendering components to handle legacy content structures.
