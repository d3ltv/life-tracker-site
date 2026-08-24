const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const express = require('express');
const cors = require('cors');
const { readState, updateState } = require('./store');
const supabaseStore = require('./supabase_store');
const businessStore = require('./business_store');
const { computeBusinessMetrics, buildLifeTrends, aggregateMeals } = require('./metrics');
const integrationStore = require('./integration_store');
const { pickLifeosDay, normalizeIaDay } = require('./lifeos_sync');
const lifeosDayStore = require('./lifeos_day_store');
const app = express();
const port = process.env.PORT || 3000;
const publicOrigin = process.env.PUBLIC_ORIGIN || 'https://life-tracker-site.vercel.app';
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function safeError(res, status, message, error) {
    console.error(message, error);
    return res.status(status).json({ error: message });
}

// Stockage persistant local pour le développement.
const initialState = readState();
let meals = initialState.meals;
let journalEntries = initialState.journalEntries;
let adviceEntries = initialState.adviceEntries;

app.use(cors({ origin(origin, callback) {
    if (!origin || origin === publicOrigin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    return callback(new Error('Origin refusée'));
} }));
app.use(express.json());

// Vercel peut transmettre le préfixe /api à Express après le rewrite.
// On le retire pour que les routes Express restent identiques en local et en production.
app.use((req, res, next) => {
    if (req.url === '/api') req.url = '/';
    else if (req.url.startsWith('/api/')) req.url = req.url.slice(4);
    next();
});

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Life Tracker API' });
});

app.get('/status', (req, res) => {
    res.json({ online: true, agent: 'hermes', channel: 'telegram' });
});

function todayInParis() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

function pick(source, keys) {
    for (const key of keys) {
        if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
    }
    return undefined;
}

function stripMealPhotos(metadata = {}) {
    const clean = { ...metadata };
    for (const key of Object.keys(clean)) {
        if (/photo|image|file_id|fileid|thumbnail|caption/i.test(key)) delete clean[key];
    }
    return clean;
}

function mealFat(meal) {
    return Number(meal.fat_g ?? meal.lipides ?? meal.metadata?.fat_g ?? meal.metadata?.lipides) || 0;
}

function sanitizeMeal(meal) {
    return {
        date: meal.date,
        meal_type: meal.meal_type,
        protein_g: Number(meal.protein_g) || 0,
        carbs_g: Number(meal.carbs_g) || 0,
        fat_g: mealFat(meal),
        calories: Number(meal.calories) || 0,
        quality: meal.quality || 'non précisée',
        source: meal.source || 'hermes',
        created_at: meal.created_at || meal.createdAt || null
    };
}

function normalizeMeal(body = {}) {
    const quality = String(pick(body, ['quality', 'qualité', 'qualite']) || 'estimee').trim();
    const fat_g = Number(pick(body, ['fat_g', 'fat', 'lipides', 'lipids'])) || 0;
    return {
        date: String(pick(body, ['date']) || todayInParis()),
        meal_type: String(pick(body, ['meal_type', 'type', 'name']) || 'custom').trim().slice(0, 80),
        protein_g: Number(pick(body, ['protein_g', 'protein', 'protéines', 'proteines'])) || 0,
        carbs_g: Number(pick(body, ['carbs_g', 'carbs', 'glucides'])) || 0,
        fat_g,
        calories: Number(pick(body, ['calories', 'kcal'])) || 0,
        quality,
        source: String(pick(body, ['source']) || 'hermes'),
        metadata: stripMealPhotos({
            ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
            fat_g
        })
    };
}

