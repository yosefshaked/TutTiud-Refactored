/* eslint-env node */
import { json } from '../_shared/http.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readEnv(context) {
  if (context?.env && typeof context.env === 'object') {
    return context.env;
  }
  return process.env ?? {};
}

function respond(context, status, body, extraHeaders) {
  const response = json(status, body, extraHeaders);
  context.res = response;
  return response;
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function resolveEncryptionSecret(env) {
  const candidates = [
    env.APP_ORG_CREDENTIALS_ENCRYPTION_KEY,
    env.ORG_CREDENTIALS_ENCRYPTION_KEY,
    env.APP_SECRET_ENCRYPTION_KEY,
    env.APP_ENCRYPTION_KEY,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeString(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function decodeKeyMaterial(secret) {
  const attempts = [
    () => Buffer.from(secret, 'base64'),
    () => Buffer.from(secret, 'hex'),
  ];

  for (const attempt of attempts) {
    try {
      const buffer = attempt();
      if (buffer.length) {
        return buffer;
      }
    } catch {
      // ignore and try next format
    }
  }

  return Buffer.from(secret, 'utf8');
}

function deriveEncryptionKey(secret) {
  const normalized = normalizeString(secret);
  if (!normalized) {
    return null;
  }

  let keyBuffer = decodeKeyMaterial(normalized);

  if (keyBuffer.length < 32) {
    keyBuffer = createHash('sha256').update(keyBuffer).digest();
  }

  if (keyBuffer.length > 32) {
    keyBuffer = keyBuffer.subarray(0, 32);
  }

  if (keyBuffer.length < 32) {
    return null;
  }

  return keyBuffer;
}

function decryptDedicatedKey(payload, keyBuffer) {
  const normalized = normalizeString(payload);
  if (!normalized || !keyBuffer) {
    return null;
  }

  const segments = normalized.split(':');
  if (segments.length !== 5) {
    return null;
  }

  const [, mode, ivPart, authTagPart, cipherPart] = segments;
  if (mode !== 'gcm') {
    return null;
  }

  try {
    const iv = Buffer.from(ivPart, 'base64');
    const authTag = Buffer.from(authTagPart, 'base64');
    const cipherText = Buffer.from(cipherPart, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

function parseRequestBody(req) {
  if (req?.body && typeof req.body === 'object') {
    return req.body;
  }

  const rawBody = typeof req?.body === 'string'
    ? req.body
    : typeof req?.rawBody === 'string'
      ? req.rawBody
      : null;

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
}

function isValidOrgId(value) {
  return UUID_PATTERN.test(value);
}

function isAdminRole(role) {
  if (!role) {
    return false;
  }
  const normalized = String(role).trim().toLowerCase();
  return normalized === 'admin' || normalized === 'owner';
}

function createTenantClient({ supabaseUrl, anonKey, dedicatedKey }) {
  if (!supabaseUrl || !anonKey || !dedicatedKey) {
    throw new Error('Missing tenant connection parameters.');
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${dedicatedKey}`,
      },
    },
    db: {
      // All tenant data must live under the tuttiud schema. Avoid using public schema.
      schema: 'tuttiud',
    },
  });
}

async function fetchOrgConnection(supabase, orgId) {
  const [{ data: settings, error: settingsError }, { data: organization, error: orgError }] = await Promise.all([
    supabase
      .from('org_settings')
      .select('supabase_url, anon_key')
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('dedicated_key_encrypted')
      .eq('id', orgId)
      .maybeSingle(),
  ]);

  if (settingsError) {
    return { error: settingsError };
  }

  if (orgError) {
    return { error: orgError };
  }

  if (!settings || !settings.supabase_url || !settings.anon_key) {
    return { error: new Error('missing_connection_settings') };
  }

  if (!organization || !organization.dedicated_key_encrypted) {
    return { error: new Error('missing_dedicated_key') };
  }

  return {
    supabaseUrl: settings.supabase_url,
    anonKey: settings.anon_key,
    encryptedKey: organization.dedicated_key_encrypted,
  };
}

async function ensureMembership(supabase, orgId, userId) {
  const { data, error } = await supabase
    .from('org_memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return data.role || 'member';
}

function normalizeServicePayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const payload = { ...raw };
  if ('id' in payload) {
    delete payload.id;
  }
  return payload;
}

function normalizeServiceUpdates(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  return { ...raw };
}

function resolveServiceId(context, body) {
  const candidate = context.bindingData?.serviceId || body.service_id || body.serviceId || body.id;
  const normalized = normalizeString(candidate);
  if (normalized) {
    return normalized;
  }
  const numericId = Number(candidate);
  if (!Number.isNaN(numericId) && numericId > 0) {
    return numericId;
  }
  return null;
}

export default async function (context, _req) {
  // Legacy endpoint removed. This app no longer uses a Services table.
  const response = json(410, { message: 'legacy_unavailable', details: 'Services API has been retired.' });
  context.res = response;
  return response;
}
