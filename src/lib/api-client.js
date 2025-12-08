import { getAuthClient } from '@/lib/supabase-manager.js';

async function resolveBearerToken() {
  const authClient = getAuthClient();
  const { data, error } = await authClient.auth.getSession();

  if (error) {
    throw new Error('Authentication token not found.');
  }

  const token = data?.session?.access_token || null;

  if (!token) {
    throw new Error('Authentication token not found.');
  }

  return token;
}

function createAuthorizationHeaders(customHeaders = {}, bearer, { includeJsonContentType = false } = {}) {
  const headers = includeJsonContentType
    ? { 'Content-Type': 'application/json', ...customHeaders }
    : { ...customHeaders };

  headers.Authorization = bearer;
  headers.authorization = bearer;
  headers['X-Supabase-Authorization'] = bearer;
  headers['x-supabase-authorization'] = bearer;
  headers['x-supabase-auth'] = bearer;

  return headers;
}

export async function authenticatedFetch(path, { session: _session, accessToken: _accessToken, ...options } = {}) {
  void _session; void _accessToken;
  const token = await resolveBearerToken();
  const bearer = `Bearer ${token}`;

  const { headers: customHeaders = {}, body, ...rest } = options;
  const headers = createAuthorizationHeaders(customHeaders, bearer, { includeJsonContentType: true });

  let requestBody = body;
  if (requestBody && typeof requestBody === 'object' && !(requestBody instanceof FormData)) {
    requestBody = JSON.stringify(requestBody);
  }

  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const response = await fetch(`/api/${normalizedPath}`, {
    ...rest,
    headers,
    body: requestBody,
  });

  let payload = null;
  const contentType = response.headers?.get?.('content-type') || response.headers?.get?.('Content-Type') || '';
  const isJson = typeof contentType === 'string' && contentType.toLowerCase().includes('application/json');
  if (isJson) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message = payload?.message || 'An API error occurred';
    const error = new Error(message);
    error.status = response.status;
    if (payload) {
      error.data = payload;
    }
    throw error;
  }

  return payload;
}

export async function authenticatedFetchBlob(path, { session: _session, accessToken: _accessToken, ...options } = {}) {
  void _session; void _accessToken;
  const token = await resolveBearerToken();
  const bearer = `Bearer ${token}`;

  const { headers: customHeaders = {}, ...rest } = options;
  const headers = createAuthorizationHeaders(customHeaders, bearer, { includeJsonContentType: false });

  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const response = await fetch(`/api/${normalizedPath}`, {
    ...rest,
    headers,
  });

  if (!response.ok) {
    let message = 'An API error occurred';
    try {
      const text = await response.text();
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && typeof parsed.message === 'string') {
        message = parsed.message;
      }
    } catch {
      // Ignore parse errors
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.blob();
}

export async function authenticatedFetchText(path, { session: _session, accessToken: _accessToken, ...options } = {}) {
  void _session; void _accessToken;
  const token = await resolveBearerToken();
  const bearer = `Bearer ${token}`;

  const { headers: customHeaders = {}, ...rest } = options;
  const headers = createAuthorizationHeaders(customHeaders, bearer, { includeJsonContentType: false });

  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const response = await fetch(`/api/${normalizedPath}`, {
    ...rest,
    headers,
  });

  const text = await response.text();

  if (!response.ok) {
    let message = 'An API error occurred';
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && typeof parsed.message === 'string') {
        message = parsed.message;
      }
    } catch {
      // ignore JSON parsing failures
    }

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return text;
}
