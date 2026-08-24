const { client, isConfigured } = require('./supabase');

const TABLE = 'integration_snapshots';
const SOURCES = new Set(['gmail', 'calendar', 'activitywatch']);

function validate(snapshot) {
  if (!snapshot || !SOURCES.has(snapshot.source)) throw new Error('Source invalide');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(snapshot.snapshot_date || ''))) throw new Error('Date invalide');
  return {
    source: snapshot.source,
    snapshot_date: snapshot.snapshot_date,
    summary: snapshot.summary && typeof snapshot.summary === 'object' ? snapshot.summary : {},
    items: Array.isArray(snapshot.items) ? snapshot.items.slice(0, 100) : [],
    collected_at: snapshot.collected_at || new Date().toISOString()
  };
}

async function upsert(snapshot) {
  if (!isConfigured()) return null;
  const row = validate(snapshot);
  const { data, error } = await client().from(TABLE)
    .upsert(row, { onConflict: 'source,snapshot_date' })
    .select().single();
  if (error) throw error;
  return data;
}

async function latest() {
  if (!isConfigured()) return null;
  const { data, error } = await client().from(TABLE)
    .select('*').order('snapshot_date', { ascending: false }).order('collected_at', { ascending: false }).limit(30);
  if (error) throw error;
  const result = {};
  for (const row of data || []) if (!result[row.source]) result[row.source] = row;
  return result;
}

module.exports = { SOURCES, validate, upsert, latest };