async function loadLifeosBriefing(requestedDate) {
    const exportUrl = process.env.LIFEOS_IA_URL || 'https://habit-track-xi.vercel.app/api/ia?scope=tout';
    const isIaPayload = exportUrl.includes('/api/ia');
    const ingested = await lifeosDayStore.read(requestedDate).catch(() => null);
    const response = await fetch(exportUrl, { headers: { Accept: 'application/json', 'Cache-Control': 'no-store' } });
    if (!response.ok) {
        if (ingested) return { day: normalizeIaDay(ingested), source: 'lifeos-push' };
        throw new Error(`LifeOS ${response.status}`);
    }
    const payload = await response.json();
    if (isIaPayload) {
        const { day } = pickLifeosDay(payload, requestedDate, ingested);
        return { day, source: ingested ? 'lifeos-push' : 'lifeos-ia-api' };
    }
    const sourceDays = Array.isArray(payload.recentDays) ? payload.recentDays : [];
    const dated = sourceDays.filter(day => day && day.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const selected = dated.find(item => item.date === requestedDate) || ingested || dated[0] || {};
    return { day: normalizeIaDay(selected), source: ingested ? 'lifeos-push' : 'lifeos-api' };
}

// Briefing unique pour Hermes : tout ce que l'agent doit lire avant de parler ou d'écrire.
app.get('/context', async (req, res) => {
    const today = String(req.query.date || todayInParis());
    const [integrations, contacts, processes, settings, advice, journal, mealsForDay] = await Promise.all([
        readIntegrations(),
        businessStore.list(businessStore.TABLES.contacts).catch(() => null),
        businessStore.list(businessStore.TABLES.processes).catch(() => null),
        businessStore.list(businessStore.TABLES.settings).catch(() => null),
        supabaseStore.list(supabaseStore.TABLES.advice, { limit: 5 }).catch(() => null),
        supabaseStore.list(supabaseStore.TABLES.journal, { limit: 5 }).catch(() => null),
        supabaseStore.list(supabaseStore.TABLES.meals, { date: today, limit: 20 }).catch(() => null)
    ]);
    let lifeos = null;
    try {
        lifeos = await loadLifeosBriefing(today);
    } catch (error) {
        lifeos = { error: error.message };
    }
    const gmail = integrations.gmail || {};
    const calendar = integrations.calendar || {};
    const activitywatch = integrations.activitywatch || {};
    return res.json({
        agent: 'hermes',
        role: 'Couche agentique. Les programmes capturent et stockent. Hermes interprète, questionne, décide, puis écrit la mémoire.',
        today,
        north_star: { monthly_revenue: 10000, savings: 2000, exit: 'Subway' },
        lifeos,
        business: {
            contacts: (contacts || []).slice(0, 20),
            processes: (processes || []).slice(0, 20),
            metrics: computeBusinessMetrics(contacts || []),
            settings: settings?.[0] || null
        },
        integrations: {
            gmail: { summary: gmail.summary || {}, items: gmail.items || [] },
            calendar: { summary: calendar.summary || {}, items: calendar.items || [] },
            activitywatch: { summary: activitywatch.summary || {} }
        },
        advice: advice || adviceEntries.slice(-5).reverse(),
        journal: journal || journalEntries.slice(-5).reverse(),
        meals: (mealsForDay || meals.filter(meal => meal.date === today)).map(sanitizeMeal),
        channel: 'telegram',
        write: {
            advice: `POST ${publicOrigin}/api/advice`,
            journal: `POST ${publicOrigin}/api/journal`,
            contact: `POST ${publicOrigin}/api/business/contact`,
            process: `POST ${publicOrigin}/api/business/process`,
            meal: `POST ${publicOrigin}/api/meal`
        }
    });
});

function hasSyncAccess(req) {
    const expected = process.env.INTEGRATION_SYNC_SECRET;
    const supplied = req.get('x-integration-secret') || req.get('x-sync-secret');
    return Boolean(expected && supplied && expected.length >= 24 && supplied === expected);
}

async function readIntegrations() {
    try {
        return await integrationStore.latest() || {};
    } catch (error) {
        console.error('Lecture intégrations', error);
        return {};
    }
}

function isConnected(row) {
    return String(row?.summary?.status || '') === 'connected';
}

// Synchronisation Mac → Supabase. Cette route n'accepte jamais le contenu complet
// des emails, URLs ou titres de fenêtres : seulement les agrégats préparés localement.
app.post('/integrations/sync', async (req, res) => {
    if (!hasSyncAccess(req)) return res.status(401).json({ error: 'Non autorisé' });
    const snapshots = Array.isArray(req.body?.snapshots) ? req.body.snapshots : [];
    if (!snapshots.length || snapshots.length > 3) return res.status(400).json({ error: 'Snapshots requis' });
    try {
        const saved = [];
        for (const snapshot of snapshots) saved.push(await integrationStore.upsert(snapshot));
        return res.json({ success: true, saved: saved.filter(Boolean).map(row => ({ source: row.source, snapshot_date: row.snapshot_date })) });
    } catch (error) { return safeError(res, 400, 'Synchronisation impossible', error); }
});

app.get('/integrations/latest', async (req, res) => {
    try {
        const data = await integrationStore.latest();
        return res.json({ source: data ? 'supabase' : 'local', integrations: data || {} });
    } catch (error) { return safeError(res, 502, 'Lecture des intégrations impossible', error); }
});

app.post('/lifeos/ingest', async (req, res) => {
    if (!hasSyncAccess(req)) return res.status(401).json({ error: 'Non autorisé' });
    const day = req.body?.day && typeof req.body.day === 'object' ? req.body.day : req.body;
    if (!day?.date || !isoDate.test(String(day.date))) return res.status(400).json({ error: 'Jour invalide' });
    try {
        const saved = await lifeosDayStore.save(day);
        return res.json({ success: true, date: saved.date || day.date });
    } catch (error) {
        return safeError(res, 400, 'Ingest LifeOS impossible', error);
    }
});

// Synthèse LifeOS pour le dashboard principal
app.get('/dashboard', async (req, res) => {
    const requestedDate = String(req.query.date || todayInParis());
    const exportUrl = process.env.LIFEOS_IA_URL || 'https://habit-track-xi.vercel.app/api/ia?scope=tout';
    const isIaPayload = exportUrl.includes('/api/ia');

    try {
        const ingested = await lifeosDayStore.read(requestedDate).catch(() => null);
        const response = await fetch(exportUrl, { headers: { 'Accept': 'application/json', 'Cache-Control': 'no-store' } });
        if (!response.ok) throw new Error(`LifeOS ${response.status}`);
        const payload = await response.json();
        const picked = isIaPayload
            ? pickLifeosDay(payload, requestedDate, ingested)
            : (() => {
                const sourceDays = Array.isArray(payload.recentDays) ? payload.recentDays : [];
                const selected = sourceDays.find(item => item.date === requestedDate) || ingested || sourceDays[0] || {};
                return { rawDays: sourceDays, day: normalizeIaDay(selected) };
            })();
        const day = picked.day;
        const sourceDays = picked.rawDays;
        const period = isIaPayload ? {
            daysWithData: payload.mois?.joursNotes || sourceDays.length,
            daysWithSleep: sourceDays.filter(item => (item.sommeil ?? item.sleepHours) != null).length,
            daysWithFeel: sourceDays.filter(item => (item.humeur ?? item.moodScore) != null || (item.energie ?? item.energyScore) != null).length,
        } : (payload.period || {});
        const averages = isIaPayload ? {
            sleepHours: payload.mois?.tuiles?.find(x => x.label === 'Sommeil')?.value ?? null,
            performanceScore: payload.mois?.scoreMoyen ?? null,
        } : ((payload.computedSummary || {}).averages7d || {});
        const integrations = await readIntegrations();
        const gmail = integrations.gmail || {};
        const calendar = integrations.calendar || {};
        const activitywatch = integrations.activitywatch || {};

        res.json({
            date: day.date || requestedDate || null,
            lifeos_day: day,
            trends: buildLifeTrends(sourceDays, req.query.range || 30),
            targets: (payload.targets || {}).daily || {},
            summary: { ...period, averages7d: averages },
            screen: { available: false, reason: 'Screen Time doit être connecté côté source de données.' },
            google: {
                email_count: gmail.summary?.email_count_30d ?? gmail.summary?.email_count ?? 0,
                calendar_events_count: calendar.summary?.event_count_today ?? 0,
                available: isConnected(gmail) || isConnected(calendar)
            },
            activitywatch: {
                active_hours: activitywatch.summary?.active_hours ?? null,
                available: isConnected(activitywatch)
            },
            source: ingested ? 'lifeos-push' : (isIaPayload ? 'lifeos-ia-api' : 'lifeos-api'),
            agent: 'hermes',
        });
    } catch (error) {
        res.status(502).json({ error: 'Impossible de récupérer LifeOS', detail: error.message });
    }
});

// Journal libre : événements et informations non prévues par les métriques
app.get('/journal', async (req, res) => {
    const date = req.query.date;
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    try {
        const remote = await supabaseStore.list(supabaseStore.TABLES.journal, { date, limit });
        const localEntries = journalEntries
            .filter(entry => !date || entry.date === date)
            .slice(-limit)
            .reverse();
        return res.json({ entries: remote || localEntries, source: remote ? 'supabase' : 'local' });
    } catch (error) {
        return safeError(res, 502, 'Lecture journal impossible', error);
    }
});

app.post('/journal', async (req, res) => {
    const { date, text, category = 'libre', source = 'web' } = req.body || {};
    if (!isoDate.test(String(date || '')) || !text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Date ISO et texte requis' });
    }
    const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        text: text.trim().slice(0, 5000),
        category,
        source,
        createdAt: new Date().toISOString()
    };
    try {
        const remote = await supabaseStore.saveJournal(entry);
        if (remote) return res.status(201).json({ success: true, entry: remote, source: 'supabase' });
        journalEntries.push(entry);
        if (journalEntries.length > 1000) journalEntries.splice(0, journalEntries.length - 1000);
        updateState(state => { state.meals = meals; state.journalEntries = journalEntries; });
        return res.status(201).json({ success: true, entry, source: 'local' });
    } catch (error) {
        return safeError(res, 502, 'Enregistrement journal impossible', error);
    }
});

