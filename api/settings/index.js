/* eslint-env node */
import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  ensureMembership,
  isAdminRole,
  normalizeString,
  parseRequestBody,
  readEnv,
  respond,
  resolveOrgId,
  resolveTenantClient,
} from '../_shared/org-bff.js';
import { normalizeSessionFormConfigValue, normalizeSessionFormQuestion } from '../_shared/settings-utils.js';

const SETTINGS_DIAGNOSTIC_CHECKS = new Set([
  'Table "Settings" exists',
  'RLS enabled on "Settings"',
  'Policy "Allow full access to authenticated users on Settings" on "Settings" exists',
]);

function isSchemaOrPolicyError(error) {
  if (!error) {
    return false;
  }
  const code = error.code || error.details;
  if (code === '42P01' || code === '42501') {
    return true;
  }
  const message = String(error.message || error.details || '').toLowerCase();
  if (!message) {
    return false;
  }
  if (message.includes('relation') && message.includes('settings')) {
    return true;
  }
  if (message.includes('permission denied') && message.includes('settings')) {
    return true;
  }
  return false;
}

async function verifySettingsInfrastructure(context, tenantClient) {
  const { data, error } = await tenantClient
    .rpc('tuttiud.setup_assistant_diagnostics');

  if (error) {
    context.log?.error?.('settings diagnostics failed', { message: error.message });
    return {
      status: 424,
      body: {
        message: 'settings_schema_unverified',
        reason: 'diagnostics_failed',
      },
    };
  }

  const relevantChecks = Array.isArray(data)
    ? data.filter((entry) => entry && SETTINGS_DIAGNOSTIC_CHECKS.has(entry.check_name))
    : [];

  const failing = relevantChecks.filter((entry) => entry && entry.success === false);

  if (failing.length) {
    return {
      status: 424,
      body: {
        message: 'settings_schema_incomplete',
        diagnostics: failing.map((entry) => ({
          check: entry.check_name,
          details: entry.details,
        })),
      },
    };
  }

  return null;
}

async function mapSettingsError(context, tenantClient, error, fallbackMessage) {
  if (isSchemaOrPolicyError(error)) {
    const infrastructureError = await verifySettingsInfrastructure(context, tenantClient);
    if (infrastructureError) {
      return infrastructureError;
    }
  }

  return {
    status: 500,
    body: { message: fallbackMessage },
  };
}

function normalizeSettingsObject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const source = typeof raw.settings === 'object' && !Array.isArray(raw.settings) ? raw.settings : raw;
  const entries = Object.entries(source);
  const payload = [];

  for (const [key, value] of entries) {
    const normalizedKey = normalizeString(key);
    if (!normalizedKey) {
      continue;
    }
    payload.push({ key: normalizedKey, settings_value: value ?? null });
  }

  if (!payload.length) {
    return null;
  }

  return payload;
}

function normalizeKeyList(candidate) {
  const result = [];

  function pushValue(value) {
    if (typeof value !== 'string') {
      return;
    }
    const segments = value.split(',');
    for (const segment of segments) {
      const normalized = normalizeString(segment);
      if (normalized) {
        result.push(normalized);
      }
    }
  }

  if (Array.isArray(candidate)) {
    for (const value of candidate) {
      pushValue(typeof value === 'string' ? value : String(value ?? ''));
    }
  } else if (candidate !== null && candidate !== undefined) {
    pushValue(String(candidate));
  }

  return Array.from(new Set(result));
}

function collectKeysFromBody(body) {
  if (!body || typeof body !== 'object') {
    return [];
  }

  if (Array.isArray(body.keys)) {
    return normalizeKeyList(body.keys);
  }

  if (body.key !== undefined && body.key !== null) {
    return normalizeKeyList(body.key);
  }

  return [];
}

function collectKeysFromQuery(query) {
  if (!query || typeof query !== 'object') {
    return [];
  }

  const bucket = [];
  if (Object.prototype.hasOwnProperty.call(query, 'key')) {
    bucket.push(query.key);
  }
  if (Object.prototype.hasOwnProperty.call(query, 'keys')) {
    bucket.push(query.keys);
  }

  if (!bucket.length) {
    return [];
  }

  return normalizeKeyList(bucket.length === 1 ? bucket[0] : bucket);
}


