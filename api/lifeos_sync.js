function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function normalizeSleepDebt(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') {
        return { hours: raw, regime: null, trend: null, headline: null, prose: null, planMin: null, nights: null };
    }
    if (typeof raw !== 'object') return null;
    const hours = numberOrNull(raw.heures ?? raw.hours ?? raw.debtHours);
    if (hours === null && !raw.regime && !raw.resume && !raw.headline) return null;
    return {
        hours,
        regime: raw.regime || null,
        trend: raw.tendance ?? raw.trend ?? null,
        headline: raw.resume ?? raw.headline ?? null,
        prose: raw.prose || null,
        planMin: numberOrNull(raw.planMin ?? raw.recoveryExtraMinutesPerNight),
        nights: numberOrNull(raw.nuits ?? raw.recoveryNights)
    };
}

function normalizePipeline(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
        contacts7d: numberOrNull(raw.contacts7d) ?? 0,
        clients7d: numberOrNull(raw.clients7d) ?? 0,
        conversionPct7d: numberOrNull(raw.conversionPct7d),
        contacts28d: numberOrNull(raw.contacts28d) ?? 0,
        clients28d: numberOrNull(raw.clients28d) ?? 0,
        conversionPct28d: numberOrNull(raw.conversionPct28d),
        conversionPctJourJ: numberOrNull(raw.conversionPctJourJ),
        joursMesures: numberOrNull(raw.joursMesures) ?? 0,
        today: raw.today && typeof raw.today === 'object' ? raw.today : null
    };
}

function normalizeSignal(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = raw.titre ?? raw.title ?? null;
    const detail = raw.detail ?? raw.body ?? null;
    if (!title && !detail) return null;
    return {
        title,
        detail,
        engine: raw.moteur ?? raw.engine ?? null,
        kind: raw.kind || null,
        theme: raw.theme || null
    };
}

function normalizeEngineCards(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .slice(0, 12)
        .map((card) => {
            if (!card || typeof card !== 'object') return null;
            const title = card.titre ?? card.title ?? null;
            if (!title) return null;
            const evidence = Array.isArray(card.preuves ?? card.evidence)
                ? (card.preuves ?? card.evidence)
                    .map((row) => ({
                        label: row?.label || null,
                        value: row?.value || null
                    }))
                    .filter((row) => row.label && row.value)
                : [];
            return {
                id: card.id || null,
                title,
                detail: card.detail ?? card.body ?? null,
                engine: card.moteur ?? card.engine ?? null,
                theme: card.theme || null,
                kind: card.kind || null,
                salience: numberOrNull(card.salience),
                evidence
            };
        })
        .filter(Boolean);
}

function normalizeRestNeed(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const level = raw.niveau ?? raw.level ?? null;
    const headline = raw.resume ?? raw.headline ?? null;
    if (!level && !headline) return null;
    return {
        level,
        score: numberOrNull(raw.score),
        headline,
        prose: raw.prose || null,
        suggestedDate: raw.date ?? raw.suggestedDate ?? null,
        suggestedWeekday: raw.jour ?? raw.suggestedWeekday ?? null,
        suggestToday: Boolean(raw.aujourdHui ?? raw.suggestToday)
    };
}

function normalizeDrift(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((alert) => {
            if (!alert || typeof alert !== 'object') return null;
            const title = alert.titre ?? alert.title ?? null;
            if (!title) return null;
            return {
                id: alert.id || null,
                metric: alert.metric || null,
                severity: alert.severite ?? alert.severity ?? null,
                title,
                detail: alert.detail ?? alert.body ?? null,
                ratio: numberOrNull(alert.ratio)
            };
        })
        .filter(Boolean);
}

function normalizeForecast(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = raw.titre ?? raw.title ?? null;
    if (!title) return null;
    return {
        title,
        detail: raw.detail ?? raw.body ?? null,
        risk: raw.risque ?? raw.risk ?? null,
        sport: numberOrNull(raw.sport ?? raw.projectedSport),
        business: numberOrNull(raw.business ?? raw.projectedProspect)
    };
}

function normalizeFeelSlots(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((slot) => slot && slot.slot && Number(slot.n) > 0)
        .map((slot) => ({
            slot: slot.slot,
            mood: numberOrNull(slot.mood),
            energy: numberOrNull(slot.energy),
            n: Number(slot.n) || 0
        }));
}

