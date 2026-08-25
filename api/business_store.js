const { client, isConfigured } = require('./supabase');

const TABLES = {
  contacts: 'business_contacts',
  processes: 'business_processes',
  settings: 'business_settings',
  sources: 'business_sources',
  activities: 'prospecting_activities'
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

// Mise à jour ciblée d'un contact existant (ex. statut d'encaissement décidé par Hermes).
async function updateContact(id, patch) {
  if (!isConfigured()) return null;
  if (!id) throw new Error('id requis');
  const { data, error } = await client()
    .from(TABLES.contacts)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Sources de prospection
async function listSources({ type, is_active } = {}) {
  if (!isConfigured()) return null;
  let query = client().from(TABLES.sources).select('*').order('created_at', { ascending: false });
  if (type) query = query.eq('type', type);
  if (is_active !== undefined) query = query.eq('is_active', is_active);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function saveSource(source) {
  return insert(TABLES.sources, {
    name: source.name,
    type: source.type,
    config: source.config || {},
    is_active: source.is_active !== false,
    last_run_at: source.last_run_at || null,
    runs_count: source.runs_count || 0,
    total_leads: source.total_leads || 0
  });
}

async function updateSourceRun(sourceId, { leadsFound = 0 } = {}) {
  if (!isConfigured()) return null;
  const { data, error } = await client()
    .from(TABLES.sources)
    .update({
      last_run_at: new Date().toISOString(),
      runs_count: client().rpc('increment', { row_id: sourceId, column_name: 'runs_count' }),
      total_leads: client().rpc('increment', { row_id: sourceId, column_name: 'total_leads', increment_by: leadsFound })
    })
    .eq('id', sourceId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Activités de prospection
async function listActivities({ date, from, to, source_id, contact_id, limit = 100 } = {}) {
  if (!isConfigured()) return null;
  let query = client().from(TABLES.activities).select('*').order('created_at', { ascending: false }).limit(limit);
  if (date) query = query.eq('date', date);
  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);
  if (source_id) query = query.eq('source_id', source_id);
  if (contact_id) query = query.eq('contact_id', contact_id);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function saveActivity(activity) {
  return insert(TABLES.activities, {
    date: activity.date,
    source_id: activity.source_id || null,
    contact_id: activity.contact_id || null,
    channel: activity.channel,
    outcome: activity.outcome,
    duration_min: activity.duration_min || null,
    note: activity.note || '',
    metadata: activity.metadata || {}
  });
}

// Stats de prospection par période
async function getProspectingStats({ from, to } = {}) {
  if (!isConfigured()) return null;
  let query = client().from(TABLES.activities).select('outcome, channel, date, duration_min');
  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);
  const { data, error } = await query;
  if (error) throw error;

  const activities = data || [];
  const total = activities.length;
  const byOutcome = activities.reduce((acc, a) => {
    acc[a.outcome] = (acc[a.outcome] || 0) + 1;
    return acc;
  }, {});
  const byChannel = activities.reduce((acc, a) => {
    acc[a.channel] = (acc[a.channel] || 0) + 1;
    return acc;
  }, {});
  const rdvRate = total ? ((byOutcome.rdv || 0) + (byOutcome.devis_envoye || 0) + (byOutcome.signe || 0)) / total : 0;
  const totalDuration = activities.reduce((sum, a) => sum + (a.duration_min || 0), 0);

  return {
    total,
    byOutcome,
    byChannel,
    rdvRate: Math.round(rdvRate * 100) / 100,
    totalDurationMin: totalDuration,
    avgDurationMin: total ? Math.round(totalDuration / total) : 0
  };
}

module.exports = { TABLES, list, insert, upsert, updateContact, listSources, saveSource, updateSourceRun, listActivities, saveActivity, getProspectingStats, isConfigured };
