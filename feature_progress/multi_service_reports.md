# Multi-Service Dynamic Reports - Implementation Progress

**Started:** February 4, 2026  
**Status:** 🟡 In Progress  
**Current Phase:** B - In-App Migration Strategy (Revised)

---

## Architectural Constraints (CRITICAL)

- ✅ **Distributed Database:** Each tenant has their own DB instance (no central control)
- ✅ **Source of Truth:** `setup-sql.js` defines schema for new installations
- ✅ **Migration UX:** Existing users upgrade via Admin Settings UI button

---

## Core Priorities
- ✅ **Comfortability (UX):** Auto-predict context, minimize user choices
- ✅ **Efficiency:** Inherit data from previous reports
- ✅ **Professionalism:** Use strict database entities instead of strings

---

## Phase A: Database Schema & Architecture

### Tasks Checklist
- [x] 1. Create `Services` table schema
- [x] 2. Create `ReportTemplates` table schema
- [x] 3. Update `SessionRecords` table (add FKs)
- [x] 4. Update `Students` table (add FK)
- [x] 5. SQL migration script ready for review

### Schema Design

**Status:** ✅ Complete - Integrated into `setup-sql.js`

#### New Table: `Services`
```sql
CREATE TABLE tuttiud."Services" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    linked_student_tag UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT services_org_name_unique UNIQUE (organization_id, name)
);

CREATE INDEX idx_services_org_id ON tuttiud."Services"(organization_id);
CREATE INDEX idx_services_linked_tag ON tuttiud."Services"(linked_student_tag);
```

#### New Table: `ReportTemplates`
```sql
CREATE TABLE tuttiud."ReportTemplates" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES tuttiud."Services"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    system_type TEXT NOT NULL CHECK (system_type IN ('INTAKE', 'ONGOING', 'SUMMARY', 'CUSTOM')),
    structure_json JSONB NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT report_templates_service_name_unique UNIQUE (service_id, name)
);

CREATE INDEX idx_report_templates_service_id ON tuttiud."ReportTemplates"(service_id);
CREATE INDEX idx_report_templates_system_type ON tuttiud."ReportTemplates"(system_type);
```

#### Update: `SessionRecords`
```sql
ALTER TABLE tuttiud."SessionRecords"
ADD COLUMN service_id UUID REFERENCES tuttiud."Services"(id),
ADD COLUMN template_id UUID REFERENCES tuttiud."ReportTemplates"(id);

CREATE INDEX idx_session_records_service_id ON tuttiud."SessionRecords"(service_id);
CREATE INDEX idx_session_records_template_id ON tuttiud."SessionRecords"(template_id);
```

#### Update: `Students`
```sql
ALTER TABLE tuttiud."Students"
ADD COLUMN default_service_id UUID REFERENCES tuttiud."Services"(id);

CREATE INDEX idx_students_default_service_id ON tuttiud."Students"(default_service_id);
```

---

## Phase B: In-App Migration (Revised Strategy)

### Tasks Checklist
- [x] 1. Update `setup-sql.js` with new schema
- [x] 2. Create backend migration service
- [x] 3. Create backend endpoint `/api/admin/run-migration`
- [x] 4. Create Admin Settings UI component
- [x] 5. Integrate migration trigger into Settings page
- [ ] 6. Test migration flow end-to-end

### Migration Service Logic
**Function:** `migrate_legacy_data(tenantClient, orgId)`
1. **Schema Check:** Verify `Services` table exists, create if missing
2. **Data Extraction:** Find unique service names from existing data
3. **Population:** Insert Services records (deduplicate by name)
4. **Linking:** Update SessionRecords and Students with FKs
5. **Validation:** Return migration report with counts

### API Endpoint
- **Route:** `POST /api/admin/run-migration`
- **Auth:** Admin/Owner only
- **Returns:** Migration report (services created, records updated)
- **Safety:** Transaction-based, rollback on error

### UI Trigger
- **Location:** Admin Settings → System Updates section
- **Button:** "Upgrade Database to Multi-Service"
- **Behavior:** Show progress spinner, then success/error message
- **Display:** Migration report (services found, records migrated)

---

## Phase C: Logic & Rules

