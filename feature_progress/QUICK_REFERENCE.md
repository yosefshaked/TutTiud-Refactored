# Quick Reference: Multi-Service Dynamic Reports

## Files Created

```
feature_progress/
└── multi_service_reports.md          # Progress tracking

scripts/
├── migrate_services_schema.sql       # Database schema (run in Supabase)
├── migrate_services_to_relational.py # Data migration script
└── MIGRATION_GUIDE.md                # Step-by-step instructions
```

## Database Schema Summary

### New Tables

**`tuttiud.Services`**
- Primary entity for service types (e.g., "Therapeutic Horseback Riding")
- Org-scoped (one Services table per organization)
- Supports linking to student tags for auto-matching

**`tuttiud.ReportTemplates`**
- Form templates for each service
- Types: INTAKE, ONGOING, SUMMARY, CUSTOM
- Contains `structure_json` with form fields
- Fields can have `is_persistent: true` for data inheritance

### Updated Tables

**`tuttiud.SessionRecords`**
- Added: `service_id` (FK to Services)
- Added: `template_id` (FK to ReportTemplates)
- Preserves: `service_context` (string, for legacy)

**`tuttiud.Students`**
- Added: `default_service_id` (FK to Services)
- Preserves: `default_service` (string, for legacy)

## Migration Flow

```
Step 1: Schema Migration (SQL)
   ↓
Step 2: Extract unique service names
   ↓
Step 3: Create Service records
   ↓
Step 4: Update SessionRecords (link to Services)
   ↓
Step 5: Update Students (link to Services)
   ↓
Done! ✅
```

## Key Design Decisions

1. **Backward Compatible:** Old string columns remain untouched
2. **Nullable FKs:** New columns are nullable (gradual migration)
3. **Transaction Safe:** All changes rollback on error
4. **Dry Run Mode:** Test before applying changes
5. **Org-Scoped:** Each org has its own Services

## What's Next (After PM Approval)

### Phase C: Backend Logic
- Service selection algorithm
- Template selection algorithm
- Data inheritance logic
- API endpoint updates

### Phase D: Frontend UX
- Service picker (conditional)
- Template picker (grouped)
- Data inheritance UI (pre-fill)

---

**Current Status:** ✅ Schema + Migration Ready for Review  
**Waiting On:** PM approval to proceed to Phase C
