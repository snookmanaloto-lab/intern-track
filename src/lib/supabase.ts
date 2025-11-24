import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ppcfuyvdqchfmmxyoszx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwY2Z1eXZkcWNoZm1teHlvc3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4MDE1NTUsImV4cCI6MjA3OTM3NzU1NX0.9KWw9M2ZTXbxYVN72L9ipj3iineZCYJaSJCZg9Dt5rE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