// Conseils entrepreneuriaux générés par Hermes
app.get('/advice', async (req, res) => {
    const date = req.query.date;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    try {
        const remote = await supabaseStore.list(supabaseStore.TABLES.advice, { date, limit });
        const entries = remote || adviceEntries.filter(entry => !date || entry.date === date).slice(-limit).reverse();
        return res.json({ entries, source: remote ? 'supabase' : 'local' });
    } catch (error) {
        return res.status(502).json({ error: 'Lecture conseils impossible', detail: error.message });
    }
});

app.post('/advice', async (req, res) => {
    const body = req.body || {};
    const date = body.date;
    const diagnosis = body.diagnosis || body.diagnostic;
    const lever = body.lever || body.levier;
    const action = body.action;
    const domain = body.domain || body.domaine || 'business';
    const priority = body.priority || body.priorite || 'normal';
    const source = body.source || 'hermes';
    if (!date || !diagnosis || !action) {
        return res.status(400).json({ error: 'date, diagnosis et action sont requis' });
    }
    const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        diagnosis: String(diagnosis).trim().slice(0, 2000),
        lever: String(lever || '').trim().slice(0, 1000),
        action: String(action).trim().slice(0, 1000),
        domain: String(domain).trim().slice(0, 50),
        priority: String(priority).trim().slice(0, 30),
        source,
        createdAt: new Date().toISOString()
    };
    try {
        const remote = await supabaseStore.saveAdvice(entry);
        if (remote) return res.status(201).json({ success: true, entry: remote, source: 'supabase' });
        adviceEntries.push(entry);
        if (adviceEntries.length > 1000) adviceEntries.splice(0, adviceEntries.length - 1000);
        updateState(state => { state.meals = meals; state.journalEntries = journalEntries; state.adviceEntries = adviceEntries; });
        return res.status(201).json({ success: true, entry, source: 'local' });
    } catch (error) {
        return res.status(502).json({ error: 'Enregistrement conseil impossible', detail: error.message });
    }
});

