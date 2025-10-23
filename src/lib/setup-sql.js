export const SETUP_SQL_SCRIPT = `-- -- -- =================================================================
-- Tuttiud Platform Setup Script V2.3 (Idempotent RLS + Diagnostics)
-- =================================================================

-- Part 1: Extensions and Schema Creation (No Changes)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS tuttiud;

-- Part 2: Table Creation within 'tuttiud' schema (No Changes)
CREATE TABLE IF NOT EXISTS tuttiud."Instructors" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" text NOT NULL,
  "email" text,
  "phone" text,
  "is_active" boolean DEFAULT true,
  "notes" text,
  "metadata" jsonb
);
CREATE TABLE IF NOT EXISTS tuttiud."Students" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" text NOT NULL,
  "contact_info" text,
  "assigned_instructor_id" uuid REFERENCES tuttiud."Instructors"("id"),
  "tags" text[],
  "notes" text,
  "metadata" jsonb
);
CREATE TABLE IF NOT EXISTS tuttiud."SessionRecords" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "date" date NOT NULL,
  "student_id" uuid NOT NULL REFERENCES tuttiud."Students"("id"),
  "instructor_id" uuid REFERENCES tuttiud."Instructors"("id"),
  "service_context" text,
  "content" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "deleted" boolean NOT NULL DEFAULT false,
  "deleted_at" timestamptz,
  "metadata" jsonb
);
CREATE TABLE IF NOT EXISTS tuttiud."Settings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "settings_value" jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "SessionRecords_student_date_idx" ON tuttiud."SessionRecords" ("student_id", "date");
CREATE INDEX IF NOT EXISTS "SessionRecords_instructor_idx" ON tuttiud."SessionRecords" ("instructor_id");

-- Part 3: Row Level Security (RLS) Setup - NOW IDEMPOTENT

-- Enable RLS on all tables
ALTER TABLE tuttiud."Instructors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuttiud."Students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuttiud."SessionRecords" ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuttiud."Settings" ENABLE ROW LEVEL SECURITY;

-- Policies for "Instructors"
DROP POLICY IF EXISTS "Allow full access to authenticated users on Instructors" ON tuttiud."Instructors";
CREATE POLICY "Allow full access to authenticated users on Instructors" ON tuttiud."Instructors" FOR ALL TO authenticated, app_user USING (true) WITH CHECK (true);

-- Policies for "Students"
DROP POLICY IF EXISTS "Allow full access to authenticated users on Students" ON tuttiud."Students";
CREATE POLICY "Allow full access to authenticated users on Students" ON tuttiud."Students" FOR ALL TO authenticated, app_user USING (true) WITH CHECK (true);

-- Policies for "SessionRecords"
DROP POLICY IF EXISTS "Allow full access to authenticated users on SessionRecords" ON tuttiud."SessionRecords";
CREATE POLICY "Allow full access to authenticated users on SessionRecords" ON tuttiud."SessionRecords" FOR ALL TO authenticated, app_user USING (true) WITH CHECK (true);

-- Policies for "Settings"
DROP POLICY IF EXISTS "Allow full access to authenticated users on Settings" ON tuttiud."Settings";
CREATE POLICY "Allow full access to authenticated users on Settings" ON tuttiud."Settings" FOR ALL TO authenticated, app_user USING (true) WITH CHECK (true);


-- Part 4: Application Role and Permissions (No Changes)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA tuttiud TO app_user;
GRANT ALL ON ALL TABLES IN SCHEMA tuttiud TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA tuttiud GRANT ALL ON TABLES TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tuttiud TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA tuttiud GRANT USAGE, SELECT ON SEQUENCES TO app_user;
GRANT app_user TO postgres, authenticated, anon;


-- Part 5: Diagnostics Function (Extended for MVP checks)
CREATE OR REPLACE FUNCTION tuttiud.setup_assistant_diagnostics()
RETURNS TABLE (check_name text, success boolean, details text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  required_tables constant text[] := array['Instructors', 'Students', 'SessionRecords', 'Settings'];
  required_indexes constant text[] := array[
    'SessionRecords|SessionRecords_student_date_idx',
    'SessionRecords|SessionRecords_instructor_idx'
  ];
  required_policies constant text[] := array[
    'Instructors|Allow full access to authenticated users on Instructors',
    'Students|Allow full access to authenticated users on Students',
    'SessionRecords|Allow full access to authenticated users on SessionRecords',
    'Settings|Allow full access to authenticated users on Settings'
  ];
  table_name text;
  policy_spec text;
  policy_parts text[];
  policy_table text;
  policy_name text;
  index_spec text;
  index_parts text[];
  index_table text;
  index_name text;
BEGIN
  success := EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'tuttiud');
  check_name := 'Schema "tuttiud" exists';
  details := CASE WHEN success THEN 'OK' ELSE 'Schema "tuttiud" not found.' END;
  RETURN NEXT;
  success := EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'app_user');
  check_name := 'Role "app_user" exists';
  details := CASE WHEN success THEN 'OK' ELSE 'Role "app_user" not found.' END;
  RETURN NEXT;
  FOREACH table_name IN ARRAY required_tables LOOP
    success := to_regclass('tuttiud.' || quote_ident(table_name)) IS NOT NULL;
    check_name := 'Table "' || table_name || '" exists';
    details := CASE WHEN success THEN 'OK' ELSE 'Table ' || table_name || ' is missing.' END;
    RETURN NEXT;
  END LOOP;
  FOREACH table_name IN ARRAY required_tables LOOP
    success := EXISTS(
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'tuttiud'
        AND c.relname = table_name
        AND c.relrowsecurity = true
    );
    check_name := 'RLS enabled on "' || table_name || '"';
    details := CASE WHEN success THEN 'OK' ELSE 'RLS is not enabled on ' || table_name || '.' END;
    RETURN NEXT;
  END LOOP;
  FOREACH policy_spec IN ARRAY required_policies LOOP
    policy_parts := string_to_array(policy_spec, '|');
    policy_table := policy_parts[1];
    policy_name := policy_parts[2];
    success := EXISTS(
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'tuttiud'
        AND p.tablename = policy_table
        AND p.policyname = policy_name
    );
    check_name := 'Policy "' || policy_name || '" on "' || policy_table || '" exists';
    details := CASE WHEN success THEN 'OK' ELSE 'Policy ' || policy_name || ' is missing.' END;
    RETURN NEXT;
  END LOOP;
  FOREACH index_spec IN ARRAY required_indexes LOOP
    index_parts := string_to_array(index_spec, '|');
    index_table := index_parts[1];
    index_name := index_parts[2];
    success := EXISTS(
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'tuttiud'
        AND i.tablename = index_table
        AND i.indexname = index_name
    );
    check_name := 'Index "' || index_name || '" on "' || index_table || '" exists';
    details := CASE WHEN success THEN 'OK' ELSE 'Index ' || index_name || ' is missing.' END;
    RETURN NEXT;
  END LOOP;
END;
$$;


-- Part 6: Generate the Application-Specific JWT (No Changes)
SELECT extensions.sign(
  json_build_object(
    'role', 'app_user',
    'exp', (EXTRACT(EPOCH FROM (NOW() + INTERVAL '5 year')))::integer,
    'iat', (EXTRACT(EPOCH FROM NOW()))::integer
  ),
  'YOUR_SUPER_SECRET_AND_LONG_JWT_SECRET_HERE'
) AS "APP_DEDICATED_KEY (COPY THIS BACK TO THE APP)";
`;

