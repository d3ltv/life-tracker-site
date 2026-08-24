const express = require('express');
const cors = require('cors');
const { readState, updateState } = require('./store');
const app = express();
const port = process.env.PORT || 3000;

// Stockage persistant local pour le développement.
const initialState = readState();
let meals = initialState.meals;
let journalEntries = initialState.journalEntries;
let adviceEntries = initialState.adviceEntries;

app.use(cors({ origin: '*' }));
app.use(express.json());

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
    const exportUrl = process.env.LIFEOS_EXPORT_URL || 'https://habit-track-xi.vercel.app/api/export?format=json-compact';

    try {
        const response = await fetch(exportUrl, { headers: { 'Accept': 'application/json' } });
        if (!response.ok) throw new Error(`LifeOS ${response.status}`);
        const payload = await response.json();
        const days = Array.isArray(payload.recentDays) ? payload.recentDays : [];
        const dated = days.filter(day => day && day.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const day = dated.find(item => item.date === requestedDate) || dated[0] || {};
        const period = payload.period || {};
        const averages = (payload.computedSummary || {}).averages7d || {};

        res.json({
            date: day.date || requestedDate || null,
            lifeos_day: day,
            targets: (payload.targets || {}).daily || {},
            summary: {
                daysWithData: period.daysWithData || dated.length,
                daysWithSleep: period.daysWithSleep || 0,
                daysWithFeel: period.daysWithFeel || 0,
                averages7d: averages,
            },
            screen: { available: false, reason: 'Screen Time doit être connecté côté source de données.' },
            google: { email_count: 0, calendar_events_count: 0, available: false },
            source: 'lifeos-api',
        });
    } catch (error) {
        res.status(502).json({ error: 'Impossible de récupérer LifeOS', detail: error.message });
    }
});

// Journal libre : événements et informations non prévues par les métriques
app.get('/journal', (req, res) => {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'Date requise' });
    res.json({ entries: journalEntries.filter(entry => entry.date === date) });
});

app.post('/journal', (req, res) => {
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
    journalEntries.push(entry);
    if (journalEntries.length > 1000) journalEntries.splice(0, journalEntries.length - 1000);
    updateState(state => { state.meals = meals; state.journalEntries = journalEntries; });
    res.status(201).json({ success: true, entry });
});

// Conseils entrepreneuriaux générés par Hermes
app.get('/advice', (req, res) => {
    const date = req.query.date;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const entries = adviceEntries
        .filter(entry => !date || entry.date === date)
        .slice(-limit)
        .reverse();
    res.json({ entries });
});

app.post('/advice', (req, res) => {
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
    adviceEntries.push(entry);
    if (adviceEntries.length > 1000) adviceEntries.splice(0, adviceEntries.length - 1000);
    updateState(state => { state.meals = meals; state.journalEntries = journalEntries; state.adviceEntries = adviceEntries; });
    res.status(201).json({ success: true, entry });
});

// Get today's meals
app.get('/history', (req, res) => {
    const date = req.query.date;
    if (!date) {
        return res.status(400).json({ error: 'Date requise' });
    }
    
    const dayMeals = meals.filter(m => m.date === date);
    res.json({ meals: dayMeals });
});

// Get stats for today
app.get('/stats/today', (req, res) => {
    const date = req.query.date;
    if (!date) {
        return res.status(400).json({ error: 'Date requise' });
    }
    
    const dayMeals = meals.filter(m => m.date === date);
    
    const protein = dayMeals.reduce((sum, m) => sum + (m.protein_g || 0), 0);
    const carbs = dayMeals.reduce((sum, m) => sum + (m.carbs_g || 0), 0);
    const calories = dayMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
    const mealCount = dayMeals.length;
    
    res.json({ protein, carbs, calories, mealCount });
});

// Post a meal (receives from Telegram webhook or direct POST)
app.post('/meal', (req, res) => {
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
    
    // Store
    meals.push(meal);
    
    // Keep only last 365 days to avoid storage growth
    if (meals.length > 365) {
        meals = meals.slice(-365);
    }
    updateState(state => { state.meals = meals; state.journalEntries = journalEntries; });
    res.json({ success: true, id: meals.length - 1 });
});

// Telegram webhook endpoint
app.post('/api/telegram-webhook', (req, res) => {
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
        meals.push(meal);
        if (meals.length > 365) {
            meals = meals.slice(-365);
        }
        updateState(state => { state.meals = meals; state.journalEntries = journalEntries; });
        
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

app.listen(port, () => {
    console.log(`📡 Life Tracker API running on port ${port}`);
});

module.exports = app;