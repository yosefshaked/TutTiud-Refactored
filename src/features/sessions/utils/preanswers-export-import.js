/**
 * Utilities for exporting and importing preconfigured answers
 * Supports per-question export/import
 */

/**
 * Export preconfigured answers for a single question as JSON
 * @param {Array<String>} answers - Array of answer strings
 * @param {Object} question - Question object with { id, label, ... }
 * @returns {String} JSON string
 */
export function exportAnswersAsJSON(answers, question) {
  const exported = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    question: {
      id: question.id,
      label: question.label,
    },
    answers: Array.isArray(answers) ? answers : [],
  };
  return JSON.stringify(exported, null, 2);
}

/**
 * Import preconfigured answers from JSON
 * @param {String} jsonString - JSON string or text
 * @returns {Object} { success, data, error, questionLabel }
 */
export function importAnswersFromJSON(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    
    // Validate structure
    if (!Array.isArray(parsed.answers)) {
      return {
        success: false,
        error: 'Invalid format: missing or invalid "answers" field',
        data: null,
        questionLabel: parsed.question?.label || 'Unknown',
      };
    }

    // Filter to only string values and trim
    const validated = parsed.answers
      .filter((v) => typeof v === 'string')
      .map((v) => v.trim())
      .filter((v) => v);

    return {
      success: true,
      data: validated,
      questionLabel: parsed.question?.label || 'Imported Answers',
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      error: `Parse error: ${error.message}`,
      data: null,
      questionLabel: null,
    };
  }
}

/**
 * Generate a filename for export
 * @param {String} questionLabel - Human-readable question label
 * @returns {String} Filename with timestamp
 */
export function generateExportFilename(questionLabel) {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  // Remove special characters and limit length
  const cleanLabel = questionLabel
    .replace(/[/\\?%*:|"<>]/g, '')
    .substring(0, 50)
    .trim();
  return `${cleanLabel}-${timestamp}.json`;
}

/**
 * Trigger browser download of JSON file
 * @param {String} jsonString - JSON content
 * @param {String} filename - Filename for download
 */
export function downloadJSON(jsonString, filename) {
  try {
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(`Failed to download file: ${error.message}`);
  }
}

/**
 * Copy text to clipboard
 * @param {String} text - Text to copy
 * @returns {Promise<Boolean>} Success
 */
export async function copyToClipboard(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    }
  } catch {
    return false;
  }
}

/**
 * Paste text from clipboard
 * @returns {Promise<String|null>} Clipboard text or null if unavailable
 */
export async function pasteFromClipboard() {
  try {
    if (navigator?.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
    return null;
  } catch {
    return null;
  }
}
