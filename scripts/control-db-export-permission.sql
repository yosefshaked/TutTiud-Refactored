-- Control DB: Add Export PDF with Custom Logo Permission
-- This migration adds the 'can_use_custom_logo_on_exports' permission to the registry

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
    'can_use_custom_logo_on_exports',
    'Custom Logo on Exports',
    'לוגו מותאם ביצוא',
    'Allow organization to display their custom logo alongside TutTiud logo on PDF exports',
    'אפשר לארגון להציג את הלוגו המותאם שלו לצד לוגו TutTiud ביצוא PDF',
    'false'::jsonb,
    'branding',
    true
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
