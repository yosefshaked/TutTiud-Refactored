/**
 * Normalizes a time string to HH:MM:SS format for backend compatibility.
 * Handles various input formats: HH:MM, HH:MM:SS, or null/undefined.
 * 
 * @param {string|null|undefined} time - Time string to normalize
 * @returns {string|null} Normalized time in HH:MM:SS format or null
 */
function normalizeTimeValue(time) {
  if (!time) return null;
  
  const timeStr = String(time).trim();
  if (!timeStr) return null;
  
  // If already in HH:MM:SS format, return as-is
  if (/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
    return timeStr;
  }
  
  // If in HH:MM format, add :00
  if (/^\d{2}:\d{2}$/.test(timeStr)) {
    return `${timeStr}:00`;
  }
  
  // If in H:MM format (single-digit hour), pad and add :00
  if (/^\d{1}:\d{2}$/.test(timeStr)) {
    const [h, m] = timeStr.split(':');
    return `${h.padStart(2, '0')}:${m}:00`;
  }
  
  // Return original value if format is unrecognized (let backend validate)
  return timeStr;
}

/**
 * Creates the initial state object for student forms (add/edit).
 * This is the single source of truth for student form structure.
 * 
 * @param {Object|null|undefined} student - Optional student object to populate the form
 * @returns {Object} Complete form state with all required fields
 */
export function createStudentFormState(student) {
  return {
    name: student?.name || '',
    contactName: student?.contact_name || '',
    contactPhone: student?.contact_phone || '',
    assignedInstructorId: student?.assigned_instructor_id || '',
    defaultService: student?.default_service || '',
    defaultDayOfWeek: student?.default_day_of_week || null,
    defaultSessionTime: normalizeTimeValue(student?.default_session_time),
    notes: student?.notes || '',
    tagId: Array.isArray(student?.tags) && student.tags.length > 0 ? student.tags[0] : '',
  };
}
