/* eslint-env node */
import { Buffer } from 'node:buffer';
import { UUID_PATTERN, normalizeString } from './org-bff.js';

// Utility: estimate bytes of a JS value by JSON stringification
function estimateBytes(value) {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    return typeof s === 'string' ? Buffer.byteLength(s, 'utf8') : 0;
  } catch {
    return 0;
  }
}

export function isUUID(value) {
  const v = normalizeString(value);
  return Boolean(v && UUID_PATTERN.test(v));
}

export function isYMDDate(value) {
  const v = normalizeString(value);
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

export function isEmail(value) {
  const v = normalizeString(value).toLowerCase();
  if (!v) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

// Safe JSON parsing with body length awareness. Mode "observe" never rejects; "enforce" returns 413 via throw.
export function parseJsonBodyWithLimit(req, maxBytes = 131072, { mode = 'observe', context, endpoint } = {}) { // 128KB default
  let raw = null;
  if (typeof req?.rawBody === 'string') raw = req.rawBody;
  else if (typeof req?.body === 'string') raw = req.body;

  const length = raw ? Buffer.byteLength(raw, 'utf8') : estimateBytes(req?.body);

  if (length > maxBytes) {
    const msg = `${endpoint || 'api'} payload exceeded soft limit: ${length} > ${maxBytes}`;
    if (context?.log?.warn) context.log.warn(msg);
    else if (context?.log) context.log(msg);
    if (mode === 'enforce') {
      const err = new Error('payload_too_large');
      err.status = 413;
      throw err;
    }
  }

  if (raw) {
    try {
      const obj = JSON.parse(raw);
      return typeof obj === 'object' && obj ? obj : {};
    } catch {
      // Fall back to object body or empty
    }
  }

  return (req?.body && typeof req.body === 'object') ? req.body : {};
}

// ----- Sessions write validation (SOT) -----
function sanitizeAnswerValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? null : t;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((e) => (typeof e === 'string' ? (e.trim() || null) : e));
  if (typeof value === 'object') {
    const nested = {};
    for (const [k, v] of Object.entries(value)) {
      const nk = typeof k === 'string' ? k.trim() : '';
      if (!nk) continue;
      nested[nk] = sanitizeAnswerValue(v);
    }
    return nested;
  }
  return null;
}

function coerceSessionContent(source) {
  if (source === null || source === undefined) {
    return { error: 'missing_content' };
  }
  let payload = source;
  if (typeof payload === 'string') {
    const t = payload.trim();
    if (!t) return { value: {} };
    try { payload = JSON.parse(t); } catch { return { error: 'invalid_content' }; }
  }
  if (typeof payload !== 'object' || Array.isArray(payload)) return { error: 'invalid_content' };
  const normalized = {};
  for (const [k, v] of Object.entries(payload)) {
    const nk = typeof k === 'string' ? k.trim() : '';
    if (!nk) continue;
    if (v === undefined) continue;
    normalized[nk] = sanitizeAnswerValue(v);
  }
  return { value: normalized };
}

function coerceOptionalText(value) {
  if (value === null || value === undefined) return { value: null, valid: true };
  if (typeof value === 'string') return { value: value.trim() || null, valid: true };
  return { value: null, valid: false };
}

function resolveContentCandidate(body) {
  if (!body || typeof body !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(body, 'content')) return body.content;
  if (Object.prototype.hasOwnProperty.call(body, 'answers')) return body.answers;
  return undefined;
}

export function validateSessionWrite(body) {
  const studentId = normalizeString(body?.student_id || body?.studentId);
  if (!isUUID(studentId)) {
    return { error: 'invalid_student_id' };
  }

  const date = normalizeString(body?.date);
  if (!isYMDDate(date)) {
    return { error: 'invalid_date' };
  }

  const contentSource = resolveContentCandidate(body);
  const contentResult = coerceSessionContent(contentSource);
  if (contentResult.error) return { error: contentResult.error };

  const hasServiceField =
    Object.prototype.hasOwnProperty.call(body ?? {}, 'service_context') ||
    Object.prototype.hasOwnProperty.call(body ?? {}, 'serviceContext');

  const serviceResult = coerceOptionalText(body?.service_context ?? body?.serviceContext);
  if (!serviceResult.valid) return { error: 'invalid_service_context' };

  return {
    studentId,
    date,
    content: contentResult.value,
    serviceContext: serviceResult.value,
    hasExplicitService: hasServiceField,
  };
}

// ----- Instructors write validation (SOT) -----
const PHONE_PATTERN = /^[0-9+\-()\s]{6,20}$/;

export function validateInstructorCreate(body) {
  const userId = normalizeString(body?.user_id || body?.userId);
  if (!isUUID(userId)) {
    return { error: 'missing_user_id' };
  }

  const name = normalizeString(body?.name) || '';
  const emailRaw = normalizeString(body?.email).toLowerCase();
  const email = emailRaw ? (isEmail(emailRaw) ? emailRaw : null) : '';
  const phoneRaw = normalizeString(body?.phone);
  const phone = phoneRaw ? (PHONE_PATTERN.test(phoneRaw) ? phoneRaw : null) : '';
  const notes = normalizeString(body?.notes) || '';

  return {
    userId,
    // empty strings mean "not provided"; nulls mean "provided but invalid"
    name,
    email,
    phone,
    notes,
  };
}

export function validateInstructorUpdate(body) {
  const instructorId = normalizeString(body?.id || body?.instructor_id || body?.instructorId);
  if (!isUUID(instructorId)) {
    return { error: 'missing_instructor_id' };
  }

  const updates = {};
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const v = normalizeString(body.name);
    updates['name'] = v || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    const v = normalizeString(body.email).toLowerCase();
    updates.email = v ? (isEmail(v) ? v : null) : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
    const v = normalizeString(body.phone);
    updates.phone = v ? (PHONE_PATTERN.test(v) ? v : null) : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    const v = normalizeString(body.notes);
    updates.notes = v || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
    updates.is_active = Boolean(body.is_active);
  }

  return { instructorId, updates };
}
