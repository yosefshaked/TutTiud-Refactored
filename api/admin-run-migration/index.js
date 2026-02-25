import { resolveBearerAuthorization } from '../_shared/http.js';
import { readSupabaseAdminConfig, createSupabaseAdminClient } from '../_shared/supabase-admin.js';
import {
  respond,
  readEnv,
  parseRequestBody,
  isAdminRole,
  ensureMembership,
  resolveTenantClient,
} from '../_shared/org-bff.js';
import { migrateLegacyServicesToRelational, checkMigrationNeeded } from '../_shared/migration-services.js';

/**
 * POST /api/admin/run-migration
 * 
 * Admin endpoint to migrate legacy service strings to relational model.
 * Requires admin/owner role.
 * 
 * Body: { org_id: string, check_only?: boolean }
 * 
 * Returns migration report or check status.
 */
export default async function handler(context, req) {
  const startTime = Date.now();
  const env = readEnv(context);

  // Extract and verify bearer token
  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    return respond(context, 401, { error: 'missing_auth' });
  }
  const token = authorization.token;

  // Parse request body
  const body = parseRequestBody(req);
  const { org_id: orgId, check_only: checkOnly = false } = body;

  if (!orgId) {
    return respond(context, 400, { error: 'missing_org_id' });
  }

  try {
    // Create control DB admin client for authentication and membership check
    const adminConfig = readSupabaseAdminConfig();
    const supabase = createSupabaseAdminClient(adminConfig);

    // Verify user authentication
    const authResult = await supabase.auth.getUser(token);
    if (authResult.error || !authResult.data?.user?.id) {
      return respond(context, 401, { error: 'invalid_token' });
    }
    const userId = authResult.data.user.id;

    // Check organization membership and role
    const role = await ensureMembership(supabase, orgId, userId);
    if (!role) {
      return respond(context, 403, { error: 'not_org_member' });
    }

    // Require admin or owner role
    if (!isAdminRole(role)) {
      return respond(context, 403, { error: 'insufficient_permissions', message: 'Admin or Owner role required' });
    }

    // Resolve tenant client using org-bff utilities
    const tenantResult = await resolveTenantClient(context, supabase, env, orgId);
    if (tenantResult.error) {
      return respond(context, tenantResult.error.status, tenantResult.error.body);
    }
    const tenantClient = tenantResult.client;

    // Check-only mode: just return whether migration is needed
    if (checkOnly) {
      const checkResult = await checkMigrationNeeded(tenantClient);
      return respond(context, 200, {
        check: checkResult,
        timestamp: new Date().toISOString()
      });
    }

    // Run the migration
    const migrationReport = await migrateLegacyServicesToRelational(tenantClient, orgId);

    const elapsed = Date.now() - startTime;

    return respond(context, 200, {
      ...migrationReport,
      elapsed_ms: elapsed
    });

  } catch (error) {
    context.log.error('Migration error:', error);
    return respond(context, 500, {
      error: 'migration_failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
