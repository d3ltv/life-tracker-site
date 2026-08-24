const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = url && key ? createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
}) : null;

function isConfigured() {
  return Boolean(supabase);
}

function client() {
  if (!supabase) throw new Error('Supabase non configuré');
  return supabase;
}

module.exports = { client, isConfigured };
