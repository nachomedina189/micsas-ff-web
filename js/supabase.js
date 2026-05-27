import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'PEGA_AQUI_TU_URL';
const SUPABASE_ANON_KEY = 'PEGA_AQUI_TU_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
