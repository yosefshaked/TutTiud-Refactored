/* eslint-env node */
/**
 * Storage Configuration Module
 * 
 * Cross-system storage profile management.
 * System-agnostic - reusable by TutTiud, Farm Management System, and future systems.
 */

export {
  validateByosCredentials,
  validateManagedConfig,
  validateStorageProfile,
  normalizeStorageProfile,
} from './validation.js';

/**
 * Storage mode constants
 */
export const STORAGE_MODES = {
  BYOS: 'byos',
  MANAGED: 'managed',
};

/**
 * Supported BYOS providers
 */
export const BYOS_PROVIDERS = {
  S3: 's3',
  AZURE: 'azure',
  GCS: 'gcs',
  R2: 'r2',
  GENERIC: 'generic',
};
