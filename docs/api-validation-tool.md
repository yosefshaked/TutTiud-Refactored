# API Endpoint Validation Tool

## Purpose
Validates all API endpoints for common configuration and import issues before deployment, catching multiple errors at once instead of discovering them one-by-one in production.

## Usage
```bash
npm run validate:api
```

## What It Checks

### Critical Errors (Will fail deployment)
1. **Import/Export Mismatches**
   - Validates that imported functions actually exist in the source module
   - Dynamically reads actual exports from `api/_shared/org-bff.js` and other shared modules
   - Example: Catches `import { checkOrgMembership }` when the actual export is `ensureMembership`

2. **Handler Signatures**
   - Ensures Azure Functions v4 handlers use correct parameter order: `(context, req)`
   - Example: Catches `function handler(req, context)` which causes runtime errors

3. **Deprecated Imports**
   - Detects usage of deprecated functions and modules
   - `checkOrgMembership` → Use `ensureMembership` instead
   - `../_shared/supabase-tenant.js` → Use `resolveTenantClient` from `org-bff.js`
   - `_shared/storage-drivers` → Use `../cross-platform/storage-drivers/index.js`

4. **Incorrect ensureMembership Usage**
   - Catches code expecting `{ role: string }` object when it returns role string directly
   - Example: `membership.role` should be just the `role` variable

5. **CommonJS/ESM Import Conflicts**
   - Detects incorrect named imports from CommonJS modules
   - Example: `import { parseMultipartData } from 'parse-multipart-data'` → should use default import
   - Provides correct fix: `import pkg from 'parse-multipart-data'; const { parseMultipartData } = pkg;`
   - Prevents Azure Functions runtime errors: "Named export not found"

6. **Storage Driver Paths**
   - Validates correct import path for storage drivers
   - Must use: `../cross-platform/storage-drivers/index.js`

### Warnings (Should review but not blocking)
1. **Missing Try-Catch**
   - `ensureMembership` calls should be wrapped in try-catch for error handling

2. **crypto.randomUUID() Usage**
   - Suggests using database `DEFAULT gen_random_uuid()` instead

3. **Response Format**
   - Suggests including explicit status codes in response objects

4. **Single-Parameter Handlers**
   - Some legacy handlers may only take one parameter

## Example Output

### Success
```
🔍 Validating API endpoints...

📊 Validation Results:

✅ All checks passed! No issues found.
```

### With Errors
```
🔍 Validating API endpoints...

📊 Validation Results:

❌ ERRORS (2):
  1. api\documents\index.js: Imports non-existent 'checkOrgMembership' from org-bff.js. Valid exports: ensureMembership, resolveTenantClient, readEnv, ...
  2. api\storage-test-connection\index.js: Incorrect handler signature. Expected (context, req), got (req, context)

⚠️  WARNINGS (3):
  1. api\instructor-files\index.js: Uses crypto.randomUUID(). Consider using database DEFAULT gen_random_uuid() instead
  2. api\org-documents\index.js: ensureMembership call not wrapped in try-catch for error handling
  3. api\student-files\index.js: Response objects should include explicit status code

❌ Validation failed. Fix errors before deploying.
```

## How It Works

1. **Dynamic Export Detection**
   - Reads actual exports from shared modules at runtime
   - Extracts `export function`, `export const`, and `export { ... }` declarations
   - No hardcoded list to maintain

2. **Pattern Matching**
   - Uses regex to parse import statements and handler signatures
   - Detects CommonJS `require()` usage in ES modules
   - Identifies deprecated patterns

3. **Comprehensive Scanning**
   - Recursively scans all `/api/**` directories
   - Validates every `index.js` endpoint file
   - Checks critical shared modules exist

## Integration in Workflow

### Before Deployment
```bash
# Check for API issues
npm run validate:api

# If errors found, fix them first
# If only warnings, review and deploy if acceptable

# Deploy
git push
```

### In CI/CD (Future)
Add to GitHub Actions or Azure Pipelines:
```yaml
- name: Validate API Endpoints
  run: npm run validate:api
```

## Benefits

1. **Catch Multiple Issues At Once**
   - No more fix-deploy-fail-fix-deploy cycle
   - See all problems in one run

2. **Prevent Production Errors**
   - Import errors caught before Azure deployment
   - Parameter order issues detected locally

3. **Enforce Best Practices**
   - Warnings guide developers to better patterns
   - Deprecation notices prevent technical debt

4. **Fast Feedback**
   - Runs in seconds locally
   - No need to deploy to discover issues

## Future Enhancements

- [ ] Validate RLS policy references in tenant client usage
- [ ] Check for missing audit logging on admin actions
- [ ] Validate environment variable usage
- [ ] Check for proper error handling patterns
- [ ] Integrate with pre-commit hooks
