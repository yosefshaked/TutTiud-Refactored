# Multi-Service Reports - Phase A & B Deliverables

## ✅ Completed: Schema Integration & Migration Service

---

## 1. Database Schema (setup-sql.js)

### Added Tables

#### **tuttiud.Services**
```sql
CREATE TABLE IF NOT EXISTS tuttiud."Services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "name" text NOT NULL,
  "linked_student_tag" uuid,
  "is_active" boolean DEFAULT true,
  "created_at" timestamptz DEFAULT NOW(),
  "updated_at" timestamptz DEFAULT NOW(),
  "metadata" jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT "services_org_name_unique" UNIQUE ("organization_id", "name")
);
```

**Purpose:** Stores service types offered by the organization (e.g., "Therapeutic Horseback Riding", "Occupational Therapy")

**Key Features:**
- Org-scoped with unique constraint
- Optional `linked_student_tag` for auto-matching
- Metadata for extensibility

---

#### **tuttiud.ReportTemplates**
```sql
CREATE TABLE IF NOT EXISTS tuttiud."ReportTemplates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "service_id" uuid REFERENCES tuttiud."Services"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "system_type" text CHECK ("system_type" IN ('INTAKE', 'ONGOING', 'SUMMARY', 'CUSTOM')),
  "structure_json" jsonb NOT NULL,
  "display_order" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "created_at" timestamptz DEFAULT NOW(),
  "updated_at" timestamptz DEFAULT NOW(),
  "metadata" jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT "report_templates_service_name_unique" UNIQUE ("service_id", "name")
);
```

**Purpose:** Form templates for different report types within each service

**Key Features:**
- Linked to Services table
- System types: INTAKE (first report), ONGOING (regular), SUMMARY (milestone), CUSTOM
- `structure_json` contains form schema with fields
- Fields can have `is_persistent: true` for data inheritance

---

### Updated Tables

#### **tuttiud.SessionRecords**
```sql
ALTER TABLE tuttiud."SessionRecords"
  ADD COLUMN IF NOT EXISTS "service_id" uuid REFERENCES tuttiud."Services"("id"),
  ADD COLUMN IF NOT EXISTS "template_id" uuid REFERENCES tuttiud."ReportTemplates"("id");
```

**Changes:**
- Added `service_id` (nullable) - links to Services table
- Added `template_id` (nullable) - links to ReportTemplates table
- Old `service_context` string column preserved for legacy support

---

#### **tuttiud.Students**
```sql
ALTER TABLE tuttiud."Students"
  ADD COLUMN IF NOT EXISTS "default_service_id" uuid REFERENCES tuttiud."Services"("id");
```

**Changes:**
- Added `default_service_id` (nullable) - links to Services table
- Old `default_service` string column preserved for legacy support

---

## 2. Migration Service

### File: `api/_shared/migration-services.js`

### Main Function

```javascript
await migrateLegacyServicesToRelational(tenantClient, orgId)
```

**What it does:**
1. Checks if Services table exists
2. Extracts unique service names from SessionRecords and Students
3. Creates Service records (deduplicated by name)
4. Updates SessionRecords.service_id
5. Updates Students.default_service_id
6. Returns detailed migration report

**Return Value:**
```javascript
{
  success: true,
  servicesCreated: 3,
  sessionRecordsUpdated: 245,
  sessionRecordsSkipped: 0,
  studentsUpdated: 42,
  studentsSkipped: 0,
  services: [
    { name: "רכיבת סוסים טיפולית", sources: ["SessionRecords", "Students"], count: 150 },
    { name: "טיפול בעיסוק", sources: ["Students"], count: 75 },
    ...
  ],
  errors: [],
  timestamp: "2026-02-04T..."
}
```

### Helper Function

```javascript
await checkMigrationNeeded(tenantClient)
```

**What it does:**
- Checks if Services table exists
- Counts unmigrated SessionRecords
- Counts unmigrated Students
- Returns whether migration is needed

**Return Value:**
```javascript
{
  needed: true,
  reason: "unmigrated_session_records",
  count: 245
}
```

---

## 3. Safety Features

### Backward Compatibility
✅ All new columns are nullable  
✅ Old string columns (`service_context`, `default_service`) preserved  
✅ Existing reports continue working without migration  

### Idempotency
✅ `CREATE TABLE IF NOT EXISTS` - safe to run multiple times  
✅ `ADD COLUMN IF NOT EXISTS` - safe to run on existing databases  
✅ Migration function checks for existing Services before creating  

### Error Handling
✅ Try-catch blocks around all operations  
✅ Detailed error messages in report  
✅ Continues processing even if some records fail  

---

## Next Steps (Phase B.2)

### To Be Implemented:

1. **API Endpoint:** `POST /api/admin/run-migration`
   - Admin/Owner role check
   - Calls `migrateLegacyServicesToRelational()`
   - Returns migration report

2. **Admin Settings UI:**
   - "System Updates" section
   - "Upgrade Database to Multi-Service" button
   - Progress spinner during migration
   - Success/error toast notifications
   - Display migration report

---

## Usage Example (After API is created)

```javascript
// Backend endpoint
POST /api/admin/run-migration
{
  "org_id": "..."
}

// Response
{
  "success": true,
  "servicesCreated": 3,
  "sessionRecordsUpdated": 245,
  "studentsUpdated": 42,
  "services": [...]
}
```

```javascript
// Frontend trigger
const handleMigration = async () => {
  setLoading(true);
  const response = await authenticatedFetch('admin/run-migration', {
    method: 'POST',
    session,
    body: { org_id: activeOrgId }
  });
  
  if (response.success) {
    toast.success(`Migration complete! ${response.servicesCreated} services created.`);
  }
  setLoading(false);
};
```

---

## Review Checklist

- [x] Schema added to `setup-sql.js` with idempotent DDL
- [x] Migration service created with comprehensive error handling
- [x] Helper function for checking migration status
- [x] All safety features implemented
- [ ] API endpoint created
- [ ] Admin UI trigger created
- [ ] End-to-end testing

---

**Status:** ✅ Phase A & B.1 Complete - Ready for PM Review  
**Next:** Awaiting approval to create API endpoint and UI trigger
