const { updateState, readState } = require('./store');
const { client, isConfigured } = require('./supabase');

const TABLE = 'lifeos_days';
const INSIGHTS_KEY = '__lifeos_insights__';

async function save(day, insights = null) {
    if (!day || !day.date) throw new Error('Jour LifeOS invalide');
    const row = {
        date: String(day.date),
        day,
        insights: insights && typeof insights === 'object' ? insights : null,
        collected_at: new Date().toISOString()
    };
    updateState((state) => {
        state.lifeosDays = state.lifeosDays || {};
        state.lifeosDays[row.date] = row;
        if (row.insights) {
            state.lifeosInsights = state.lifeosInsights || {};
            state.lifeosInsights[INSIGHTS_KEY] = {
                ...row.insights,
                updated_at: row.collected_at,
                date: row.date
            };
        }
    });
    if (!isConfigured()) return row;
    const payload = {
        date: row.date,
        day: row.day,
        collected_at: row.collected_at
    };
    // insights column may not exist yet — store inside day blob as fallback
    if (row.insights) payload.day = { ...row.day, __insights: row.insights };
    const { data, error } = await client().from(TABLE)
        .upsert(payload, { onConflict: 'date' })
        .select()
        .single();
    if (error) {
        console.error('lifeos_days supabase', error.message);
        return row;
    }
    return data || row;
}

function unpack(record) {
    if (!record) return null;
    const day = record.day || record;
    if (!day || typeof day !== 'object') return null;
    const insights = record.insights || day.__insights || null;
    if (day.__insights) {
        const { __insights, ...clean } = day;
        return { ...clean, insights };
    }
    return insights ? { ...day, insights } : day;
}

async function read(date) {
    if (date && isConfigured()) {
        const { data, error } = await client().from(TABLE).select('*').eq('date', date).maybeSingle();
        if (!error && data) return unpack(data);
    }
    const local = (readState().lifeosDays || {})[date];
    if (!local) return null;
    return unpack(local);
}

async function readLatestInsights() {
    const local = (readState().lifeosInsights || {})[INSIGHTS_KEY];
    if (local) return local;
    if (!isConfigured()) return null;
    const { data, error } = await client().from(TABLE)
        .select('*')
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error || !data) return null;
    const unpacked = unpack(data);
    return unpacked?.insights || null;
}

module.exports = { save, read, readLatestInsights, TABLE };
