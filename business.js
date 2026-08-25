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
      renderPipelineAuto(data.pipeline || data.insights?.pipeline || null);
      renderPipelineGap();
    } catch (error) {
      $('trend-note').textContent = 'Tendances temporairement indisponibles.';
      if ($('pipeline-auto-status')) $('pipeline-auto-status').textContent = 'Indisponible';
    }
  }

  function renderPipelineAuto(pipeline) {
    state.pipelineAuto = pipeline || null;
    const status = $('pipeline-auto-status');
    if (!pipeline) {
      if (status) status.textContent = 'Pas encore de data habit-track';
      renderPipelineGap();
      return;
    }
    if (status) status.textContent = 'Sync habit-track';
    const set = (id, text) => { if ($(id)) $(id).textContent = text; };
    const bar = (id, value, max) => {
      const el = $(id);
      if (!el) return;
      el.style.width = value != null && max ? `${Math.min(100, Math.max(0, Number(value) / max * 100))}%` : '0%';
    };
    set('auto-contacts-7d', pipeline.contacts7d ?? '—');
    set('auto-conversion-7d', pipeline.conversionPct7d == null ? '—' : String(pipeline.conversionPct7d).replace('.', ','));
    set('auto-conversion-28d', pipeline.conversionPct28d == null ? '—' : String(pipeline.conversionPct28d).replace('.', ','));
    set('auto-clients-7d', `${pipeline.clients7d ?? 0} client(s) / ${pipeline.contacts7d ?? 0} contact(s)`);
    set('auto-clients-28d', `${pipeline.clients28d ?? 0} client(s) / ${pipeline.contacts28d ?? 0} contact(s)`);
    bar('auto-contacts-bar', pipeline.contacts7d, 40);
    bar('auto-conversion-bar', pipeline.conversionPct7d, 40);
    bar('auto-conversion-28d-bar', pipeline.conversionPct28d, 40);
    const note = $('pipeline-auto-note');
    if (note) {
      const sameDay = pipeline.conversionPctJourJ == null ? '' : ` · conversion jour J ${String(pipeline.conversionPctJourJ).replace('.', ',')}%`;
      note.textContent = `Alimenté par habit-track · ${pipeline.joursMesures || 0} jours mesurés${sameDay}.`;
    }
    renderPipelineGap();
  }

  function renderPipelineGap() {
    const note = $('pipeline-gap');
    if (!note) return;
    const pipeline = state.pipelineAuto;
    const contacts = [...(state.prospects || []), ...(state.clients || [])];
    const crmProspects = contacts.filter((item) => item.status === 'prospect').length;
    const autoContacts = pipeline?.contacts7d;
    if (autoContacts == null) {
      note.textContent = 'Les deux pipelines se lisent l’un contre l’autre : le CRM nomme, habit-track compte le volume.';
      return;
    }
    if (Number(autoContacts) > crmProspects) {
      note.textContent = `Écart : habit-track a noté ${autoContacts} contact(s) en 7 j, le CRM n’en liste que ${crmProspects}. Le nominatif sous-déclare.`;
    } else if (crmProspects > Number(autoContacts)) {
      note.textContent = `Le CRM a ${crmProspects} prospect(s) ; habit-track en a compté ${autoContacts} cette semaine.`;
    } else {
      note.textContent = `Les deux sources s’alignent (${autoContacts} contact(s) cette semaine).`;
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
      setConnection('connection-hermes', connections.hermes !== false, 'agent Telegram · Gateway locale', 'agent hors ligne');
      setConnection('connection-supabase', remote.source === 'supabase', 'base cloud synchronisée', 'mode local uniquement');
      setConnection('connection-lifeos', true, 'saisie du matin via API IA', 'API IA indisponible');
      setConnection('connection-google', connections.google, 'agrégats synchronisés au site', 'local sur Mac · pas encore synchronisé');
      setConnection('connection-activitywatch', connections.activitywatch, 'agrégats synchronisés au site', 'local sur Mac · pas encore synchronisé');
      if (remote.source !== 'supabase') return;
      state.clients = (remote.contacts || []).map(item => ({
        ...item,
        value: item.value ?? 0,
        nextAction: item.next_action ?? item.nextAction ?? '',
        nextActionAt: item.next_action_at ?? item.nextActionAt ?? null,
        note: item.note ?? ''
      }));
      state.prospects = [];
      state.processes = remote.processes || [];
      if (remote.metrics) {
        state.revenue = Number(remote.metrics.signedValueMonth || 0);
        state.metrics = {
          cashCollectedMonth: remote.metrics.cashCollectedMonth ?? 0,
          remainingToTarget: remote.metrics.remainingToTarget ?? null,
          dealsRemaining: remote.metrics.dealsRemaining ?? null
        };
      }
      if (remote.settings) {
        state.settings = {
          revenueTarget: Number(remote.settings.revenue_target ?? 10000),
          savingsTarget: Number(remote.settings.savings_target ?? 2000),
          pricePerDeal: remote.settings.price_per_deal ?? null
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

  async function loadSources() {
    try {
      const response = await api('/business/sources');
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      state.sources = data.sources || [];
      renderSources();
    } catch (error) {
      console.warn('Sources : mode local.', error);
    }
  }

  function renderSources() {
    const el = $('sources-list');
    if (!el) return;
    const sources = state.sources || [];
    el.innerHTML = sources.length ? sources.map(s => `<div class="entry-row"><div><div class="entry-title">${esc(s.name)}</div><div class="entry-meta">${esc(s.type)} · ${s.is_active ? 'actif' : 'inactif'} · ${s.last_run_at ? `dernier run ${s.last_run_at.slice(0,10)}` : 'jamais lancé'} · ${s.leads_total || 0} leads total</div></div><span class="entry-tag">${esc(s.type)}</span></div>`).join('') : `<div class="blank-state"><span>S</span><strong>Aucune source configurée.</strong><p>Ajoute ta source Apify, LinkedIn, recommandations… pour tracker le volume et la qualité.</p></div>`;
  }

  async function loadActivities() {
    try {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const response = await api(`/business/activities?date=${today}&limit=50`);
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      state.activities = data.activities || [];
      renderActivities();
    } catch (error) {
      console.warn('Activités : mode local.', error);
    }
  }

  function renderActivities() {
    const el = $('activities-list');
    if (!el) return;
    const activities = state.activities || [];
    el.innerHTML = activities.length ? activities.map(a => `<div class="entry-row"><div><div class="entry-title">${esc(a.channel)} · ${esc(a.outcome)}</div><div class="entry-meta">${a.contact_name ? `${esc(a.contact_name)} · ` : ''}${esc(a.note || '')}${a.duration_min ? ` · ${a.duration_min} min` : ''}</div></div><span class="entry-tag">${esc(a.date)}</span></div>`).join('') : `<div class="blank-state"><span>A</span><strong>Aucune activité enregistrée.</strong><p>Note chaque action : appel, visite, email. Le funnel se construit ici.</p></div>`;
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
    const metrics = state.metrics || {};
    const remaining = metrics.remainingToTarget != null ? Number(metrics.remainingToTarget) : Math.max(0, Number(settings.revenueTarget) - Number(state.revenue || 0));
    $('remaining-value').textContent = remaining.toLocaleString('fr-FR');
    if ($('remaining-bar')) $('remaining-bar').style.width = `${Number(settings.revenueTarget) > 0 ? Math.min(100, Number(state.revenue || 0) / Number(settings.revenueTarget) * 100) : 0}%`;
    const pricePerDeal = settings.pricePerDeal;
    if ($('remaining-note')) {
      $('remaining-note').innerHTML = pricePerDeal
        ? `À ${Number(pricePerDeal).toLocaleString('fr-FR')} € / offre, il faut encore <b>${metrics.dealsRemaining ?? Math.ceil(remaining / pricePerDeal)}</b> client(s).`
        : `Prix d'offre non encore fixé par Hermes · objectif ${Number(settings.revenueTarget).toLocaleString('fr-FR')} €`;
    }
    if ($('cash-collected-label')) $('cash-collected-label').textContent = `${Number(metrics.cashCollectedMonth || 0).toLocaleString('fr-FR')} €`;
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
    const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
    const dated = active
      .filter((item) => item.nextAction || item.next_action)
      .sort((a, b) => String(a.nextActionAt || a.next_action_at || '9999-12-31').localeCompare(String(b.nextActionAt || b.next_action_at || '9999-12-31')));
    const next = dated[0];
    if (next) {
      $('next-action-title').textContent = next.nextAction || next.next_action;
      const due = next.nextActionAt || next.next_action_at;
      $('next-action-copy').textContent = `${next.name} · ${next.status}${due ? ` · ${due}` : ''}`;
    }
    const sortedClients = state.clients.slice().sort((a, b) => {
      const da = a.nextActionAt || a.next_action_at || '';
      const db = b.nextActionAt || b.next_action_at || '';
      if (da && !db) return -1;
      if (!da && db) return 1;
      if (da !== db) return String(da).localeCompare(String(db));
      return 0;
    });
    renderList('clients-list', sortedClients, 'Aucun client ou prospect enregistré.', (x) => {
      const due = x.nextActionAt || x.next_action_at;
      const overdue = due && due < todayKey;
      const action = x.nextAction || x.next_action || x.note || '';
      const paymentStatus = x.payment_status || 'du';
      const paymentLabel = paymentStatus === 'encaisse' ? 'encaissé' : paymentStatus === 'facture' ? 'facturé' : 'dû';
      const paymentTag = x.status === 'client' ? `<span class="payment-tag" data-status="${esc(paymentStatus)}">${esc(paymentLabel)}</span>` : '';
      return `<div class="entry-row ${overdue ? 'is-overdue' : ''}"><div><div class="entry-title">${esc(x.name)} ${paymentTag}</div><div class="entry-meta">${esc(action)}${due ? ` · ${esc(due)}` : ''}</div></div><span class="entry-tag">${esc(due || x.status)}</span></div>`;
    }, false);
    renderList('process-list', state.processes, 'Aucun process documenté.', (x) => `<div class="entry-row"><div><div class="entry-title">${esc(x.title)}</div><div class="entry-meta">${esc(x.description || '')}</div></div><span class="entry-tag">${esc(x.source === 'hermes' ? 'hermes' : 'process')}</span></div>`);
    renderList('journal-list', state.journal, 'Aucune note dans le journal.', (x) => `<div class="entry-row"><div><div class="entry-title">${esc(x.title)}</div><div class="entry-meta">${esc(x.body)}</div></div><span class="entry-tag">${esc(x.date)}</span></div>`, false);
    renderPipelineGap();
  }
  function renderList(id, items, empty, template, reverse = true) {
    const el = $(id);
    const ordered = reverse ? items.slice().reverse() : items.slice();
    const hint = id === 'process-list'
      ? "Dis-le à Hermes sur Telegram, ou ajoute-le ici. Exemple : mon process vidéo recrutement : je repère les annonces, j'appelle, je propose un devis, je tourne, je livre."
      : 'Utilise le bouton « + Ajouter » pour commencer à construire ta mémoire opérationnelle.';
    el.innerHTML = ordered.length ? ordered.map(template).join('') : `<div class="blank-state"><span>—</span><strong>${empty}</strong><p>${hint}</p></div>`;
  }
  function fields(type) {
      if(type==='client') return `<div class="field"><label>Nom / entreprise</label><input name="name" required placeholder="Ex. Premier client"></div><div class="field"><label>Statut</label><select name="status"><option>prospect</option><option>rdv</option><option>proposition</option><option>client</option><option>perdu</option></select></div><div class="field"><label>Valeur potentielle (€)</label><input name="value" type="number" min="0" placeholder="Ex. 600"></div><div class="field"><label>Prochaine action</label><input name="nextAction" placeholder="Ex. Relancer vendredi"></div><div class="field"><label>Échéance</label><input name="nextActionAt" type="date"></div><div class="field"><label>Encaissement</label><select name="paymentStatus"><option value="du">Dû (rien reçu)</option><option value="facture">Facturé</option><option value="encaisse">Encaissé</option></select></div><div class="field"><label>Montant encaissé (€)</label><input name="paidAmount" type="number" min="0" placeholder="Ex. 800"></div><div class="field"><label>Note</label><textarea name="note" placeholder="Besoin, offre, contexte..."></textarea></div>`;
      if(type==='source') return `<div class="field"><label>Nom de la source</label><input name="name" required placeholder="Ex. Apify Industrie Tours"></div><div class="field"><label>Type</label><select name="type"><option value="apify">Apify (scraping annonces)</option><option value="linkedin">LinkedIn</option><option value="referral">Recommandation</option><option value="cold">Cold outreach</option><option value="autre">Autre</option></select></div><div class="field"><label>Config (JSON)</label><textarea name="config" placeholder='{"secteur": "industrie", "ville": "Tours", "sites": ["france-travail", "indeed", "hellowork"]}'></textarea></div>`;
      if(type==='activity') return `<div class="field"><label>Date (YYYY-MM-DD)</label><input name="date" type="date" required></div><div class="field"><label>Source</label><select name="source_id"><option value="">— Aucune —</option>${(state.sources || []).map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></div><div class="field"><label>Contact (optionnel)</label><select name="contact_id"><option value="">— Aucun —</option>${(state.clients || []).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Canal</label><select name="channel"><option value="appel">Appel</option><option value="visite">Visite physique</option><option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="sms">SMS</option><option value="autre">Autre</option></select></div><div class="field"><label>Résultat</label><select name="outcome"><option value="pas_de_reponse">Pas de réponse</option><option value="refus">Refus</option><option value="rdv">RDV obtenu</option><option value="devis_envoye">Devis envoyé</option><option value="signe">Signé</option><option value="perdu">Perdu</option><option value="a_relancer">À relancer</option></select></div><div class="field"><label>Durée (min)</label><input name="duration_min" type="number" min="0" placeholder="Ex. 15"></div><div class="field"><label>Note</label><textarea name="note" placeholder="Contexte, objection, prochaine étape..."></textarea></div>`;
      if(type==='settings') return `<div class="field"><label>Objectif CA mensuel (€)</label><input name="revenueTarget" type="number" min="0" value="${state.settings?.revenueTarget || 10000}" required></div><div class="field"><label>Objectif épargne (€)</label><input name="savingsTarget" type="number" min="0" value="${state.settings?.savingsTarget || 2000}" required></div><div class="field"><label>Épargne actuelle (€)</label><input name="savings" type="number" min="0" value="${state.savings || 0}" required></div><div class="field"><label>Prix réel d'une offre (€) — laisse vide si pas encore tranché</label><input name="pricePerDeal" type="number" min="0" placeholder="Ex. 800" value="${state.settings?.pricePerDeal ?? ''}"></div>`
      if(type==='process') return `<div class="field"><label>Nom du process</label><input name="title" required placeholder="Ex. Onboarding client"></div><div class="field"><label>Étapes / description</label><textarea name="description" required placeholder="1. ...\n2. ...\n3. ..."></textarea></div>`;
      return `<div class="field"><label>Titre</label><input name="title" required placeholder="Décision, apprentissage ou erreur"></div><div class="field"><label>Contenu</label><textarea name="body" required placeholder="Ce qui s'est passé, ce que j'ai appris, ce que je change..."></textarea></div>`;
  }
  let activeType;
  document.querySelectorAll('[data-open]').forEach(btn => btn.addEventListener('click', () => { activeType=btn.dataset.open.replace('-form',''); $('dialog-title').textContent=activeType==='client'?'Nouveau contact':activeType==='process'?'Nouveau process':activeType==='settings'?'Objectifs Business':'Nouvelle note'; $('dialog-fields').innerHTML=fields(activeType); $('entry-dialog').showModal(); }));
  $('entry-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      if (activeType === 'settings') {
        const pricePerDeal = data.pricePerDeal === '' || data.pricePerDeal === undefined ? null : Number(data.pricePerDeal);
        const revenueTarget = Number(data.revenueTarget);
        const response = await api('/business/settings', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ revenueTarget, savingsTarget: Number(data.savingsTarget), savings: Number(data.savings), pricePerDeal }) });
        if (!response.ok) throw new Error(`API ${response.status}`);
        state.settings = { revenueTarget, savingsTarget: Number(data.savingsTarget), pricePerDeal };
        state.savings = Number(data.savings);
        const remainingToTarget = Math.max(0, revenueTarget - Number(state.revenue || 0));
        state.metrics = {
          ...state.metrics,
          remainingToTarget,
          dealsRemaining: pricePerDeal ? Math.ceil(remainingToTarget / pricePerDeal) : null
        };
      }
      if (activeType === 'client') {
        const response = await api('/business/contact', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name: data.name, status: data.status, value: Number(data.value || 0), nextAction: data.nextAction, nextActionAt: data.nextActionAt || null, note: data.note, source: 'web', paymentStatus: data.paymentStatus || 'du', paidAmount: Number(data.paidAmount || 0), paidAt: data.paymentStatus === 'encaisse' ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date()) : null }) });
        if (!response.ok) throw new Error(`API ${response.status}`);
        const result = await response.json();
        state.clients.push(result.contact || data);
      }
      if (activeType === 'source') {
        const config = data.config ? JSON.parse(data.config) : {};
        const response = await api('/business/sources', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name: data.name, type: data.type, config, is_active: true }) });
        if (!response.ok) throw new Error(`API ${response.status}`);
        const result = await response.json();
        state.sources = state.sources || [];
        state.sources.push(result.sourceRecord || { name: data.name, type: data.type, config });
      }
      if (activeType === 'activity') {
        const response = await api('/business/activities', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ date: data.date, source_id: data.source_id || null, contact_id: data.contact_id || null, channel: data.channel, outcome: data.outcome, duration_min: data.duration_min ? Number(data.duration_min) : null, note: data.note, metadata: {} }) });
        if (!response.ok) throw new Error(`API ${response.status}`);
        const result = await response.json();
        // Activities are loaded via /business/activities endpoint, not stored in local state
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
  loadSources();
  loadActivities();
  const activateTab = (tab) => {
    document.querySelectorAll('[data-tab]').forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
    });
  };
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      activateTab(tab);
      history.replaceState(null, '', `#${tab}`);
    });
  });
  const initialTab = (location.hash || '').replace('#', '');
  if (['pilot', 'prospect', 'system'].includes(initialTab)) activateTab(initialTab);
  $('export-button').addEventListener('click', () => { const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`lifeos-business-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href); });
  render();
})();