// Business OS : source persistante unique (Supabase si configuré, local sinon).
app.get('/business/state', async (req, res) => {
    try {
        const [contacts, processes, settings, sources] = await Promise.all([
            businessStore.list(businessStore.TABLES.contacts),
            businessStore.list(businessStore.TABLES.processes),
            businessStore.list(businessStore.TABLES.settings),
            businessStore.listSources({ is_active: true })
        ]);
        if (contacts || processes || settings || sources) {
            const integrations = await readIntegrations();
            const gmail = integrations.gmail || {};
            const calendar = integrations.calendar || {};
            const activitywatch = integrations.activitywatch || {};
            return res.json({
                source: 'supabase',
                contacts: contacts || [],
                processes: processes || [],
                settings: settings?.[0] || null,
                sources: sources || [],
                metrics: computeBusinessMetrics(contacts || []),
                connections: {
                    supabase: true,
                    lifeos: true,
                    hermes: true,
                    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
                    google: isConnected(gmail) || isConnected(calendar),
                    activitywatch: isConnected(activitywatch)
                }
            });
        }
        return res.json({ source: 'local', contacts: [], processes: [], settings: null, sources: [] });
    } catch (error) {
        return res.status(502).json({ error: 'Lecture Business OS impossible', detail: error.message });
    }
});

