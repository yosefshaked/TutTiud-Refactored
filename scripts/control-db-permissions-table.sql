-- Control DB: Global Permissions Registry
-- This table defines all available permissions across the system with their default values
-- Use this as the source of truth for initializing org_settings.permissions

CREATE TABLE IF NOT EXISTS public.permission_registry (
  permission_key TEXT PRIMARY KEY,
  display_name_en TEXT NOT NULL,
  display_name_he TEXT NOT NULL,
  description_en TEXT,
  description_he TEXT,
  -- Store defaults as JSONB to allow boolean, number, or string defaults
  default_value JSONB NOT NULL DEFAULT 'false'::jsonb,
  category TEXT NOT NULL, -- 'backup', 'branding', 'features', etc.
  requires_approval BOOLEAN NOT NULL DEFAULT true, -- Whether enabling requires admin approval
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent migration: convert legacy BOOLEAN default_value to JSONB if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'permission_registry' AND column_name = 'default_value' AND data_type <> 'jsonb'
  ) THEN
    -- First, drop the default constraint if it exists
    ALTER TABLE public.permission_registry ALTER COLUMN default_value DROP DEFAULT;
    -- Convert existing boolean values to jsonb
    ALTER TABLE public.permission_registry ALTER COLUMN default_value TYPE jsonb USING to_jsonb(default_value);
    -- Re-add the default
    ALTER TABLE public.permission_registry ALTER COLUMN default_value SET DEFAULT 'false'::jsonb;
  END IF;
END;
$$;

-- Create index on category for filtering
CREATE INDEX IF NOT EXISTS idx_permission_registry_category ON public.permission_registry(category);

-- Enable Row Level Security
ALTER TABLE public.permission_registry ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow authenticated users to read permission registry
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'permission_registry' 
    AND policyname = 'Allow authenticated users to read permission registry'
  ) THEN
    CREATE POLICY "Allow authenticated users to read permission registry"
      ON public.permission_registry
      FOR SELECT
      TO public
      USING (auth.role() = 'authenticated');
  END IF;
END;
$$;

-- RLS Policy: Only service role can modify permission registry
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'permission_registry' 
    AND policyname = 'Only service role can modify permission registry'
  ) THEN
    CREATE POLICY "Only service role can modify permission registry"
      ON public.permission_registry
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

-- Insert default permissions
INSERT INTO public.permission_registry (
  permission_key,
  display_name_en,
  display_name_he,
  description_en,
  description_he,
  default_value,
  category,
  requires_approval
) VALUES
  (
    'backup_local_enabled',
    'Local Backup',
    'גיבוי מקומי',
    'Allow organization to create encrypted local backups',
    'אפשר לארגון ליצור גיבויים מוצפנים מקומיים',
    'false'::jsonb,
    'backup',
    true
  ),
  (
    'backup_cooldown_override',
    'Backup Cooldown Override',
    'עקיפת המתנה לגיבוי',
    'One-time override of the 7-day backup cooldown (automatically resets after use)',
    'עקיפה חד-פעמית של תקופת ההמתנה של 7 ימים (מתאפסת אוטומטית לאחר שימוש)',
    'false'::jsonb,
    'backup',
    true
  ),
  (
    'backup_oauth_enabled',
    'Cloud Backup (OAuth)',
    'גיבוי ענן (Google Drive, OneDrive)',
    'Allow organization to backup to cloud storage providers',
    'אפשר לארגון לגבות לספקי אחסון ענן',
    'false'::jsonb,
    'backup',
    true
  ),
  (
    'logo_enabled',
    'Custom Logo',
    'לוגו מותאם אישית',
    'Allow organization to upload and use a custom logo',
    'אפשר לארגון להעלות ולהשתמש בלוגו מותאם אישית',
    'false'::jsonb,
    'branding',
    true
  ),
  -- Preconfigured answers feature toggle (enabled/disabled)
  (
    'session_form_preanswers_enabled',
    'Session Form: Preconfigured Answers',
    'טופס מפגש: תשובות מוכנות מראש',
    'Allow organizations to configure predefined answer lists for text/textarea questions',
    'אפשר לארגון להגדיר רשימות תשובות מוכנות לשאלות טקסט/טקסט חופשי',
    'true'::jsonb,
    'features',
    false
  ),
  -- Preconfigured answers cap per question (numeric)
  (
    'session_form_preanswers_cap',
    'Session Form: Preanswers Cap',
    'טופס מפגש: תקרת תשובות מוכנות',
    'Maximum number of preconfigured answers allowed per question (text/textarea)',
    'מספר מרבי של תשובות מוכנות לשאלה (טקסט/טקסט חופשי)',
    '50'::jsonb,
    'features',
    false
  )
ON CONFLICT (permission_key) DO UPDATE SET
  display_name_en = EXCLUDED.display_name_en,
  display_name_he = EXCLUDED.display_name_he,
  description_en = EXCLUDED.description_en,
  description_he = EXCLUDED.description_he,
  default_value = EXCLUDED.default_value,
  category = EXCLUDED.category,
  requires_approval = EXCLUDED.requires_approval,
  updated_at = NOW();

-- Helper function to get default permissions as JSON
CREATE OR REPLACE FUNCTION public.get_default_permissions()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_object_agg(permission_key, default_value)
  INTO result
  FROM public.permission_registry;
  
  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

-- Helper function to initialize org permissions if null/empty
CREATE OR REPLACE FUNCTION public.initialize_org_permissions(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  current_permissions JSONB;
  default_permissions JSONB;
BEGIN
  -- Get current permissions
  SELECT permissions
  INTO current_permissions
  FROM public.org_settings
  WHERE org_id = p_org_id;
  
  -- If null, empty object, or no keys, initialize with defaults
  IF current_permissions IS NULL OR 
     current_permissions = '{}'::jsonb OR 
     jsonb_object_keys(current_permissions) IS NULL THEN
    
    -- Get default permissions
    default_permissions := public.get_default_permissions();
    
    -- Update org_settings
    UPDATE public.org_settings
    SET 
      permissions = default_permissions,
      updated_at = NOW()
    WHERE org_id = p_org_id;
    
    RETURN default_permissions;
  END IF;
  
  RETURN current_permissions;
END;
$$;

-- Example usage:
-- Get all default permissions:
-- SELECT public.get_default_permissions();

-- Initialize permissions for an org:
-- SELECT public.initialize_org_permissions('your-org-uuid-here');

-- Query permissions by category:
-- SELECT * FROM public.permission_registry WHERE category = 'backup';

-- Grant necessary permissions (adjust as needed for your setup)
-- These grants are idempotent - they won't error if already granted
DO $$
BEGIN
  GRANT SELECT ON public.permission_registry TO authenticated;
  GRANT EXECUTE ON FUNCTION public.get_default_permissions() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.initialize_org_permissions(UUID) TO authenticated;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors if already granted
    NULL;
END;
$$;
