const express = require('express');
const cors = require('cors');
const { readState, updateState } = require('./store');
const supabaseStore = require('./supabase_store');
const businessStore = require('./business_store');
const { computeBusinessMetrics, buildLifeTrends, aggregateMeals } = require('./metrics');
const app = express();
const port = process.env.PORT || 3000;

// Stockage persistant local pour le développement.
const initialState = readState();
let meals = initialState.meals;
let journalEntries = initialState.journalEntries;
let adviceEntries = initialState.adviceEntries;

app.use(cors({ origin: '*' }));
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
    res.json({ online: true });
});

// Synthèse LifeOS pour le dashboard principal
app.get('/dashboard', async (req, res) => {
    const requestedDate = req.query.date;
    const exportUrl = process.env.LIFEOS_IA_URL || 'https://habit-track-xi.vercel.app/api/ia?scope=tout';
        const isIaPayload = exportUrl.includes('/api/ia');

    try {
        const response = await fetch(exportUrl, { headers: { 'Accept': 'application/json' } });
        if (!response.ok) throw new Error(`LifeOS ${response.status}`);
        const payload = await response.json();
        const sourceDays = isIaPayload
            ? ((payload.mois && payload.mois.jours) || (payload.semaine && payload.semaine.jours) || [])
            : (Array.isArray(payload.recentDays) ? payload.recentDays : []);
        const normalize = day => isIaPayload ? {
            ...day,
            sleepHours: day.sommeil,
            sportMinutes: day.sportMin,
            workMinutes: day.tafMin,
            prospectingMinutes: day.businessMin,
            prospectContacts: day.contacts,
            newClients: day.clients,
            moodScore: day.humeur,
            energyScore: day.energie,
            stressScore: day.stress,
            performanceScore: day.score,
        } : day;
        const dated = sourceDays.filter(day => day && day.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const selected = dated.find(item => item.date === requestedDate) || dated[0] || {};
        const day = normalize(selected);
        const period = isIaPayload ? {
            daysWithData: payload.mois?.joursNotes || dated.length,
            daysWithSleep: dated.filter(item => item.sommeil !== null && item.sommeil !== undefined).length,
            daysWithFeel: dated.filter(item => item.humeur !== null || item.energie !== null).length,
        } : (payload.period || {});
        const averages = isIaPayload ? {
            sleepHours: payload.mois?.tuiles?.find(x => x.label === 'Sommeil')?.value || null,
            performanceScore: payload.mois?.scoreMoyen ?? null,
        } : ((payload.computedSummary || {}).averages7d || {});

        res.json({
            date: day.date || requestedDate || null,
            lifeos_day: day,
            trends: buildLifeTrends(sourceDays, req.query.range || 30),
            targets: (payload.targets || {}).daily || {},
            summary: { ...period, averages7d: averages },
            screen: { available: false, reason: 'Screen Time doit être connecté côté source de données.' },
            google: { email_count: 0, calendar_events_count: 0, available: false },
            source: isIaPayload ? 'lifeos-ia-api' : 'lifeos-api',
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
        return res.status(502).json({ error: 'Lecture journal impossible', detail: error.message });
    }
});

app.post('/journal', async (req, res) => {
    const { date, text, category = 'libre', source = 'web' } = req.body || {};
    if (!date || !text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Date et texte requis' });
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
        return res.status(502).json({ error: 'Enregistrement journal impossible', detail: error.message });
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
    const { date, diagnosis, lever, action, domain = 'business', priority = 'normal', source = 'hermes' } = req.body || {};
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
        const [contacts, processes, settings] = await Promise.all([
            businessStore.list(businessStore.TABLES.contacts),
            businessStore.list(businessStore.TABLES.processes),
            businessStore.list(businessStore.TABLES.settings)
        ]);
        if (contacts || processes || settings) {
            return res.json({
                source: 'supabase',
                contacts: contacts || [],
                processes: processes || [],
                settings: settings?.[0] || null,
                metrics: computeBusinessMetrics(contacts || []),
                connections: {
                    supabase: true,
                    lifeos: true,
                    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
                    google: false,
                    activitywatch: false
                }
            });
        }
        return res.json({ source: 'local', contacts: [], processes: [], settings: null });
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

// Repas : Supabase en production, fallback local en développement.
app.get('/history', async (req, res) => {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'Date requise' });
    try {
        const remote = await supabaseStore.list(supabaseStore.TABLES.meals, { date, limit: 100 });
        return res.json({ meals: remote || meals.filter(meal => meal.date === date), source: remote ? 'supabase' : 'local' });
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
    const meal = req.body;
    
    // Validate required fields
    if (!meal.date || !meal.meal_type || !meal.quality) {
        return res.status(400).json({ error: 'Champs requis manquants' });
    }
    
    // Ensure protein/carbs are numbers
    meal.protein_g = Number(meal.protein_g) || 0;
    meal.carbs_g = Number(meal.carbs_g) || 0;
    meal.calories = Number(meal.calories) || 0;
    
    // Add timestamp
    meal.createdAt = new Date();
    
    try {
        const remote = await supabaseStore.saveMeal(meal);
        if (remote) return res.status(201).json({ success: true, meal: remote, source: 'supabase' });
        meals.push(meal);
        if (meals.length > 365) meals = meals.slice(-365);
        updateState(state => { state.meals = meals; state.journalEntries = journalEntries; });
        return res.status(201).json({ success: true, id: meals.length - 1, source: 'local' });
    } catch (error) { return res.status(502).json({ error: 'Enregistrement repas impossible', detail: error.message }); }
});

// Telegram webhook endpoint
app.post('/telegram-webhook', async (req, res) => {
    const update = req.body;
    
    if (!update.message) {
        return res.status(200).json({ ok: true });
    }
    
    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text;
    
    // Parse commands from user
    if (text.startsWith('/track')) {
        // Format: /track protéines=35 glucides=45 calories=650 qualité=bon
        const parts = text.substring(7).trim().split(' ');
        const data = {};
        
        for (const part of parts) {
            const [key, ...valueParts] = part.split('=');
            if (key && valueParts.length > 0) {
                data[key] = valueParts.join('=');
            }
        }
        
        // Required fields
        if (!data.protein_g || !data.carbs_g || !data.calories || !data.quality) {
            // Send error back to user
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
        
        // Create meal object
        const meal = {
            date: new Date().toISOString().split('T')[0],
            meal_type: 'custom',
            protein_g: Number(data.protein_g),
            carbs_g: Number(data.carbs_g),
            calories: Number(data.calories),
            quality: data.quality,
            source: 'telegram'
        };
        
        // Store
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
        
        // Confirm to user
        fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: `✅ Repas enregistré : ${data.protein_g}g pro, ${data.carbs_g}g glucides, ${data.calories} kcal, qualité ${data.quality}`
            })
        });
    }
    
    res.json({ ok: true });
});

// Get aggregated stats (week, month)
app.get('/stats/week', (req, res) => {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'Date requise' });
    
    const targetDate = new Date(date);
    const startOfWeek = new Date(targetDate);
    startOfWeek.setDate(targetDate.getDate() - targetDate.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    const weekMeals = meals.filter(m => {
        const mDate = new Date(m.date);
        return mDate >= startOfWeek && mDate <= endOfWeek;
    });
    
    const protein = weekMeals.reduce((sum, m) => sum + (m.protein_g || 0), 0);
    const carbs = weekMeals.reduce((sum, m) => sum + (m.carbs_g || 0), 0);
    const calories = weekMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
    const count = weekMeals.length;
    
    res.json({ protein: protein.toFixed(1), carbs: carbs.toFixed(1), calories: calories.toFixed(0), count });
});

// Get aggregated stats (month)
app.get('/stats/month', (req, res) => {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'Date requise' });
    
    const targetDate = new Date(date);
    const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    
    const monthMeals = meals.filter(m => {
        const mDate = new Date(m.date);
        return mDate >= startOfMonth && mDate <= endOfMonth;
    });
    
    const protein = monthMeals.reduce((sum, m) => sum + (m.protein_g || 0), 0);
    const carbs = monthMeals.reduce((sum, m) => sum + (m.carbs_g || 0), 0);
    const calories = monthMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
    const count = monthMeals.length;
    
    res.json({ protein: protein.toFixed(1), carbs: carbs.toFixed(1), calories: calories.toFixed(0), count });
});

// En local, le fichier reste exécutable avec `node api/index.js`.
// Sur Vercel, l'application est exportée comme fonction serverless.
if (require.main === module) {
    app.listen(port, () => {
        console.log(`📡 Life Tracker API running on port ${port}`);
    });
}

module.exports = app;