app.post('/business/contact', async (req, res) => {
    const { name, status = 'prospect', value = 0, nextAction = '', nextActionAt = null, note = '', source = 'web' } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nom requis' });
    if (!['prospect', 'rdv', 'proposition', 'client', 'perdu'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
    const row = { name: String(name).trim().slice(0, 200), status, value: Number(value) || 0, next_action: String(nextAction).trim().slice(0, 500), next_action_at: nextActionAt || null, note: String(note).trim().slice(0, 5000), source };
    try {
        const remote = await businessStore.insert(businessStore.TABLES.contacts, row);
        if (remote) return res.status(201).json({ success: true, source: 'supabase', contact: remote });
        return res.status(201).json({ success: true, source: 'local', contact: row });
    } catch (error) { return res.status(502).json({ error: 'Enregistrement contact impossible', detail: error.message }); }
});

app.post('/business/process', async (req, res) => {
    const { title, description = '', status = 'brouillon', source = 'web' } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Titre requis' });
    try {
        const remote = await businessStore.insert(businessStore.TABLES.processes, { title: String(title).trim().slice(0, 200), description: String(description).trim().slice(0, 10000), status, source });
        if (remote) return res.status(201).json({ success: true, source: 'supabase', process: remote });
        return res.status(201).json({ success: true, source: 'local', process: { title, description, status, source } });
    } catch (error) { return res.status(502).json({ error: 'Enregistrement process impossible', detail: error.message }); }
});

app.put('/business/settings', async (req, res) => {
    const { revenueTarget = 10000, savingsTarget = 2000, savings = 0 } = req.body || {};
    try {
        const remote = await businessStore.upsert(businessStore.TABLES.settings, { id: true, revenue_target: Number(revenueTarget) || 0, savings_target: Number(savingsTarget) || 0, savings: Number(savings) || 0 });
        if (remote) return res.json({ success: true, source: 'supabase', settings: remote });
        return res.json({ success: true, source: 'local', settings: { revenueTarget, savingsTarget, savings } });
    } catch (error) { return res.status(502).json({ error: 'Enregistrement objectifs impossible', detail: error.message }); }
});

// Sources de prospection
app.get('/business/sources', async (req, res) => {
    try {
        const sources = await businessStore.listSources({ type: req.query.type, is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined });
        return res.json({ sources: sources || [], source: sources ? 'supabase' : 'local' });
    } catch (error) { return res.status(502).json({ error: 'Lecture sources impossible', detail: error.message }); }
});

app.post('/business/sources', async (req, res) => {
    const { name, type, config = {}, is_active = true } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nom requis' });
    if (!['apify', 'linkedin', 'referral', 'cold', 'autre'].includes(type)) return res.status(400).json({ error: 'Type invalide' });
    try {
        const remote = await businessStore.saveSource({ name: String(name).trim(), type, config, is_active });
        return res.status(201).json({ success: true, source: 'supabase', sourceRecord: remote });
    } catch (error) { return res.status(502).json({ error: 'Enregistrement source impossible', detail: error.message }); }
});

app.post('/business/sources/:id/run', async (req, res) => {
    const { leadsFound = 0 } = req.body || {};
    try {
        const remote = await businessStore.updateSourceRun(req.params.id, { leadsFound: Number(leadsFound) || 0 });
        return res.json({ success: true, source: 'supabase', sourceRecord: remote });
    } catch (error) { return res.status(502).json({ error: 'Mise à jour run impossible', detail: error.message }); }
});

// Activités de prospection
app.get('/business/activities', async (req, res) => {
    const { date, from, to, source_id, contact_id, limit = 100 } = req.query;
    try {
        const activities = await businessStore.listActivities({ date, from, to, source_id, contact_id, limit: Math.min(Number(limit), 500) });
        return res.json({ activities: activities || [], source: activities ? 'supabase' : 'local' });
    } catch (error) { return res.status(502).json({ error: 'Lecture activités impossible', detail: error.message }); }
});

app.post('/business/activities', async (req, res) => {
    const { date, source_id, contact_id, channel, outcome, duration_min, note = '', metadata = {} } = req.body || {};
    if (!isoDate.test(String(date || ''))) return res.status(400).json({ error: 'Date ISO requise' });
    if (!['appel', 'visite', 'email', 'linkedin', 'sms', 'autre'].includes(channel)) return res.status(400).json({ error: 'Canal invalide' });
    if (!['pas_de_reponse', 'refus', 'rdv', 'devis_envoye', 'signe', 'perdu', 'a_relancer'].includes(outcome)) return res.status(400).json({ error: 'Résultat invalide' });
    try {
        const remote = await businessStore.saveActivity({ date, source_id: source_id || null, contact_id: contact_id || null, channel, outcome, duration_min: duration_min ? Number(duration_min) : null, note: String(note).trim().slice(0, 5000), metadata });
        return res.status(201).json({ success: true, source: 'supabase', activity: remote });
    } catch (error) { return res.status(502).json({ error: 'Enregistrement activité impossible', detail: error.message }); }
});

// Stats de prospection
app.get('/business/prospecting/stats', async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from et to requis (ISO date)' });
    try {
        const stats = await businessStore.getProspectingStats({ from, to });
        return res.json({ stats, source: stats ? 'supabase' : 'local' });
    } catch (error) { return res.status(502).json({ error: 'Calcul stats impossible', detail: error.message }); }
});

// Repas : Supabase en production, fallback local en développement.
app.get('/history', async (req, res) => {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'Date requise' });
    try {
        const remote = await supabaseStore.list(supabaseStore.TABLES.meals, { date, limit: 100 });
        const rows = remote || meals.filter(meal => meal.date === date);
        return res.json({ meals: rows.map(sanitizeMeal), source: remote ? 'supabase' : 'local' });
    } catch (error) { return res.status(502).json({ error: 'Lecture repas impossible', detail: error.message }); }
});

