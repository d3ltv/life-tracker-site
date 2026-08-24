const { client, isConfigured } = require('./supabase');

const TABLE = 'integration_snapshots';
const SOURCES = new Set(['gmail', 'calendar', 'activitywatch']);
const ITEM_KEYS = {
  gmail: new Set(['date', 'kind', 'confidence']),
  calendar: new Set(['start', 'end', 'kind', 'client_related', 'event_ref']),
  activitywatch: new Set()
};
const SUMMARY_KEYS = {
  gmail: new Set(['email_count_30d', 'email_count', 'business_signal_count', 'meeting_suggestion_count', 'status']),
  calendar: new Set(['event_count_today', 'upcoming_count', 'client_event_count', 'status']),
  activitywatch: new Set(['active_hours', 'afk_hours', 'context_switches', 'unique_applications', 'unique_websites', 'status'])
};

function isSensitive(value) {
  const text = String(value);
  return /@/.test(text) || /https?:\/\//i.test(text) || /www\./i.test(text);
}

function pickAllowed(object, allowed) {
  const out = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (!allowed.has(key) || value == null || value === '') continue;
    if (typeof value === 'string' && isSensitive(value)) continue;
    out[key] = value;
  }
  return out;
}

function sanitizeItems(source, items) {
  const allowed = ITEM_KEYS[source] || new Set();
  return (Array.isArray(items) ? items : []).slice(0, 100).map(item => pickAllowed(item, allowed));
}

function validate(snapshot) {
  if (!snapshot || !SOURCES.has(snapshot.source)) throw new Error('Source invalide');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(snapshot.snapshot_date || ''))) throw new Error('Date invalide');
  const source = snapshot.source;
  return {
    source,
    snapshot_date: snapshot.snapshot_date,
    summary: pickAllowed(snapshot.summary && typeof snapshot.summary === 'object' ? snapshot.summary : {}, SUMMARY_KEYS[source] || new Set()),
    items: sanitizeItems(source, snapshot.items),
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

module.exports = { SOURCES, validate, upsert, latest, sanitizeItems };
