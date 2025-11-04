const { resolveTenantClient } = require('../_shared/org-bff');
const { sendError, sendSuccess } = require('../_shared/http');

module.exports = async function (context, req) {
  const { org_id, tag_id } = req.body || {};

  if (!org_id || !tag_id) {
    return sendError(context, 400, 'org_id and tag_id are required');
  }

  try {
    const tenantClient = await resolveTenantClient(req, org_id);

    // Remove the tag from all students who have it
    // Use PostgreSQL's array_remove function to remove the UUID from the tags array
    const { data, error: updateError } = await tenantClient
      .rpc('remove_tag_from_students', { tag_to_remove: tag_id });

    if (updateError) {
      console.error('Failed to remove tag from students:', updateError);
      // Fallback: manually update each student
      const { data: students, error: fetchError } = await tenantClient
        .from('Students')
        .select('id, tags')
        .contains('tags', [tag_id]);

      if (fetchError) {
        console.error('Failed to fetch students with tag:', fetchError);
        return sendError(context, 500, 'Failed to remove tag from students');
      }

      // Update each student by removing the tag
      for (const student of students || []) {
        const updatedTags = (student.tags || []).filter(id => id !== tag_id);
        const { error: updateErr } = await tenantClient
          .from('Students')
          .update({ tags: updatedTags })
          .eq('id', student.id);

        if (updateErr) {
          console.error(`Failed to update student ${student.id}:`, updateErr);
        }
      }
    }

    return sendSuccess(context, { message: 'Tag removed from all students', tag_id });
  } catch (error) {
    console.error('Error in remove-tag endpoint:', error);
    return sendError(context, error.status || 500, error.message || 'Internal server error');
  }
};
