import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'tuttiud' }
});

async function test() {
  const { data, error } = await supabase
    .from('SessionRecords')
    .select(`
      id,
      ReportTemplates (
        system_type
      )
    `)
    .limit(1);
  
  console.log('Data:', JSON.stringify(data, null, 2));
  console.log('Error:', error);
}

test();
