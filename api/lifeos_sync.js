function normalizeIaDay(day = {}) {
    if (!day || typeof day !== 'object') return {};
    return {
        ...day,
        date: day.date || null,
        sleepHours: day.sommeil ?? day.sleepHours ?? null,
        // Dette cumulée (moteur sleep-debt.ts côté habit-track) — pas juste la nuit d'hier,
        // le manque accumulé et lissé sur ~45 jours. null si pas assez d'historique.
        sleepDebtHours: day.detteSommeil ?? day.sleepDebtHours ?? null,
        sportMinutes: day.sportMin ?? day.sportMinutes ?? null,
        workMinutes: day.tafMin ?? day.workMinutes ?? null,
        deepWorkMinutes: day.deepWorkMin ?? day.deepWorkMinutes ?? null,
        meetingMinutes: day.meetingMin ?? day.meetingMinutes ?? null,
        readingMinutes: day.lectureMin ?? day.readingMinutes ?? null,
        socialMinutes: day.socialMin ?? day.socialMinutes ?? null,
        prospectingMinutes: day.businessMin ?? day.prospectingMinutes ?? null,
        prospectContacts: day.contacts ?? day.prospectContacts ?? null,
        newClients: day.clients ?? day.newClients ?? null,
        moodScore: day.humeur ?? day.moodScore ?? null,
        energyScore: day.energie ?? day.energyScore ?? null,
        stressScore: day.stress ?? day.stressScore ?? null,
        performanceScore: day.score ?? day.performanceScore ?? null
    };
}

function collectIaDays(payload = {}) {
    const days = [];
    const push = (day) => {
        if (day && day.date && !day.note) days.push(day);
    };
    push(payload.jour);
    for (const day of payload.semaine?.jours || []) push(day);
    for (const day of payload.mois?.jours || []) push(day);
    for (const day of Array.isArray(payload.recentDays) ? payload.recentDays : []) push(day);
    return days;
}

function pickLifeosDay(payload, requestedDate, ingested) {
    const byDate = new Map();
    for (const day of collectIaDays(payload)) byDate.set(String(day.date), day);
    if (ingested?.date) byDate.set(String(ingested.date), { ...byDate.get(String(ingested.date)), ...ingested });
    const selected = (requestedDate && byDate.get(String(requestedDate)))
        || (payload.jour && payload.jour.date === requestedDate ? payload.jour : null)
        || (requestedDate ? null : payload.jour)
        || [...byDate.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
        || payload.jour
        || {};
    return {
        rawDays: [...byDate.values()],
        day: normalizeIaDay(selected)
    };
}

module.exports = { normalizeIaDay, collectIaDays, pickLifeosDay };
