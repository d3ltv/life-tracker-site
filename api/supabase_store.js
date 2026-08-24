const { client, isConfigured } = require('./supabase');

const TABLES = {
  journal: 'journal_entries',
  advice: 'advice_entries',
  meals: 'meal_entries'
};

function stripMealPhotos(metadata = {}) {
  const clean = { ...metadata };
  for (const key of Object.keys(clean)) {
    if (/photo|image|file_id|fileid|thumbnail|caption/i.test(key)) delete clean[key];
  }
  return clean;
}

async function list(table, { date, from, to, limit = 100 } = {}) {
  if (!isConfigured()) return null;
  let query = client().from(table).select('*').order('created_at', { ascending: false }).limit(limit);
  if (date) query = query.eq('date', date);
  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function insert(table, row) {
  if (!isConfigured()) return null;
  const { data, error } = await client().from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

async function saveJournal(entry) {
  return insert(TABLES.journal, {
    date: entry.date,
    text: entry.text,
    category: entry.category,
    source: entry.source,
    metadata: entry.metadata || {}
  });
}

async function saveAdvice(entry) {
  return insert(TABLES.advice, {
    date: entry.date,
    diagnosis: entry.diagnosis,
    lever: entry.lever,
    action: entry.action,
    domain: entry.domain,
    priority: entry.priority,
    source: entry.source,
    metadata: entry.metadata || {}
  });
}

async function saveMeal(entry) {
  return insert(TABLES.meals, {
    date: entry.date,
    meal_type: entry.meal_type || 'custom',
    protein_g: Number(entry.protein_g) || 0,
    carbs_g: Number(entry.carbs_g) || 0,
    calories: Number(entry.calories) || 0,
    quality: entry.quality || 'non précisée',
    source: entry.source || 'web',
    metadata: stripMealPhotos({
      ...(entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {}),
      fat_g: Number(entry.fat_g ?? entry.metadata?.fat_g) || 0
    })
  });
}

module.exports = { TABLES, list, saveJournal, saveAdvice, saveMeal, isConfigured };
