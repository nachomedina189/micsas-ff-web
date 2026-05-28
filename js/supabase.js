import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://mbcssuvitqgrdqahqomc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iY3NzdXZpdHFncmRxYWhxb21jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4OTc1MTIsImV4cCI6MjA5NTQ3MzUxMn0.LkVkXzKjTgLYZSpxWLcdA4-COdDoAnWrSqnwAbtmTaU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
