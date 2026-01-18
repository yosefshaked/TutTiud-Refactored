/* eslint-env node */
import process from 'node:process';

const PASSWORD_RESET_HASH_PATH = '#/update-password';

function normalizeSource(source) {
  if (source?.env && typeof source.env === 'object') {
    return source.env;
  }
  return source ?? {};
}

function tryParseUrl(candidate) {
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function resolveBaseHref(context, req) {
  const env = normalizeSource(context);
  const fallbackEnv = normalizeSource(process?.env);
  const envCandidates = [
    env.VITE_PUBLIC_APP_URL,
    env.VITE_APP_BASE_URL,
    env.VITE_SITE_URL,
    fallbackEnv.VITE_PUBLIC_APP_URL,
    fallbackEnv.VITE_APP_BASE_URL,
    fallbackEnv.VITE_SITE_URL,
  ].filter(Boolean);

  for (const candidate of envCandidates) {
    const parsed = tryParseUrl(String(candidate));
    if (parsed) {
      const basePath = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/$/, '') : '';
      return `${parsed.origin}${basePath}`;
    }
  }

  const headers = req?.headers || {};
  const xfProto = headers['x-forwarded-proto'] || headers['X-Forwarded-Proto'] || null;
  const xfHost = headers['x-forwarded-host'] || headers['X-Forwarded-Host'] || headers.host || headers.Host || null;
  const proto = typeof xfProto === 'string' && xfProto ? xfProto : (headers['x-arr-ssl'] ? 'https' : 'https');
  if (typeof xfHost === 'string' && xfHost) {
    return `${proto}://${xfHost}`;
  }

  return null;
}

export function resolvePasswordResetRedirect(context, req) {
  const baseHref = resolveBaseHref(context, req);
  if (!baseHref) {
    return null;
  }
  const sanitizedBase = baseHref.split('#')[0].replace(/\/+$/, '');
  return `${sanitizedBase}/${PASSWORD_RESET_HASH_PATH}`;
}
