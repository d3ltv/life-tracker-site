/* LifeOS — synthèse personnelle. Une donnée absente n'est jamais convertie en zéro. */
(() => {
  const API_BASE = (window.API_BASE || '/api').replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const $ = (id) => document.getElementById(id);
  const value = (object, key) => object && object[key] !== undefined && object[key] !== null ? object[key] : null;
  const fmt = (number, digits = 0) => number === null ? '—' : Number(number).toLocaleString('fr-FR', { maximumFractionDigits: digits });
  const setText = (id, text) => { if ($(id)) $(id).textContent = text; };

  async function get(path) {
    const response = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`API ${response.status}`);
    return response.json();
  }

  function setBar(id, current, target) {
    const element = $(id);
    if (!element) return;
    element.style.width = current !== null && target ? `${Math.min(100, Math.max(0, current / target * 100))}%` : '0%';
  }

  function renderLifeOS(data) {
    const day = data.lifeos_day || {};
    const summary = data.summary || {};
    const goals = data.targets || {};
    const performance = value(day, 'performanceScore');
    const sleep = value(day, 'sleepHours');
    const sport = value(day, 'sportMinutes');
    const mood = value(day, 'moodScore');
    const energy = value(day, 'energyScore');
    const stress = value(day, 'stressScore');
    const business = value(day, 'prospectingMinutes');
    const work = value(day, 'workMinutes');
    const calls = value(day, 'callsMade');
    const physical = value(day, 'prospectsPhysical');
    const contacts = value(day, 'prospectContacts');
    const newClients = value(day, 'newClients');

    setText('business-hours', business === null ? '—' : fmt(business / 60, 1));
    setText('business-caption', business === null ? 'La prospection business n’est pas renseignée pour cette journée.' : `${fmt(business)} minutes consacrées à la prospection. Chaque contact rapproche de l’objectif 10K€/mois.`);
    setText('data-coverage', `${fmt(summary.daysWithData)} jours de données LifeOS`);
    setText('sleep-value', fmt(sleep, 1)); setText('sleep-unit', sleep === null ? '' : ' h');
    setText('sport-value', fmt(sport)); setText('sport-unit', sport === null ? '' : ' min');
    setText('mood-value', fmt(mood)); setText('energy-value', fmt(energy));
    setText('stress-value', stress === null ? 'Non renseigné' : `${fmt(stress)}/10`);
    setText('stress-detail', stress === null ? 'Ajoute ton ressenti dans LifeOS' : stress >= 7 ? 'Signal élevé à surveiller' : 'Niveau déclaré dans LifeOS');
    const journalInput = document.getElementById('journal-input');
    const journalStatus = document.getElementById('journal-status');
    const journalEntries = document.getElementById('journal-entries');
    const journalKey = `lifeos-journal-${today}`;
    const entries = JSON.parse(localStorage.getItem(journalKey) || '[]');
    if (journalEntries) journalEntries.innerHTML = entries.slice().reverse().map(item => `<div class="journal-entry"><strong>${esc(item.text)}</strong><small>${esc(item.time)} · Note personnelle</small></div>`).join('');
    if (!window.__lifeosJournalBound) {
      window.__lifeosJournalBound = true;
      document.getElementById('journal-save')?.addEventListener('click', async () => {
        const text = journalInput?.value.trim();
        if (!text) return;
        const current = JSON.parse(localStorage.getItem(journalKey) || '[]');
        const localEntry = { text, time: new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) };
        try {
          const response = await fetch(`${API_BASE}/journal`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ date: today, text, source: 'web' }) });
          if (!response.ok) throw new Error(`API ${response.status}`);
          localEntry.synced = true;
        } catch (error) {
          localEntry.synced = false;
          console.warn('Journal : sauvegarde API indisponible, copie locale conservée.', error);
        }
        current.push(localEntry);
        localStorage.setItem(journalKey, JSON.stringify(current));
        journalInput.value = '';
        if (journalStatus) journalStatus.textContent = localEntry.synced ? 'Synchronisé · visible par le système' : 'Copie locale · API indisponible';
        if (journalEntries) journalEntries.innerHTML = current.slice().reverse().map(item => `<div class="journal-entry"><strong>${esc(item.text)}</strong><small>${esc(item.time)} · ${item.synced ? 'Synchronisé' : 'Copie locale'}</small></div>`).join('');
      });
    }
    setText('prospecting-value', business === null ? '—' : fmt(business));
    setText('calls-value', fmt(calls)); setText('physical-value', fmt(physical)); setText('contacts-value', fmt(contacts)); setText('clients-value', fmt(newClients));
    setText('performance-score', performance === null ? '—' : fmt(performance));
    setText('performance-caption', performance === null ? 'Performance non renseignée' : 'Score issu des données saisies dans LifeOS.');
    setText('today-insight', business === null ? 'Donnée business manquante' : business > 0 ? 'Le business a avancé aujourd’hui' : 'Aucune prospection enregistrée');
    setText('today-insight-detail', business === null ? 'Impossible de conclure sans donnée.' : `${fmt(business)} minutes de prospection enregistrées.`);
    setText('business-verdict', business === null ? 'À renseigner' : business > 0 ? 'En mouvement' : 'À relancer');
    setText('business-verdict-detail', business === null ? 'Saisis tes actions business pour mesurer l’avancée.' : business > 0 ? 'Une action concrète a été enregistrée.' : 'Le North Star demande une action demain.');

    setBar('sleep-bar', sleep, 8); setBar('sport-bar', sport, 34); setBar('mood-bar', mood, 10); setBar('energy-bar', energy, 10);
    if (performance !== null && $('score-ring')) $('score-ring').style.strokeDashoffset = `${264 - Math.min(264, performance / 100 * 264)}`;
    const screen = data.screen || {};
    setText('screen-source-status', screen.available ? `${fmt(screen.total_hours, 1)} h enregistrées aujourd’hui` : 'export réel à connecter');
    const google = data.google || {};
    setText('google-source-status', google.available ? `${fmt(google.email_count ?? google.email_count)} emails · ${fmt(google.calendar_events_count ?? google.calendar_events_count)} événements` : 'lecture seule · pas encore synchronisé');
    const activitywatch = data.activitywatch || {};
    setText('activitywatch-source-status', activitywatch.available ? `${fmt(activitywatch.active_hours, 1)} h actives aujourd’hui` : 'agrégats Mac à synchroniser');
    const date = data.date || today;
    setText('date-label', new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }).toUpperCase());
    setText('signal-date', date.split('-').reverse().join('.'));
  }

  function renderMeals(data) {
    const stats = data.stats || {};
    setText('protein-today', stats.protein === undefined ? '—' : fmt(stats.protein));
    setText('carbs-today', stats.carbs === undefined ? '—' : fmt(stats.carbs));
    setText('cals-today', stats.calories === undefined ? '—' : fmt(stats.calories));
    setBar('protein-bar', stats.protein, 150); setBar('carbs-bar', stats.carbs, 250); setBar('calories-bar', stats.calories, 2200);
    const meals = data.meals || [];
    const list = $('history-list');
    if (!meals.length) { list.innerHTML = '<div class="empty-state"><span>○</span><strong>Aucun repas pour le moment</strong><p>Envoie une photo à <b>@lifeos22_bot</b> et elle apparaîtra ici.</p></div>'; return; }
    list.innerHTML = meals.map((meal) => `<article class="meal-row"><div class="meal-photo">${meal.photo_url ? `<img src="${esc(meal.photo_url)}" alt="Photo du repas" loading="lazy">` : '◌'}</div><div><div class="meal-name">${esc(meal.name || meal.meal_type || 'Repas')}</div><div class="meal-time">${meal.createdAt ? new Date(meal.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : 'Aujourd’hui'}</div></div><div class="meal-macros"><span><b>${fmt(meal.protein_g)}</b> pro</span><span><b>${fmt(meal.carbs_g)}</b> gluc.</span><span><b>${fmt(meal.calories)}</b> kcal</span></div><div class="quality">${esc(meal.quality || 'à confirmer')}</div></article>`).join('');
  }

  function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  async function refresh() {
    try {
      const dashboard = await get(`/dashboard?date=${today}`);
      renderLifeOS(dashboard);
      const [stats, history] = await Promise.all([get(`/stats/today?date=${today}`), get(`/history?date=${today}`)]);
      renderMeals({ stats, meals: history.meals || [] });
      setText('last-sync', new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}));
      setText('connection-label', 'Données synchronisées');
    } catch (error) {
      setText('connection-label', 'API non connectée');
      setText('data-coverage', 'Données indisponibles');
      console.warn('LifeOS : synchronisation impossible', error);
    }
  }
  $('refresh-button').addEventListener('click', refresh);
  refresh();
  window.setInterval(refresh, 30000);
})();
      