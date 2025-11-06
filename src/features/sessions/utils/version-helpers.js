/**
 * Extract questions for a specific form version from session form config
 * Handles both legacy array format and new versioned format with current/history
 * 
 * @param {*} formConfig - The session form configuration (from Settings)
 * @param {number|null} version - The form version to retrieve (null/undefined = use current)
 * @returns {Array} Array of question objects
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

  // Legacy format: array of questions (no versioning)
  if (Array.isArray(config)) {
    return config;
  }

  // New format: object with current and optional history
  if (config && typeof config === 'object') {
    // If no version specified or version is null/undefined, use current
    if (version === null || version === undefined) {
      // Handle both config.current.questions and config.questions for backwards compatibility
      if (config.current && Array.isArray(config.current.questions)) {
        return config.current.questions;
      }
      if (Array.isArray(config.questions)) {
        return config.questions;
      }
      if (Array.isArray(config.current)) {
        return config.current;
      }
      return [];
    }

    // Check current version first
    if (config.current) {
      const currentVersion = config.current.version ?? config.version;
      if (currentVersion === version) {
        if (Array.isArray(config.current.questions)) {
          return config.current.questions;
        }
        if (Array.isArray(config.current)) {
          return config.current;
        }
      }
    }

    // Search in history if version doesn't match current
    if (Array.isArray(config.history)) {
      for (const historyEntry of config.history) {
        if (historyEntry.version === version && Array.isArray(historyEntry.questions)) {
          return historyEntry.questions;
        }
      }
    }

    // Fallback to current if version not found in history
    if (config.current && Array.isArray(config.current.questions)) {
      return config.current.questions;
    }
    if (Array.isArray(config.questions)) {
      return config.questions;
    }
    if (config.current && Array.isArray(config.current)) {
      return config.current;
    }
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
