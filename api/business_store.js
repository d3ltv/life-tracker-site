const { client, isConfigured } = require('./supabase');

const TABLES = {
  contacts: 'business_contacts',
  processes: 'business_processes',
  settings: 'business_settings'
};

async function list(table) {
  if (!isConfigured()) return null;
  const { data, error } = await client().from(table).select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function insert(table, row) {
  if (!isConfigured()) return null;
  const { data, error } = await client().from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

async function upsert(table, row) {
  if (!isConfigured()) return null;
  const { data, error } = await client().from(table).upsert(row).select().single();
  if (error) throw error;
  return data;
}

module.exports = { TABLES, list, insert, upsert, isConfigured };