function extractSessionFormVersion(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  let payload = value;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) {
      return 0;
    }
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return 0;
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 0;
  }

  const candidate = Object.prototype.hasOwnProperty.call(payload, 'version') ? payload.version : null;
  if (candidate === null || candidate === undefined) {
    return 0;
  }

  const numeric = typeof candidate === 'number'
    ? candidate
    : Number.parseInt(String(candidate).trim(), 10);

  if (Number.isInteger(numeric) && numeric >= 0) {
    return numeric;
  }

  return 0;
}

async function applySessionFormVersioning(tenantClient, entries, existingSettings = null) {
  const targetIndex = entries.findIndex((entry) => entry.key === 'session_form_config');
  if (targetIndex === -1) {
    return { entries };
  }

  const normalized = normalizeSessionFormConfigValue(entries[targetIndex].settings_value);
  if (normalized.error) {
    return { error: normalized.error };
  }

  let currentVersion = 0;
  if (existingSettings && existingSettings.has('session_form_config')) {
    currentVersion = extractSessionFormVersion(existingSettings.get('session_form_config'));
  } else {
    const { data, error } = await tenantClient
      .from('Settings')
      .select('settings_value')
      .eq('key', 'session_form_config')
      .maybeSingle();

    if (error) {
      return { error: 'failed_to_load_session_form_config', supabaseError: error };
    }

    currentVersion = extractSessionFormVersion(data?.settings_value);
  }

  const nextVersion = currentVersion + 1;

  entries[targetIndex].settings_value = {
    version: nextVersion,
    questions: normalized.questions,
  };

  return { entries, version: nextVersion };
}

