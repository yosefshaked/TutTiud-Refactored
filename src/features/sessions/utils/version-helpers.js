import { parseSessionFormConfig } from './form-config.js';

/**
 * Extract questions for a specific form version from session form config
 * Handles both legacy array format and new versioned format with current/history
 * Returns normalized questions (with key, label, etc.) ready for use in UI
 * 
 * @param {*} formConfig - The session form configuration (from Settings)
 * @param {number|null} version - The form version to retrieve (null/undefined = use current)
 * @returns {Array} Array of normalized question objects
 */
export function getQuestionsForVersion(formConfig, version) {
  if (!formConfig) {
    return [];
  }

  // Parse if string
  let config = formConfig;
  if (typeof formConfig === 'string') {
    try {
      config = JSON.parse(formConfig);
    } catch {
      return [];
    }
  }

  // Legacy format: array of questions (no versioning) - normalize and return
  if (Array.isArray(config)) {
    return parseSessionFormConfig(config);
  }

  // New format: object with current and optional history
  if (config && typeof config === 'object') {
    // If no version specified or version is null/undefined, use current (entire config)
    if (version === null || version === undefined) {
      // Just pass the entire config to parseSessionFormConfig - it knows how to handle it
      return parseSessionFormConfig(config);
    }

    // Check if requested version matches current version
    if (config.current && typeof config.current === 'object') {
      const currentVersion = config.current.version ?? config.version;
      if (currentVersion === version) {
        // Return the entire config so parseSessionFormConfig can extract current.questions
        return parseSessionFormConfig(config);
      }
    }

    // Search in history for the requested version
    if (Array.isArray(config.history)) {
      for (const historyEntry of config.history) {
        if (historyEntry.version === version && Array.isArray(historyEntry.questions)) {
          // Normalize the historical questions
          return parseSessionFormConfig(historyEntry.questions);
        }
      }
    }

    // Fallback to current if version not found in history
    return parseSessionFormConfig(config);
  }

  return [];
}

/**
 * Extract form version from session metadata
 * 
 * @param {Object} session - Session record object
 * @returns {number|null} The form version number, or null if not found
 */
export function getSessionFormVersion(session) {
  return session?.metadata?.form_version ?? null;
}
