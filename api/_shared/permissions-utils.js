/* eslint-env node */

/**
 * Fetch default permissions from the permission_registry table
 * @param {object} supabaseClient - Supabase admin client
 * @returns {Promise<object>} - Object with permission keys and default values
 */
export async function getDefaultPermissions(supabaseClient) {
  try {
    const { data, error } = await supabaseClient
      .rpc('get_default_permissions');
    
    if (error) {
      console.error('Failed to fetch default permissions:', error);
      return null;
    }
    
    return data || {};
  } catch (err) {
    console.error('Error fetching default permissions:', err);
    return null;
  }
}

/**
 * Initialize org permissions using the database function
 * @param {object} supabaseClient - Supabase admin client
 * @param {string} orgId - Organization UUID
 * @returns {Promise<object>} - Initialized permissions object
 */
export async function initializeOrgPermissions(supabaseClient, orgId) {
  try {
    const { data, error } = await supabaseClient
      .rpc('initialize_org_permissions', { p_org_id: orgId });
    
    if (error) {
      console.error('Failed to initialize org permissions:', error);
      return null;
    }
    
    return data || {};
  } catch (err) {
    console.error('Error initializing org permissions:', err);
    return null;
  }
}

/**
 * Ensure org has permissions initialized, returns current or initialized permissions
 * @param {object} supabaseClient - Supabase admin client
 * @param {string} orgId - Organization UUID
 * @returns {Promise<object>} - Permissions object
 */
export async function ensureOrgPermissions(supabaseClient, orgId) {
  // First try to get current permissions
  const { data: orgSettings, error: fetchError } = await supabaseClient
    .from('org_settings')
    .select('permissions')
    .eq('org_id', orgId)
    .single();
  
  if (fetchError) {
    console.error('Failed to fetch org settings:', fetchError);
    return null;
  }
  
  const permissions = orgSettings?.permissions;
  
  // Check if permissions need initialization
  if (!permissions || 
      typeof permissions !== 'object' || 
      Object.keys(permissions).length === 0) {
    // Initialize using the database function
    return await initializeOrgPermissions(supabaseClient, orgId);
  }
  
  return permissions;
}

/**
 * Get all permissions from registry with metadata
 * @param {object} supabaseClient - Supabase admin client
 * @param {string} category - Optional category filter
 * @returns {Promise<Array>} - Array of permission objects with metadata
 */
export async function getPermissionRegistry(supabaseClient, category = null) {
  try {
    let query = supabaseClient
      .from('permission_registry')
      .select('*')
      .order('category', { ascending: true })
      .order('permission_key', { ascending: true });
    
    if (category) {
      query = query.eq('category', category);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Failed to fetch permission registry:', error);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('Error fetching permission registry:', err);
    return [];
  }
}
