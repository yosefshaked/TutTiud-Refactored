# Feature: Import Legacy Session Records via CSV

**User Story**

As an administrator or owner, I want to upload a student's historical session records from a CSV file, so that all of their past data is consolidated within the TutTiud system and included in their profile and official reports.

**Feature Description**

This feature will introduce a new CSV import workflow that allows an admin to upload legacy session records for a specific student. The ability to perform multiple imports will be controlled by a new, organization-level permission. By default, this will be a one-time operation.

---
### **Architectural Decision: Data Storage & Re-Uploads**

*   **Storage:** All imported legacy records will be stored as new rows in the existing **`tuttiud.SessionRecords`** table, with a new boolean column to identify them.
*   **Re-Upload Strategy:** If an organization has permission to perform multiple uploads, each new upload for a student will **overwrite and replace all previously imported legacy data** for that student. This is the chosen strategy to prevent data duplication.

---

### **Acceptance Criteria**

**1. Database Schema & Permissions:** (This part is complete)
*   [x] The `SessionRecords` table schema must be updated to include a new column: **`is_legacy BOOLEAN NOT NULL DEFAULT false`**.
*   [x] A new permission, **`can_reupload_legacy_reports`**, must be added to the system (`permission_registry`).
*   [x] This permission must be manageable on a per-organization basis (via `org_settings.permissions`). The system-wide default must be `false`.

**2. UI & Entry Point:** (This part is complete)
*   [x] On a student's detail page, a new button, "Import Legacy Reports," must be visible **only to users with `admin` or `owner` roles**.
*   [x] **Conditional Button State:**
    *   If the `can_reupload_legacy_reports` permission is `false` and a legacy import has already been performed for this student, the button must be **disabled or hidden**.
    *   If the `can_reupload_legacy_reports` permission is `true`, the button must **always be enabled**.

**3. The Import Modal Workflow:** (This part is complete)
*   [x] **Step 1: Backup Warning.** The very first screen of the modal must display a prominent warning message with a link to the backup settings.
*   [x] **Step 2: The Choice.** The modal asks the user if the CSV structure matches the current questionnaire.
*   [x] **Step 3 (Scenario A & B):** The modal provides the correct mapping interface for both structured and unstructured data.
*   [x] **Step 4: Confirmation.** The modal displays the final confirmation and re-upload warnings.

**4. Backend Logic (`POST /api/students/{id}/legacy-import`):**
*   [x] The endpoint must first check the organization's `can_reupload_legacy_reports` permission. If it's `false` and legacy records already exist for the student, the request must be rejected.
*   [x] If the upload is permitted, the function must first **delete all existing records** from `SessionRecords` where `student_id` matches and `is_legacy` is `true`.
*   [x] After deletion, it will proceed to parse the new CSV file and create the new rows in the `SessionRecords` table, each with `is_legacy` set to `true`.
*   [x] Import requests may set a single `service_context` for all rows or map a `service_context` column from the CSV; blank values remain without a service.

**5. Universal Display Logic for Legacy Records:**
*   [x] The application's rendering logic for session records must be updated to handle the two possible data structures within the `content` (JSONB) column, based on the `is_legacy` flag.
*   [x] **The user-facing outcome is the key requirement:** a legacy session record must be displayed correctly, with its custom question names, in **every single place** a user can view session records.