app.get('/stats/today', async (req, res) => {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'Date requise' });
    try {
        const remote = await supabaseStore.list(supabaseStore.TABLES.meals, { date, limit: 100 });
        const totals = aggregateMeals(remote || meals.filter(meal => meal.date === date));
        return res.json({ ...totals, mealCount: totals.count, source: remote ? 'supabase' : 'local' });
    } catch (error) { return res.status(502).json({ error: 'Statistiques repas impossibles', detail: error.message }); }
});

// Post a meal (receives from Telegram webhook or direct POST)
app.post('/meal', async (req, res) => {
    const meal = normalizeMeal(req.body || {});
    if (!isoDate.test(meal.date)) {
        return res.status(400).json({ error: 'Date ISO requise (YYYY-MM-DD)' });
    }
    
    try {
        const remote = await supabaseStore.saveMeal(meal);
        if (remote) return res.status(201).json({ success: true, meal: remote, source: 'supabase' });
        meals.push(meal);
        if (meals.length > 365) meals = meals.slice(-365);
        updateState(state => { state.meals = meals; state.journalEntries = journalEntries; });
        return res.status(201).json({ success: true, id: meals.length - 1, source: 'local' });
    } catch (error) { return res.status(502).json({ error: 'Enregistrement repas impossible', detail: error.message }); }
});

