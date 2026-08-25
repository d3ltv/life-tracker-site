const businessStore = require('./business_store');
const { normalizeIaDay } = require('./lifeos_sync');

function count(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function money(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

async function findHabitTrackContact(date, kind) {
    const contacts = await businessStore.list(businessStore.TABLES.contacts).catch(() => null);
    if (!contacts) return null;
    const marker = `habit-track:${kind}:${date}`;
    return contacts.find((item) => String(item.note || '').includes(marker) || String(item.metadata?.habit_track_key || '') === marker) || null;
}

async function listDayActivities(date) {
    const activities = await businessStore.listActivities({ date, limit: 200 }).catch(() => null);
    return activities || [];
}

function alreadyLogged(activities, channel, marker) {
    return activities.some((item) =>
        item.channel === channel
        && (String(item.note || '').includes(marker) || item.metadata?.habit_track_key === marker)
    );
}

/**
 * Transforme un jour habit-track en lignes Business OS :
 * - activités (appels / visites / messages / RDV)
 * - contact client auto si newClients > 0
 */
async function syncBusinessFromLifeosDay(rawDay) {
    const day = normalizeIaDay(rawDay || {});
    if (!day.date) return { created: [] };

    const created = [];
    const existing = await listDayActivities(day.date);
    const calls = count(day.callsMade);
    const physical = count(day.prospectsPhysical);
    const messages = count(day.messagesSent);
    const meetings = count(day.meetingsBooked);
    const clients = count(day.newClients);
    const revenue = money(day.revenueGenerated);
    const prospectMin = count(day.prospectingMinutes);

    const specs = [
        {
            channel: 'appel',
            outcome: meetings > 0 ? 'rdv' : 'a_relancer',
            count: calls,
            duration: calls ? Math.max(5, Math.round(prospectMin / Math.max(1, calls + physical + messages))) : null,
            marker: `habit-track:appel:${day.date}`
        },
        {
            channel: 'visite',
            outcome: meetings > 0 ? 'rdv' : 'a_relancer',
            count: physical,
            duration: physical ? Math.max(10, Math.round(prospectMin / Math.max(1, calls + physical + messages))) : null,
            marker: `habit-track:visite:${day.date}`
        },
        {
            channel: 'linkedin',
            outcome: 'a_relancer',
            count: messages,
            duration: null,
            marker: `habit-track:messages:${day.date}`
        }
    ];

    for (const spec of specs) {
        if (spec.count <= 0) continue;
        if (alreadyLogged(existing, spec.channel, spec.marker)) continue;
        const note = `${spec.count} ${spec.channel === 'linkedin' ? 'message(s)' : spec.channel === 'appel' ? 'appel(s)' : 'visite(s)'} · sync habit-track · ${spec.marker}`;
        const row = await businessStore.saveActivity({
            date: day.date,
            channel: spec.channel,
            outcome: spec.outcome,
            duration_min: spec.duration,
            note,
            metadata: {
                habit_track_key: spec.marker,
                count: spec.count,
                source: 'habit-track'
            }
        }).catch(() => null);
        if (row) created.push({ type: 'activity', channel: spec.channel, id: row.id });
    }

    if (meetings > 0) {
        const marker = `habit-track:rdv:${day.date}`;
        if (!alreadyLogged(existing, 'autre', marker)) {
            const row = await businessStore.saveActivity({
                date: day.date,
                channel: 'autre',
                outcome: 'rdv',
                duration_min: null,
                note: `${meetings} RDV obtenu(s) · sync habit-track · ${marker}`,
                metadata: { habit_track_key: marker, count: meetings, source: 'habit-track' }
            }).catch(() => null);
            if (row) created.push({ type: 'activity', channel: 'rdv', id: row.id });
        }
    }

    if (clients > 0) {
        const marker = `habit-track:client:${day.date}`;
        const existingContact = await findHabitTrackContact(day.date, 'client');
        if (!existingContact) {
            const valueEach = revenue > 0 ? revenue / clients : 0;
            for (let i = 0; i < clients; i += 1) {
                const suffix = clients > 1 ? ` #${i + 1}` : '';
                const contact = await businessStore.insert(businessStore.TABLES.contacts, {
                    name: `Client habit-track ${day.date}${suffix}`,
                    status: 'client',
                    value: valueEach,
                    next_action: '',
                    next_action_at: null,
                    note: `Signé le ${day.date} · sync auto depuis habit-track · ${marker}`,
                    source: 'habit-track',
                    metadata: { habit_track_key: marker, date: day.date, source: 'habit-track' }
                }).catch(() => null);
                if (contact) created.push({ type: 'contact', id: contact.id });
            }
        }
    } else if (meetings > 0) {
        const marker = `habit-track:rdv-contact:${day.date}`;
        const existingContact = await findHabitTrackContact(day.date, 'rdv-contact');
        if (!existingContact) {
            const contact = await businessStore.insert(businessStore.TABLES.contacts, {
                name: `RDV habit-track ${day.date}`,
                status: 'rdv',
                value: 0,
                next_action: `Suite du RDV du ${day.date}`,
                next_action_at: null,
                note: `RDV noté dans habit-track · ${marker}`,
                source: 'habit-track',
                metadata: { habit_track_key: marker, date: day.date, source: 'habit-track' }
            }).catch(() => null);
            if (contact) created.push({ type: 'contact', id: contact.id });
        }
    }

    return { created };
}

module.exports = { syncBusinessFromLifeosDay };
