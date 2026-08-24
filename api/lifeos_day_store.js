const { updateState, readState } = require('./store');
const { client, isConfigured } = require('./supabase');

const TABLE = 'lifeos_days';

async function save(day) {
    if (!day || !day.date) throw new Error('Jour LifeOS invalide');
    const row = {
        date: String(day.date),
        day,
        collected_at: new Date().toISOString()
    };
    updateState((state) => {
        state.lifeosDays = state.lifeosDays || {};
        state.lifeosDays[row.date] = row;
    });
    if (!isConfigured()) return row;
    const { data, error } = await client().from(TABLE)
        .upsert({ date: row.date, day: row.day, collected_at: row.collected_at }, { onConflict: 'date' })
        .select()
        .single();
    if (error) {
        console.error('lifeos_days supabase', error.message);
        return row;
    }
    return data || row;
}

async function read(date) {
    if (date && isConfigured()) {
        const { data, error } = await client().from(TABLE).select('*').eq('date', date).maybeSingle();
        if (!error && data) return data.day || data;
    }
    const local = (readState().lifeosDays || {})[date];
    return local ? local.day : null;
}

module.exports = { save, read, TABLE };