function normalizeInsights(payload = {}, ingestedInsights = null) {
    const source = {
        ...(payload && typeof payload === 'object' ? payload : {}),
        ...(ingestedInsights && typeof ingestedInsights === 'object' ? ingestedInsights : {})
    };
    return {
        sleepDebt: normalizeSleepDebt(source.detteSommeil ?? source.sleepDebt),
        pipeline: normalizePipeline(source.pipeline),
        signal: normalizeSignal(source.signal),
        feelSlots: normalizeFeelSlots(source.ressentiSlots ?? source.feelSlots),
        cards: normalizeEngineCards(source.cartes ?? source.cards),
        restNeed: normalizeRestNeed(source.repos ?? source.restNeed),
        drift: normalizeDrift(source.derives ?? source.drift),
        forecast: normalizeForecast(source.prevision ?? source.forecast)
    };
}

function normalizeDayFeel(day = {}) {
    const raw = day.ressenti && typeof day.ressenti === 'object' ? day.ressenti : null;
    const slots = Array.isArray(raw?.creneaux)
        ? raw.creneaux
        : Array.isArray(day.checkins)
            ? day.checkins
            : [];
    const fromSlots = slots
        .map((slot) => ({
            mood: numberOrNull(slot.humeur ?? slot.mood ?? slot.moodScore),
            energy: numberOrNull(slot.energie ?? slot.energy ?? slot.energyScore),
            stress: numberOrNull(slot.stress ?? slot.stressScore)
        }));
    const avg = (key) => {
        const values = fromSlots.map((row) => row[key]).filter((value) => value !== null && value > 0);
        if (!values.length) return null;
        return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
    };
    const mood = numberOrNull(raw?.humeur) ?? avg('mood') ?? numberOrNull(day.humeur ?? day.moodScore);
    const energy = numberOrNull(raw?.energie) ?? avg('energy') ?? numberOrNull(day.energie ?? day.energyScore);
    const stress = numberOrNull(raw?.stress) ?? avg('stress') ?? numberOrNull(day.stress ?? day.stressScore);
    const n = numberOrNull(raw?.n) ?? fromSlots.filter((row) => row.mood || row.energy).length;
    return {
        moodScore: mood,
        energyScore: energy,
        stressScore: stress,
        feelSampleCount: n || (mood || energy || stress ? 1 : 0),
        feelSlots: slots.map((slot) => ({
            slot: slot.slot,
            mood: numberOrNull(slot.humeur ?? slot.mood ?? slot.moodScore),
            energy: numberOrNull(slot.energie ?? slot.energy ?? slot.energyScore),
            n: 1
        })).filter((slot) => slot.slot)
    };
}

function normalizeIaDay(day = {}) {
    if (!day || typeof day !== 'object') return {};
    const debtRaw = day.detteSommeil ?? day.sleepDebtHours;
    const debtHours = typeof debtRaw === 'object' && debtRaw !== null
        ? numberOrNull(debtRaw.heures ?? debtRaw.hours ?? debtRaw.debtHours)
        : numberOrNull(debtRaw);
    const feel = normalizeDayFeel(day);
    return {
        ...day,
        date: day.date || null,
        sleepHours: day.sommeil ?? day.sleepHours ?? null,
        sleepDebtHours: debtHours,
        sleepStart: day.coucher ?? day.sleepStart ?? null,
        sleepEnd: day.reveil ?? day.sleepEnd ?? null,
        sportMinutes: day.sportMin ?? day.sportMinutes ?? null,
        workMinutes: day.tafMin ?? day.workMinutes ?? null,
        deepWorkMinutes: day.deepWorkMin ?? day.deepWorkMinutes ?? null,
        meetingMinutes: day.meetingMin ?? day.meetingMinutes ?? null,
        readingMinutes: day.lectureMin ?? day.readingMinutes ?? null,
        socialMinutes: day.socialMin ?? day.socialMinutes ?? null,
        prospectingMinutes: day.businessMin ?? day.prospectingMinutes ?? null,
        callsMade: day.appels ?? day.callsMade ?? null,
        prospectsPhysical: day.physique ?? day.prospectsPhysical ?? null,
        messagesSent: day.messages ?? day.messagesSent ?? null,
        meetingsBooked: day.rdv ?? day.meetingsBooked ?? null,
        revenueGenerated: day.ca ?? day.revenueGenerated ?? null,
        prospectContacts: day.contacts ?? day.prospectContacts ?? null,
        newClients: day.clients ?? day.newClients ?? null,
        moodScore: feel.moodScore,
        energyScore: feel.energyScore,
        stressScore: feel.stressScore,
        feelSampleCount: feel.feelSampleCount,
        dayFeelSlots: feel.feelSlots,
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
        day: normalizeIaDay(selected),
        insights: normalizeInsights(payload, ingested?.insights)
    };
}

module.exports = {
    normalizeIaDay,
    collectIaDays,
    pickLifeosDay,
    normalizeInsights,
    normalizeSleepDebt,
    normalizePipeline,
    normalizeSignal,
    normalizeEngineCards,
    normalizeRestNeed,
    normalizeDrift,
    normalizeForecast
};