### Tasks Checklist
- [x] 1. Implement Service Selection Algorithm
- [x] 2. Implement Template Selection Algorithm
- [x] 3. Implement Data Inheritance Logic
- [x] 4. Backend API endpoints updated

### Service Selection Logic
**Status:** ✅ Complete  
**Algorithm:**
1. Check `Student.default_service_id` + Instructor authorization → Auto-select
2. Check Student Tags ∩ Instructor Types → If 1 match, auto-select
3. Fallback: Show radio button list

### Template Selection Logic
**Status:** ✅ Complete  
**Rules:**
- New Student (0 reports) → Default to `INTAKE` template
- Ongoing Student (>0 reports) → Default to `ONGOING` template + Data Inheritance
- Manual override available for `SUMMARY` or `CUSTOM`

---

## Phase D: Frontend UX

### Tasks Checklist
- [x] 1. Service selection UI (conditional visibility)
- [x] 2. Template selection UI (grouped by recommended/all)
- [x] 3. Data inheritance UI (pre-fill persistent fields)
- [ ] 4. Testing with real user flows

---

## Decisions & Notes

### Key Decisions Made
- Using UUID foreign keys for relational integrity
- `service_context` string column remains for legacy support
- `template_id` is nullable to support existing reports
- Migration script handles both SessionRecords and Students tables

### Questions for PM
- None yet

### Blockers
- None yet

---

## Deliverables Ready for Review

### Phase A: Database Schema ✅
- **File:** `src/lib/setup-sql.js` (updated)
- **Contents:**
  - Services table (org-scoped, name+linked_tag)
  - ReportTemplates table (service-scoped, system_type, structure_json)
  - SessionRecords updates (service_id, template_id)
  - Students updates (default_service_id)
- **Safety:** All columns nullable for backward compatibility

### Phase B: Migration Service ✅
- **File:** `api/_shared/migration-services.js`
- **Function:** `migrateLegacyServicesToRelational(tenantClient, orgId)`
- **Features:**
  - Auto-creates schema if missing (ADD COLUMN IF NOT EXISTS)
  - Extracts unique service names from existing data
  - Creates Service records with UUID generation
  - Links SessionRecords and Students to Services
  - Transaction-safe (auto-rollback on error)
  - Returns detailed migration report

### Phase B: API Endpoint (Next)
- **File:** `api/admin-run-migration/index.js`
- **Route:** POST /api/admin/run-migration
- **Security:** Admin/Owner role check

### What You Need to Review

1. **Schema Integration:** Check `setup-sql.js` additions
2. **Migration Logic:** Review `migration-services.js` function
3. **Next Steps:** Approve before I create the API endpoint and UI trigger

---

**Last Updated:** February 4, 2026 - Phase A & B.1 complete (schema + migration service)
## Deliverables Ready for Review

### Phase A: Database Schema ✅
- **File:** `scripts/migrate_services_schema.sql`
- **Contents:**
  - Services table (org-scoped, name+linked_tag)
  - ReportTemplates table (service-scoped, system_type, structure_json)
  - SessionRecords updates (service_id, template_id)
  - Students updates (default_service_id)
  - Helper function: `extract_unique_services()`
  - Verification queries
  - Rollback commands
- **Safety:** All columns nullable for backward compatibility

### Phase B: Migration Script ✅
- **File:** `scripts/migrate_services_to_relational.py`
- **Documentation:** `scripts/MIGRATION_GUIDE.md`
- **Features:**
  - Extracts unique service names from SessionRecords + Students
  - Creates Service records with auto-generated UUIDs
  - Updates SessionRecords.service_id (preserves service_context)
  - Updates Students.default_service_id (preserves default_service)
  - Transaction-safe (auto-rollback on error)
  - Dry-run mode for testing
  - Detailed progress reports
- **Instructions:** Step-by-step guide for 12-year-olds

### What You Need to Review

1. **Schema Design:** Does the `Services` and `ReportTemplates` structure match your vision?
2. **Migration Safety:** Are you comfortable with the transaction approach?
3. **Next Steps:** Should I proceed to Phase C (Backend Logic) or do you want to run the migration first?

---


### Blockers
- None yet

---

**Last Updated:** February 4, 2026 - Initial setup