// Fallback seulement. Hermes Gateway consomme Telegram en premier.
// Ne pas setWebhook vers Vercel tant que la Gateway locale tourne.
app.post('/telegram-webhook', async (req, res) => {
    const update = req.body;
    if (!update.message || !update.message.text) {
        return res.status(200).json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat?.id;
    const text = message.text.trim();
    if (!chatId || !text) return res.status(200).json({ ok: true });

    // /conseil et /process sont des compétences Hermes, pas ce fallback.
    if (/^\/(conseil|process)\b/i.test(text)) {
        return res.status(200).json({ ok: true, delegated: 'hermes-gateway' });
    }

    if (text.startsWith('/track')) {
        const parts = text.substring(7).trim().split(' ');
        const data = {};
        for (const part of parts) {
            const [key, ...valueParts] = part.split('=');
            if (key && valueParts.length > 0) data[key] = valueParts.join('=');
        }
        const meal = normalizeMeal({ ...data, source: 'telegram' });
        if (!meal.protein_g && !meal.carbs_g && !meal.calories) {
            fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: '❌ Format incorrect. Utilise : /track protéines=35 glucides=45 calories=650 qualité=bon'
                })
            });
            return res.status(200).json({ ok: true });
        }
        try {
            const remote = await supabaseStore.saveMeal(meal);
            if (!remote) {
                meals.push(meal);
                if (meals.length > 365) meals = meals.slice(-365);
                updateState(state => { state.meals = meals; state.journalEntries = journalEntries; });
            }
        } catch (error) {
            return res.status(502).json({ ok: false, error: 'Enregistrement repas impossible' });
        }
        fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: `✅ Repas enregistré : ${data.protein_g}g pro, ${data.carbs_g}g glucides, ${data.calories} kcal, qualité ${data.quality}`
            })
        });
        return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
});

// Get aggregated stats (week, month)
app.get('/stats/week', async (req, res) => {
    const date = req.query.date;
    if (!isoDate.test(String(date || ''))) return res.status(400).json({ error: 'Date ISO requise' });
    const targetDate = new Date(`${date}T12:00:00Z`);
    const startOfWeek = new Date(targetDate);
    const mondayOffset = (targetDate.getUTCDay() + 6) % 7;
    startOfWeek.setUTCDate(targetDate.getUTCDate() - mondayOffset);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
    const from = startOfWeek.toISOString().slice(0, 10);
    const to = endOfWeek.toISOString().slice(0, 10);
    try {
        const remote = await supabaseStore.list(supabaseStore.TABLES.meals, { from, to, limit: 500 });
        const sourceMeals = remote || meals.filter(meal => meal.date >= from && meal.date <= to);
        const totals = aggregateMeals(sourceMeals);
        return res.json({ ...totals, source: remote ? 'supabase' : 'local', from, to });
    } catch (error) { return safeError(res, 502, 'Statistiques hebdomadaires impossibles', error); }
});

// Get aggregated stats (month)
app.get('/stats/month', async (req, res) => {
    const date = req.query.date;
    if (!isoDate.test(String(date || ''))) return res.status(400).json({ error: 'Date ISO requise' });
    const monthKey = date.slice(0, 7);
    const from = `${monthKey}-01`;
    const year = Number(monthKey.slice(0, 4));
    const month = Number(monthKey.slice(5, 7));
    const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    try {
        const remote = await supabaseStore.list(supabaseStore.TABLES.meals, { from, to, limit: 1000 });
        const sourceMeals = remote || meals.filter(meal => meal.date >= from && meal.date <= to);
        const totals = aggregateMeals(sourceMeals);
        return res.json({ ...totals, source: remote ? 'supabase' : 'local', from, to });
    } catch (error) { return safeError(res, 502, 'Statistiques mensuelles impossibles', error); }
});

// En local, le fichier reste exécutable avec `node api/index.js`.
// Sur Vercel, l'application est exportée comme fonction serverless.
if (require.main === module) {
    app.listen(port, () => {
        console.log(`📡 Life Tracker API running on port ${port}`);
    });
}

module.exports = app;