export default async function (context, req) {
  context.log?.info?.('settings API invoked');

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('settings missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);

  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('settings missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const supabase = createSupabaseAdminClient(adminConfig);

  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('settings failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    context.log?.warn?.('settings token did not resolve to user');
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  const userId = authResult.data.user.id;
  const method = String(req.method || 'GET').toUpperCase();
  const body = method === 'GET' ? {} : parseRequestBody(req);
  const orgId = resolveOrgId(req, body);

  if (!orgId) {
    return respond(context, 400, { message: 'invalid org id' });
  }

  let role;
  try {
    role = await ensureMembership(supabase, orgId, userId);
  } catch (membershipError) {
    context.log?.error?.('settings failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  if (!role) {
    return respond(context, 403, { message: 'forbidden' });
  }

  if ((method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE') && !isAdminRole(role)) {
    return respond(context, 403, { message: 'forbidden' });
  }

  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, supabase, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  const query = req?.query ?? {};

  if (method === 'GET') {
    const requestedKeys = collectKeysFromQuery(query);
    let builder = tenantClient
      .from('Settings')
      .select('key, settings_value');

    if (requestedKeys.length) {
      builder = builder.in('key', requestedKeys);
    }

    const { data, error } = await builder;

    if (error) {
      context.log?.error?.('settings fetch failed', { message: error.message });
      const mapped = await mapSettingsError(context, tenantClient, error, 'failed_to_fetch_settings');
      return respond(context, mapped.status, mapped.body);
    }

    const settingsMap = {};
    for (const entry of data || []) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const key = normalizeString(entry.key);
      if (!key) {
        continue;
      }
      settingsMap[key] = entry.settings_value ?? null;
    }

    if (requestedKeys.length) {
      for (const key of requestedKeys) {
        if (!Object.prototype.hasOwnProperty.call(settingsMap, key)) {
          settingsMap[key] = null;
        }
      }
    }

    return respond(context, 200, { settings: settingsMap });
  }

  if (method === 'POST') {
    let payload = normalizeSettingsObject(body);
    if (!payload) {
      return respond(context, 400, { message: 'invalid settings payload' });
    }

    const sessionFormResult = await applySessionFormVersioning(tenantClient, payload);
    if (sessionFormResult.error) {
      if (sessionFormResult.error === 'failed_to_load_session_form_config' && sessionFormResult.supabaseError) {
        const mapped = await mapSettingsError(
          context,
          tenantClient,
          sessionFormResult.supabaseError,
          'failed_to_load_session_form_config',
        );
        return respond(context, mapped.status, mapped.body);
      }
      if (sessionFormResult.error !== 'invalid_session_form_config') {
        context.log?.error?.('settings failed to prepare session form config', {
          reason: sessionFormResult.error,
        });
      }
      const status = sessionFormResult.error === 'invalid_session_form_config' ? 400 : 500;
      const message = sessionFormResult.error === 'invalid_session_form_config'
        ? 'invalid session form config'
        : 'failed_to_load_session_form_config';
      return respond(context, status, { message });
    }

    payload = sessionFormResult.entries;

    const { error } = await tenantClient
      .from('Settings')
      .upsert(payload, { onConflict: 'key' });

    if (error) {
      context.log?.error?.('settings upsert failed', { message: error.message });
      const mapped = await mapSettingsError(context, tenantClient, error, 'failed_to_update_settings');
      return respond(context, mapped.status, mapped.body);
    }

    return respond(context, 201, { updated: true, count: payload.length });
  }

  if (method === 'PUT' || method === 'PATCH') {
    let payload = normalizeSettingsObject(body);
    if (!payload) {
      return respond(context, 400, { message: 'invalid settings payload' });
    }

    const keys = payload.map((entry) => entry.key);
    const { data: existing, error: existingError } = await tenantClient
      .from('Settings')
      .select('key, settings_value')
      .in('key', keys);

    if (existingError) {
      context.log?.error?.('settings lookup failed before update', { message: existingError.message });
      const mapped = await mapSettingsError(context, tenantClient, existingError, 'failed_to_update_settings');
      return respond(context, mapped.status, mapped.body);
    }

    const existingMap = new Map();
    for (const row of existing || []) {
      if (!row || typeof row !== 'object') {
        continue;
      }
      const key = normalizeString(row.key);
      if (!key) {
        continue;
      }
      existingMap.set(key, row.settings_value ?? null);
    }

    const existingKeys = new Set(existingMap.keys());
    const missingKeys = keys.filter((key) => !existingKeys.has(key));

    if (missingKeys.length) {
      return respond(context, 404, { message: 'settings_not_found', keys: missingKeys });
    }

    const sessionFormResult = await applySessionFormVersioning(tenantClient, payload, existingMap);
    if (sessionFormResult.error) {
      if (sessionFormResult.error === 'failed_to_load_session_form_config' && sessionFormResult.supabaseError) {
        const mapped = await mapSettingsError(
          context,
          tenantClient,
          sessionFormResult.supabaseError,
          'failed_to_load_session_form_config',
        );
        return respond(context, mapped.status, mapped.body);
      }
      if (sessionFormResult.error !== 'invalid_session_form_config') {
        context.log?.error?.('settings failed to prepare session form config', {
          reason: sessionFormResult.error,
        });
      }
      const status = sessionFormResult.error === 'invalid_session_form_config' ? 400 : 500;
      const message = sessionFormResult.error === 'invalid_session_form_config'
        ? 'invalid session form config'
        : 'failed_to_load_session_form_config';
      return respond(context, status, { message });
    }

    payload = sessionFormResult.entries;

    const { error } = await tenantClient
      .from('Settings')
      .upsert(payload, { onConflict: 'key' });

    if (error) {
      context.log?.error?.('settings update failed', { message: error.message });
      const mapped = await mapSettingsError(context, tenantClient, error, 'failed_to_update_settings');
      return respond(context, mapped.status, mapped.body);
    }

    return respond(context, 200, { updated: true, count: payload.length });
  }

  if (method === 'DELETE') {
    const keysFromBody = collectKeysFromBody(body);
    const keysFromQuery = collectKeysFromQuery(query);
    const keys = Array.from(new Set([...keysFromBody, ...keysFromQuery]));

    if (!keys.length) {
      return respond(context, 400, { message: 'missing settings keys' });
    }

    const { data, error } = await tenantClient
      .from('Settings')
      .delete()
      .in('key', keys)
      .select('key');

    if (error) {
      context.log?.error?.('settings delete failed', { message: error.message });
      const mapped = await mapSettingsError(context, tenantClient, error, 'failed_to_delete_settings');
      return respond(context, mapped.status, mapped.body);
    }

    if (!data || !data.length) {
      return respond(context, 404, { message: 'settings_not_found' });
    }

    return respond(context, 200, { deleted: data.map((entry) => entry.key) });
  }

  return respond(context, 405, { message: 'method_not_allowed' }, { Allow: 'GET,POST,PUT,PATCH,DELETE' });
}

