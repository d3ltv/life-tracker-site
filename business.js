(() => {
  const storeKey = 'lifeos-business-v1';
  const defaultState = { revenue: 0, savings: 0, prospects: [], clients: [], processes: [], journal: [], settings: { revenueTarget: 10000, savingsTarget: 2000 } };
  const state = JSON.parse(localStorage.getItem(storeKey) || JSON.stringify(defaultState));
  const $ = (id) => document.getElementById(id);
  const api = (path, options) => fetch(`/api${path}`, { cache: 'no-store', ...options });

  const average = values => {
    const known = values.filter(value => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number);
    return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
  };

  function renderBars(id, values, maxValue) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = values.map(value => {
      const known = value !== null && value !== undefined && Number.isFinite(Number(value));
      const height = known ? Math.max(8, Math.min(100, Number(value) / maxValue * 100)) : 5;
      return `<i class="${known ? '' : 'missing'}" style="height:${height}%"></i>`;
    }).join('');
  }

  async function loadTrends() {
    try {
      const response = await api('/dashboard?range=30');
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      const trends = data.trends || [];
      const sleep = trends.map(day => day.sleepHours);
      const energy = trends.map(day => day.energyScore);
      const business = trends.map(day => day.businessMinutes);
      renderBars('trend-sleep', sleep, 10);
      renderBars('trend-energy', energy, 10);
      renderBars('trend-business', business, 180);
      const sleepAvg = average(sleep); const energyAvg = average(energy); const businessTotal = business.filter(x => x !== null && x !== undefined).reduce((a,b) => a + Number(b), 0);
      $('trend-sleep-summary').textContent = sleepAvg === null ? 'non renseigné' : `${sleepAvg.toFixed(1).replace('.', ',')} h moy.`;
      $('trend-energy-summary').textContent = energyAvg === null ? 'non renseignée' : `${energyAvg.toFixed(1).replace('.', ',')} / 10`;
      $('trend-business-summary').textContent = business.some(x => x !== null && x !== undefined) ? `${Math.round(businessTotal)} min` : 'non renseigné';
      $('trend-note').textContent = `${trends.length} jours disponibles · les absences restent non renseignées.`;
    } catch (error) {
      $('trend-note').textContent = 'Tendances temporairement indisponibles.';
    }
  }

  async function loadBusinessState() {
    try {
      const response = await api('/business/state');
      if (!response.ok) throw new Error(`API ${response.status}`);
      const remote = await response.json();
      $('sync-status').textContent = remote.source === 'supabase' ? 'Supabase synchronisé' : 'Mode local';
      $('sync-status').classList.toggle('is-live', remote.source === 'supabase');
      const connections = remote.connections || {};
      const setConnection = (id, active, liveText, fallbackText) => {
        const element = $(id); if (!element) return;
        element.classList.toggle('connected', Boolean(active));
        const label = element.querySelector('small');
        if (label) label.textContent = active ? liveText : fallbackText;
      };
      setConnection('connection-supabase', remote.source === 'supabase', 'base cloud synchronisée', 'mode local uniquement');
      setConnection('connection-lifeos', true, 'API IA disponible', 'API IA indisponible');
      setConnection('connection-telegram', connections.telegram, 'token serveur configuré', 'Hermes local · non vérifié côté API');
      setConnection('connection-google', connections.google, 'agrégats synchronisés au site', 'local sur Mac · pas encore synchronisé');
      setConnection('connection-activitywatch', connections.activitywatch, 'agrégats synchronisés au site', 'local sur Mac · pas encore synchronisé');
      if (remote.source !== 'supabase') return;
      state.clients = (remote.contacts || []).map(item => ({
        ...item,
        value: item.value ?? 0,
        nextAction: item.next_action ?? item.nextAction ?? '',
        note: item.note ?? ''
      }));
      state.prospects = [];
      state.processes = remote.processes || [];
      if (remote.metrics) {
        state.revenue = Number(remote.metrics.signedValueMonth || 0);
      }
      if (remote.settings) {
        state.settings = {
          revenueTarget: Number(remote.settings.revenue_target ?? 10000),
          savingsTarget: Number(remote.settings.savings_target ?? 2000)
        };
        state.savings = Number(remote.settings.savings ?? 0);
      }
      localStorage.setItem(storeKey, JSON.stringify(state));
      render();
    } catch (error) {
      $('sync-status').textContent = 'Mode local · API indisponible';
      console.warn('Business OS : mode local.', error);
    }
  }

  async function loadJournal() {
    try {
      const response = await api('/journal?limit=50');
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      state.journal = (data.entries || []).map(item => ({
        title: item.category || 'journal',
        body: item.text || '',
        date: item.date || ''
      }));
      localStorage.setItem(storeKey, JSON.stringify(state));
      render();
    } catch (error) {
      console.warn('Journal : mode local.', error);
    }
  }
  const save = () => { localStorage.setItem(storeKey, JSON.stringify(state)); $('last-update').textContent = new Date().toLocaleString('fr-FR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); };
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  async function loadIntegrations() {
    try {
      const response = await api('/integrations/latest');
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      const integrations = data.integrations || {};
      const gmail = integrations.gmail || {}; const calendar = integrations.calendar || {}; const activity = integrations.activitywatch || {};
      const gmailSummary = gmail.summary || {}; const calendarSummary = calendar.summary || {}; const activitySummary = activity.summary || {};
      $('gmail-business-count').textContent = gmailSummary.business_signal_count ?? '—';
      $('calendar-today-count').textContent = calendarSummary.event_count_today ?? '—';
      $('activity-active-hours').textContent = activitySummary.active_hours == null ? '—' : `${activitySummary.active_hours} h`;
      $('activity-switches').textContent = activitySummary.context_switches ?? '—';
      $('activity-afk').textContent = activitySummary.afk_hours == null ? '—' : `${activitySummary.afk_hours} h`;
      $('integration-updated').textContent = gmail.snapshot_date || calendar.snapshot_date || activity.snapshot_date || 'non synchronisé';
      const gmailItems = gmail.items || [];
      $('gmail-signals').innerHTML = gmailItems.length ? gmailItems.map(item => `<div><strong>${esc(item.kind || 'signal business')}</strong><small>${esc(item.date || '')} · ${esc(item.confidence || 'à vérifier')}</small></div>`).join('') : '<small>Aucun rendez-vous proposé détecté.</small>';
      const eventItems = calendar.items || [];
      $('calendar-events').innerHTML = eventItems.length ? eventItems.slice(0,5).map(item => {
        const start = item.start || '';
        const client = Boolean(item.client_related);
        const action = client ? `<button type="button" class="text-button calendar-contact" data-start="${esc(start)}" data-ref="${esc(item.event_ref || '')}">Créer un contact</button>` : '';
        return `<div><strong>${esc(item.kind || 'événement')}</strong><small>${esc(start)}</small>${action}</div>`;
      }).join('') : '<small>Aucun événement à venir.</small>';
      const googleConnected = gmailSummary.status === 'connected' || calendarSummary.status === 'connected';
      const activityConnected = activitySummary.status === 'connected';
      $('connection-google')?.classList.toggle('connected', googleConnected);
      $('connection-activitywatch')?.classList.toggle('connected', activityConnected);
      const googleLabel = $('connection-google')?.querySelector('small'); if (googleLabel) googleLabel.textContent = googleConnected ? 'agrégats synchronisés au site' : 'local sur Mac · pas encore synchronisé';
      const activityLabel = $('connection-activitywatch')?.querySelector('small'); if (activityLabel) activityLabel.textContent = activityConnected ? 'agrégats synchronisés au site' : 'local sur Mac · pas encore synchronisé';
    } catch (error) {
      $('integration-updated').textContent = 'indisponible';
      console.warn('Intégrations indisponibles.', error);
    }
  }

  async function loadAdvice() {
    const list = $('advice-list');
    if (!list) return;
    try {
      const response = await fetch('/api/advice?limit=10', { cache: 'no-store' });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      if (!data.entries || !data.entries.length) return;
      list.innerHTML = data.entries.map(item => `<article class="advice-entry"><div class="advice-meta">${esc(item.domain || 'business')} · ${esc(item.priority || 'normal')} · ${esc(item.date || '')}</div><strong>${esc(item.diagnosis)}</strong>${item.lever ? `<p>${esc(item.lever)}</p>` : ''}<p class="advice-action">→ ${esc(item.action)}</p></article>`).join('');
    } catch (error) {
      console.warn('Conseils : API indisponible.', error);
    }
  }

  function render() {
    const settings = state.settings || { revenueTarget: 10000, savingsTarget: 2000 };
    const contacts = [...(state.prospects || []), ...(state.clients || [])];
    const prospects = contacts.filter(x => x.status === 'prospect');
    const clients = contacts.filter(x => x.status === 'client');
    const active = contacts.filter(x => x.status !== 'perdu');
    const signed = clients;
    const opportunities = contacts.filter(x => x.status === 'rdv' || x.status === 'proposition');
    const pipeline = contacts.filter(x => ['prospect', 'rdv', 'proposition'].includes(x.status)).reduce((sum, item) => sum + Number(item.value || 0), 0);
    $('revenue-value').textContent = Number(state.revenue || 0).toLocaleString('fr-FR');
    $('revenue-target-label').textContent = `${Number(settings.revenueTarget).toLocaleString('fr-FR')} €`;
    $('savings-target-label').textContent = `${Number(settings.savingsTarget).toLocaleString('fr-FR')} €`;
    $('pipeline-value').textContent = pipeline.toLocaleString('fr-FR');
    $('funnel-prospects').textContent = prospects.filter(x => x.status === 'prospect').length;
    $('funnel-opportunities').textContent = opportunities.length;
    $('funnel-clients').textContent = signed.length;
    const lost = contacts.filter(x => x.status === 'perdu');
    const knownOutcomes = signed.length + lost.length;
    const conversion = knownOutcomes ? Math.round(signed.length / knownOutcomes * 100) : null;
    $('conversion-rate').textContent = conversion === null ? '—' : `${conversion}%`;
    const signedValues = signed.map(x => Number(x.value || 0)).filter(x => x > 0);
    $('average-deal').textContent = signedValues.length ? `${Math.round(signedValues.reduce((a,b) => a+b, 0) / signedValues.length).toLocaleString('fr-FR')} €` : '—';
    if ($('prospects-value')) $('prospects-value').textContent = prospects.length;
    if ($('clients-value')) $('clients-value').textContent = clients.length;
    loadAdvice();
    
    $('value-clients').textContent = state.clients.filter(x => x.status === 'client').length;
    $('value-processes').textContent = state.processes.length;
    $('value-notes').textContent = state.journal.length;
    $('savings-value').textContent = Number(state.savings || 0).toLocaleString('fr-FR');
    $('savings-label').textContent = `${Number(state.savings || 0).toLocaleString('fr-FR')} / ${Number(settings.savingsTarget).toLocaleString('fr-FR')} €`;
    const progress = (value, target) => target > 0 ? Math.min(100, value / target * 100) : 0;
    $('savings-progress').style.width = `${progress(Number(state.savings || 0), Number(settings.savingsTarget))}%`;
    $('savings-bar').style.width = `${progress(Number(state.savings || 0), Number(settings.savingsTarget))}%`;
    $('revenue-bar').style.width = `${progress(Number(state.revenue || 0), Number(settings.revenueTarget))}%`;
    $('pipeline-bar').style.width = `${progress(pipeline, Number(settings.revenueTarget))}%`;
    if ($('prospects-bar')) $('prospects-bar').style.width = `${Math.min(100, prospects.length * 10)}%`;
    if ($('clients-bar')) $('clients-bar').style.width = `${Math.min(100, clients.length * 20)}%`;
    const next = active.find(x => x.nextAction);
    if (next) { $('next-action-title').textContent = next.nextAction; $('next-action-copy').textContent = `${next.name} · ${next.status}`; }
    renderList('clients-list', state.clients, 'Aucun client ou prospect enregistré.', (x) => `<div class="entry-row"><div><div class="entry-title">${esc(x.name)}</div><div class="entry-meta">${esc(x.note || '')}</div></div><span class="entry-tag">${esc(x.status)}</span></div>`);
    renderList('process-list', state.processes, 'Aucun process documenté.', (x) => `<div class="entry-row"><div><div class="entry-title">${esc(x.title)}</div><div class="entry-meta">${esc(x.description || '')}</div></div><span class="entry-tag">process</span></div>`);
    renderList('journal-list', state.journal, 'Aucune note dans le journal.', (x) => `<div class="entry-row"><div><div class="entry-title">${esc(x.title)}</div><div class="entry-meta">${esc(x.body)}</div></div><span class="entry-tag">${esc(x.date)}</span></div>`, false);
  }
  function renderList(id, items, empty, template, reverse = true) { const el=$(id); const ordered=reverse ? items.slice().reverse() : items.slice(); el.innerHTML=ordered.length ? ordered.map(template).join('') : `<div class="blank-state"><span>—</span><strong>${empty}</strong><p>Utilise le bouton « + Ajouter » pour commencer à construire ta mémoire opérationnelle.</p></div>`; }
  function fields(type) {
    if(type==='client') return `<div class="field"><label>Nom / entreprise</label><input name="name" required placeholder="Ex. Premier client"></div><div class="field"><label>Statut</label><select name="status"><option>prospect</option><option>rdv</option><option>proposition</option><option>client</option><option>perdu</option></select></div><div class="field"><label>Valeur potentielle (€)</label><input name="value" type="number" min="0" placeholder="Ex. 600"></div><div class="field"><label>Prochaine action / échéance</label><input name="nextAction" placeholder="Ex. Relancer vendredi"></div><div class="field"><label>Note</label><textarea name="note" placeholder="Besoin, offre, contexte..."></textarea></div>`;
    if(type==='settings') return `<div class="field"><label>Objectif CA mensuel (€)</label><input name="revenueTarget" type="number" min="0" value="${state.settings?.revenueTarget || 10000}" required></div><div class="field"><label>Objectif épargne (€)</label><input name="savingsTarget" type="number" min="0" value="${state.settings?.savingsTarget || 2000}" required></div><div class="field"><label>Épargne actuelle (€)</label><input name="savings" type="number" min="0" value="${state.savings || 0}" required></div>`
    if(type==='process') return `<div class="field"><label>Nom du process</label><input name="title" required placeholder="Ex. Onboarding client"></div><div class="field"><label>Étapes / description</label><textarea name="description" required placeholder="1. ...&#10;2. ...&#10;3. ..."></textarea></div>`;
    return `<div class="field"><label>Titre</label><input name="title" required placeholder="Décision, apprentissage ou erreur"></div><div class="field"><label>Contenu</label><textarea name="body" required placeholder="Ce qui s'est passé, ce que j'ai appris, ce que je change..."></textarea></div>`;
  }
  let activeType;
  document.querySelectorAll('[data-open]').forEach(btn => btn.addEventListener('click', () => { activeType=btn.dataset.open.replace('-form',''); $('dialog-title').textContent=activeType==='client'?'Nouveau contact':activeType==='process'?'Nouveau process':activeType==='settings'?'Objectifs Business':'Nouvelle note'; $('dialog-fields').innerHTML=fields(activeType); $('entry-dialog').showModal(); }));
  $('entry-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      if (activeType === 'settings') {
        const response = await api('/business/settings', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ revenueTarget: Number(data.revenueTarget), savingsTarget: Number(data.savingsTarget), savings: Number(data.savings) }) });
        if (!response.ok) throw new Error(`API ${response.status}`);
        state.settings = { revenueTarget: Number(data.revenueTarget), savingsTarget: Number(data.savingsTarget) };
        state.savings = Number(data.savings);
      }
      if (activeType === 'client') {
        const response = await api('/business/contact', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name: data.name, status: data.status, value: Number(data.value || 0), nextAction: data.nextAction, note: data.note, source: 'web' }) });
        if (!response.ok) throw new Error(`API ${response.status}`);
        const result = await response.json();
        state.clients.push(result.contact || data);
      }
      if (activeType === 'process') {
        const response = await api('/business/process', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ title: data.title, description: data.description, source: 'web' }) });
        if (!response.ok) throw new Error(`API ${response.status}`);
        const result = await response.json();
        state.processes.push(result.process || data);
      }
      if (activeType === 'journal') {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const response = await api('/journal', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ date: today, text: data.body, category: data.title, source: 'business-web' }) });
        if (!response.ok) throw new Error(`API ${response.status}`);
        await loadJournal();
      }
      save(); render(); $('entry-dialog').close(); e.target.reset();
    } catch (error) {
      console.error('Enregistrement Business OS impossible.', error);
      alert('Impossible de synchroniser cette entrée. Vérifie la connexion puis réessaie.');
    }
  });
  $('calendar-events')?.addEventListener('click', async event => {
    const button = event.target.closest('.calendar-contact');
    if (!button) return;
    const day = String(button.dataset.start || '').slice(0, 10);
    const ref = button.dataset.ref || '';
    button.disabled = true;
    try {
      const response = await api('/business/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Rendez-vous client ${day}`,
          status: 'rdv',
          nextAction: `Suite du rendez-vous du ${day}`,
          note: `Issu de l'agenda${ref ? ` · agenda:${ref}` : ''}`,
          source: 'calendar'
        })
      });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const result = await response.json();
      state.clients.push(result.contact || { name: `Rendez-vous client ${day}`, status: 'rdv' });
      save();
      render();
    } catch (error) {
      console.error('Création contact agenda impossible.', error);
      alert('Impossible de créer le contact depuis l’agenda.');
    } finally {
      button.disabled = false;
    }
  });
  loadBusinessState();
  loadJournal();
  loadTrends();
  loadIntegrations();
  $('export-button').addEventListener('click', () => { const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`lifeos-business-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href); });
  render();
})();
