/* eslint-env node */
/**
 * Shared student validation and coercion utilities
 * Used by /api/students and /api/students-maintenance-import
 * 
 * Note: These functions return {value, valid, provided?} objects for consistency
 * with the maintenance import CSV processing flow.
 */

import { UUID_PATTERN } from './org-bff.js';

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)?$/;
const ISRAELI_PHONE_PATTERN = /^(?:0(?:5[0-9]|[2-4|8-9][0-9])-?\d{7}|(?:\+?972-?)?5[0-9]-?\d{7})$/;
const NATIONAL_ID_PATTERN = /^\d{5,12}$/;

export function validateIsraeliPhone(value) {
  if (value === null || value === undefined) {
    return { value: null, valid: true };
  }
  
  if (typeof value !== 'string') {
    return { value: null, valid: false };
  }
  
  let trimmed = value.trim();
  if (!trimmed) {
    return { value: null, valid: true };
  }
  
  // Handle Excel text formula format: ="0546341150"
  if (trimmed.startsWith('="') && trimmed.endsWith('"')) {
    trimmed = trimmed.slice(2, -1);
  }
  
  const normalized = trimmed.replace(/[\s-]/g, '');
  if (ISRAELI_PHONE_PATTERN.test(normalized)) {
    return { value: trimmed, valid: true };
  }
  
  return { value: null, valid: false };
}

export function coerceNationalId(raw) {
  if (raw === null || raw === undefined) {
    return { value: null, valid: true, provided: false };
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { value: null, valid: true, provided: true };
    }
    if (NATIONAL_ID_PATTERN.test(trimmed)) {
      return { value: trimmed, valid: true, provided: true };
    }
  }

  return { value: null, valid: false, provided: true };
}

export function coerceOptionalText(value) {
  if (value === null || value === undefined) {
    return { value: null, valid: true };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return { value: trimmed || null, valid: true };
  }
  return { value: null, valid: false };
}

export function coerceBooleanFlag(raw, { defaultValue = null, allowUndefined = true } = {}) {
  if (raw === undefined) {
    return { value: defaultValue, valid: allowUndefined, provided: false };
  }

  if (raw === null) {
    return { value: defaultValue, valid: false, provided: true };
  }

  if (typeof raw === 'boolean') {
    return { value: raw, valid: true, provided: true };
  }

  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) {
      return { value: defaultValue, valid: false, provided: true };
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y' || normalized === 'on' || normalized === 'כן') {
      return { value: true, valid: true, provided: true };
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n' || normalized === 'off' || normalized === 'לא') {
      return { value: false, valid: true, provided: true };
    }
    return { value: defaultValue, valid: false, provided: true };
  }

  if (typeof raw === 'number') {
    if (raw === 1) {
      return { value: true, valid: true, provided: true };
    }
    if (raw === 0) {
      return { value: false, valid: true, provided: true };
    }
  }

  return { value: defaultValue, valid: false, provided: true };
}

export function coerceDayOfWeek(value) {
  if (value === null || value === undefined || value === '') {
    return { value: null, valid: true };
  }

  // Hebrew day name mapping
  const hebrewDays = {
    'ראשון': 0,
    'שני': 1,
    'שלישי': 2,
    'רביעי': 3,
    'חמישי': 4,
    'שישי': 5,
    'שבת': 6,
  };

  const str = String(value).trim();
  
  // Try Hebrew day name first
  if (hebrewDays[str] !== undefined) {
    return { value: hebrewDays[str], valid: true };
  }

  // Try numeric (1-7 or 0-6)
  const numeric = typeof value === 'number' ? value : Number.parseInt(str, 10);

  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) {
    return { value: numeric, valid: true };
  }
  
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 7) {
    return { value: numeric - 1, valid: true }; // Convert 1-7 to 0-6
  }

  return { value: null, valid: false };
}

export function coerceSessionTime(value) {
  if (value === null || value === undefined || value === '') {
    return { value: null, valid: true };
  }

  if (typeof value !== 'string') {
    return { value: null, valid: false };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null, valid: true };
  }

  if (TIME_PATTERN.test(trimmed)) {
    return { value: trimmed, valid: true };
  }

  return { value: null, valid: false };
}

export function coerceTags(value) {
  if (value === null || value === undefined) {
    return { value: null, valid: true };
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
    return { value: normalized.length ? normalized : null, valid: true };
  }

  if (typeof value === 'string') {
    const normalized = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return { value: normalized.length ? normalized : null, valid: true };
  }

  return { value: null, valid: false };
}

export function validateAssignedInstructor(candidate) {
  if (candidate === null) {
    return { value: null, valid: true };
  }
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) {
      return { value: null, valid: true };
    }
    if (UUID_PATTERN.test(trimmed)) {
      return { value: trimmed, valid: true };
    }
  }
  return { value: null, valid: false };
}
