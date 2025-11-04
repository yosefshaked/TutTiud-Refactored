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
    defaultSessionTime: student?.default_session_time || null,
    notes: student?.notes || '',
    tagId: Array.isArray(student?.tags) && student.tags.length > 0 ? student.tags[0] : '',
  };
}
