/* LifeOS — synthèse personnelle. Une donnée absente n'est jamais convertie en zéro. */
(() => {
  const API_BASE = (window.API_BASE || '/api').replace(/\/$/, '');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const $ = (id) => document.getElementById(id);
  const value = (object, key) => object && object[key] !== undefined && object[key] !== null ? object[key] : null;
  const fmt = (number, digits = 0) => number === null ? '—' : Number(number).toLocaleString('fr-FR', { maximumFractionDigits: digits });
  const setText = (id, text) => { if ($(id)) $(id).textContent = text; };
  let latest = null;
  let period = 'day';

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

  function trendLabel(trend) {
    if (trend === 'rising') return 'en hausse';
    if (trend === 'falling') return 'en baisse';
    if (trend === 'stable') return 'stable';
    return 'Tendance non renseignée';
  }

  function regimeLabel(regime) {
    if (regime === 'critical') return 'critique';
    if (regime === 'high') return 'élevée';
    if (regime === 'watch') return 'à surveiller';
    if (regime === 'ok') return 'ok';
    return '—';
  }

  function signalTone(signal, restNeed, debt) {
    if (signal?.kind === 'bad') return 'critical';
    if (signal?.kind === 'tip') return 'watch';
    if (restNeed?.level === 'need' || debt?.regime === 'critical') return 'critical';
    if (restNeed?.level === 'watch' || debt?.regime === 'high' || debt?.regime === 'watch') return 'watch';
    if (signal?.kind === 'good' || debt?.regime === 'ok') return 'ok';
    return 'ok';
  }

  function pickPeriod(data) {
    const periods = data.periods || {};
    if (period === 'week') return periods.week || {};
    if (period === 'month') return periods.month || {};
    return periods.day || data.lifeos_day || {};
  }

  function periodLabel() {
    if (period === 'week') return '7 jours';
    if (period === 'month') return '28 jours';
    return 'aujourd’hui';
  }

  function renderSleepDebt(debt, day) {
    const hours = debt?.hours ?? value(day, 'sleepDebtHours');
    const plan = debt?.planMin ?? null;
    const regime = debt?.regime || null;
    setText('sleep-debt-hours', fmt(hours, 1));
    setText('sleep-debt-unit', hours === null ? '' : ' h');
    setText('sleep-debt-regime', regimeLabel(regime));
    setText('sleep-debt-trend', hours === null ? 'Pas assez d’historique' : `Tendance ${trendLabel(debt?.trend)}`);
    setText('sleep-debt-plan', plan === null || plan === 0 ? (hours === null ? '—' : '0') : fmt(plan));
    setText('sleep-debt-plan-unit', plan === null || hours === null ? '' : ' min');
    setText('sleep-debt-plan-detail', debt?.nights ? `Sur ${debt.nights} nuits` : 'Minutes en plus par nuit');
    setText('sleep-debt-copy', debt?.prose || debt?.headline || 'Le manque s’accumule nuit après nuit. Une seule grosse nuit ne rembourse pas.');
    setText('sleep-start', value(day, 'sleepStart') || '—');
    setText('sleep-end', value(day, 'sleepEnd') || '—');
    setBar('sleep-debt-bar', hours, 12);
    setBar('sleep-debt-plan-bar', plan, 60);
    const fold = $('fold-sleep-debt');
    if (fold) fold.open = regime === 'critical' || regime === 'high' || regime === 'watch';
  }

  function renderFeelSlots(slots) {
    const bySlot = Object.fromEntries((slots || []).map((item) => [item.slot, item]));
    let any = false;
    for (const key of ['morning', 'afternoon', 'evening']) {
      const row = bySlot[key];
      if (row) any = true;
      setText(`feel-${key}-mood`, row?.mood == null ? '—' : fmt(row.mood, 1));
      setText(`feel-${key}-detail`, row
        ? `Énergie ${fmt(row.energy, 1)}`
        : 'Pas encore de check-in');
      setBar(`feel-${key}-bar`, row?.mood ?? null, 10);
    }
    const fold = $('fold-feel');
    if (fold && any) fold.open = true;
  }

  function renderEngineCards(data) {
    const list = $('engine-cards');
    if (!list) return;
    const cards = data.engine_cards || data.insights?.cards || [];
    if (!cards.length) {
      const signal = data.signal || data.insights?.signal;
      const rest = data.rest_need || data.insights?.restNeed;
      const forecast = data.forecast || data.insights?.forecast;
      const fallback = [];
      if (signal?.title) fallback.push({ title: signal.title, detail: signal.detail, engine: signal.engine, kind: signal.kind });
      if (rest?.headline) fallback.push({ title: rest.headline, detail: rest.prose, engine: 'load', kind: rest.level === 'need' ? 'bad' : 'tip' });
      if (forecast?.title) fallback.push({ title: forecast.title, detail: forecast.detail, engine: 'forecast', kind: forecast.risk === 'high' ? 'bad' : 'tip' });
      if (!fallback.length) {
        list.innerHTML = '<div class="empty-state"><span>◎</span><strong>Pas encore assez d’historique</strong><p>Les cartes apparaissent dès que 3 jours sont notés.</p></div>';
        return;
      }
      list.innerHTML = fallback.map(engineMarkup).join('');
      return;
    }
    list.innerHTML = cards.map(engineMarkup).join('');
  }

  function engineMarkup(card) {
    const kind = card.kind === 'bad' ? 'bad' : card.kind === 'good' ? 'good' : 'tip';
    const evidence = (card.evidence || []).slice(0, 4)
      .map((row) => `<span><b>${esc(row.label)}</b> ${esc(row.value)}</span>`)
      .join('');
    return `<article class="engine-card kind-${kind}"><p class="engine-meta">${esc(card.engine || 'moteur')} · ${esc(card.theme || card.kind || '')}</p><strong>${esc(card.title)}</strong><p>${esc(card.detail || '')}</p>${evidence ? `<div class="engine-evidence">${evidence}</div>` : ''}</article>`;
  }

  function renderNextActions(actions) {
    const list = $('next-actions-list');
    if (!list) return;
    if (!actions || !actions.length) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML = actions.map((item) => {
      const due = item.nextActionAt ? ` · ${item.nextActionAt}` : '';
      const overdue = item.nextActionAt && item.nextActionAt < today;
      return `<div class="next-action ${overdue ? 'is-overdue' : ''}"><b>${esc(item.name)}</b><small>${esc(item.nextAction || item.status)}${esc(due)}</small></div>`;
    }).join('');
  }

  function renderVitals(data) {
    const day = data.lifeos_day || {};
    const rollup = pickPeriod(data);
    const feelWeek = data.feel_week || data.summary?.averages7d || {};
    const month = data.periods?.month || {};
    const debt = data.sleep_debt || data.insights?.sleepDebt || null;
    const sleep = value(rollup, 'sleepHours');
    const sport = value(rollup, 'sportMinutes');
    const mood = value(rollup, 'moodScore');
    const energy = value(rollup, 'energyScore');
    const stress = value(rollup, 'stressScore');
    const businessMin = value(rollup, 'prospectingMinutes');
    const feelN = value(day, 'feelSampleCount') || 0;
    const moodWeek = feelWeek.moodScore != null ? Number(feelWeek.moodScore) : null;
    const energyWeek = feelWeek.energyScore != null ? Number(feelWeek.energyScore) : null;
    const stressWeek = feelWeek.stressScore != null ? Number(feelWeek.stressScore) : null;
    const weekDays = feelWeek.days || 0;
    const isDay = period === 'day';

    setText('sleep-value', fmt(sleep, 1));
    setText('sleep-unit', sleep === null ? '' : ' h');
    setText('sleep-caption', isDay ? 'Objectif 8 h' : `Moyenne · ${periodLabel()}`);
    setText('sport-value', fmt(sport));
    setText('sport-unit', sport === null ? '' : ' min');
    setText('sport-caption', isDay ? 'Objectif 34 min' : `Total · ${periodLabel()}`);
    setText('mood-value', fmt(mood, 1));
    setText('energy-value', fmt(energy, 1));
    setText('mood-caption', mood === null
      ? 'Pas encore de ressenti'
      : isDay
        ? (feelN > 1 ? `Moyenne du jour · ${feelN} créneaux` : 'Moyenne du jour')
        : `Moyenne · ${periodLabel()}`);
    setText('energy-caption', energy === null
      ? 'Pas encore de ressenti'
      : isDay
        ? (feelN > 1 ? `Moyenne du jour · ${feelN} créneaux` : 'Moyenne du jour')
        : `Moyenne · ${periodLabel()}`);
    setText('mood-week', period === 'month'
      ? (month.moodScore == null ? '28 j —' : `28 j ${fmt(month.moodScore, 1)}/10`)
      : moodWeek === null
        ? 'Semaine —'
        : `Semaine ${fmt(moodWeek, 1)}/10 · ${weekDays} j`);
    setText('energy-week', period === 'month'
      ? (month.energyScore == null ? '28 j —' : `28 j ${fmt(month.energyScore, 1)}/10`)
      : energyWeek === null
        ? 'Semaine —'
        : `Semaine ${fmt(energyWeek, 1)}/10 · ${weekDays} j`);
    setText('stress-value', stress === null ? 'Non renseigné' : `${fmt(stress, 1)}/10`);
    setText('stress-detail', stress === null
      ? 'Ajoute ton ressenti dans LifeOS'
      : isDay
        ? (feelN > 1 ? `Moyenne du jour · ${feelN} créneaux` : stress >= 7 ? 'Signal élevé à surveiller' : 'Moyenne du jour')
        : `Moyenne · ${periodLabel()}`);
    setText('stress-week', stressWeek === null ? 'Semaine —' : `Semaine ${fmt(stressWeek, 1)}/10 · ${weekDays} j`);
    setText('stress-chip', stress === null ? 'Stress —' : `Stress ${fmt(stress, 1)}/10`);
    setText('business-hours', businessMin === null ? '—' : fmt(businessMin / 60, 1));
    setText('business-hours-unit', businessMin === null ? '' : ' h');
    setText('business-caption', businessMin === null
      ? 'Prospection non renseignée'
      : `${fmt(businessMin)} min · ${periodLabel()}`);

    setBar('sleep-bar', sleep, 8);
    setBar('sport-bar', sport, isDay ? 34 : period === 'week' ? 240 : 960);
    setBar('mood-bar', mood, 10);
    setBar('energy-bar', energy, 10);
    setBar('stress-bar', stress, 10);
    setBar('business-hours-bar', businessMin, isDay ? 120 : period === 'week' ? 600 : 2400);
  }

  function lastKnown(series, key) {
    for (let i = series.length - 1; i >= 0; i -= 1) {
      if (series[i][key] != null) return series[i][key];
    }
    return null;
  }

  function svgLine(points, x, yOf) {
    const segs = [];
    let d = '';
    points.forEach((point, index) => {
      const value = yOf(point);
      if (value == null) {
        if (d) segs.push(d);
        d = '';
        return;
      }
      d += `${d ? 'L' : 'M'}${x(index).toFixed(1)},${value.toFixed(1)} `;
    });
    if (d) segs.push(d);
    return segs.map((path) => `<path d="${path.trim()}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  }

  function renderPatternChart(el, series, changepoints) {
    if (!el) return;
    if (!series.length) {
      el.innerHTML = '<div class="empty-state"><span>▃</span><strong>Pas encore de série</strong><p>Les courbes apparaissent dès que des jours sont notés.</p></div>';
      return;
    }
    const w = 680;
    const h = 220;
    const pad = { l: 8, r: 8, t: 18, b: 28 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const x = (index) => pad.l + (series.length <= 1 ? innerW / 2 : index / (series.length - 1) * innerW);
    const yScale = (value, max) => pad.t + innerH - (Math.max(0, Math.min(max, value)) / max) * innerH;
    const bizMax = Math.max(120, ...series.map((day) => day.businessMinutes).filter((value) => value != null));
    const ticks = [0, Math.floor((series.length - 1) / 2), series.length - 1].filter((index, pos, list) => list.indexOf(index) === pos);
    const labels = ticks.map((index) => {
      const date = series[index]?.date;
      if (!date) return '';
      const [, m, d] = date.split('-');
      return `<text x="${x(index).toFixed(1)}" y="${h - 6}" text-anchor="${index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'}" fill="#6e6e73" font-size="11">${Number(d)}/${Number(m)}</text>`;
    }).join('');
    const cp = (changepoints || []).map((hit) => {
      const index = series.findIndex((day) => day.date === hit.date);
      if (index < 0) return '';
      const px = x(index).toFixed(1);
      const name = esc(hit.label || hit.metric || 'rupture');
      return `<line x1="${px}" x2="${px}" y1="${pad.t}" y2="${pad.t + innerH}" stroke="#6e6e73" stroke-dasharray="3 4" stroke-width="1"/><text x="${px}" y="${pad.t - 4}" text-anchor="middle" fill="#6e6e73" font-size="10">${name}</text>`;
    }).join('');
    const dots = (key, max, color) => series.map((day, index) => {
      if (day[key] == null) return '';
      return `<circle cx="${x(index).toFixed(1)}" cy="${yScale(day[key], max).toFixed(1)}" r="2.4" fill="${color}"><title>${esc(day.date)} · ${esc(day[key])}</title></circle>`;
    }).join('');
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="presentation">
      <g class="is-sleep" stroke="#0071e3" stroke-width="2">${svgLine(series, x, (day) => day.sleepHours == null ? null : yScale(day.sleepHours, 10))}</g>
      <g class="is-energy" stroke="#1d8b4c" stroke-width="2">${svgLine(series, x, (day) => day.energyScore == null ? null : yScale(day.energyScore, 10))}</g>
      <g class="is-business" stroke="#b85d00" stroke-width="2">${svgLine(series, x, (day) => day.businessMinutes == null ? null : yScale(day.businessMinutes, bizMax))}</g>
      ${cp}${dots('sleepHours', 10, '#0071e3')}${dots('energyScore', 10, '#1d8b4c')}${dots('businessMinutes', bizMax, '#b85d00')}
      ${labels}
    </svg>`;
  }

  function renderWeekdayBars(el, weekday) {
    if (!el) return;
    const bars = weekday?.bars || [];
    if (!bars.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = bars.map((bar) => {
      const known = bar.avg != null;
      const height = known ? Math.max(8, Math.min(100, bar.avg / 10 * 100)) : 0;
      const label = (bar.weekday || '').slice(0, 3);
      return `<div class="weekday-bar ${known ? '' : 'is-empty'}"><strong>${known ? esc(fmt(bar.avg, 1)) : '—'}</strong><b><i style="height:${height}%"></i></b><small>${esc(label)}</small></div>`;
    }).join('');
  }

  function renderCalendar(cells, todayDate) {
    const grid = $('cal-grid');
    const months = $('cal-months');
    if (!grid) return;
    if (!cells.length) {
      grid.innerHTML = '';
      if (months) months.innerHTML = '';
      return;
    }
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const monthNames = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    if (months) {
      const labels = ['<span></span>'];
      weeks.forEach((week, index) => {
        const month = Number(String(week[0]?.date || '').slice(5, 7));
        const prev = Number(String(weeks[index - 1]?.[0]?.date || '').slice(5, 7));
        labels.push(`<span>${index === 0 || month !== prev ? esc(monthNames[month - 1] || '') : ''}</span>`);
      });
      months.innerHTML = labels.join('');
    }
    grid.innerHTML = weeks.map((week) => `<div class="cal-week">${week.map((cell) => {
      const level = cell.future ? 'is-future' : cell.hasData ? `lv-${cell.level}` : '';
      const todayCls = cell.date === todayDate ? ' is-today' : '';
      const title = cell.future ? cell.date : cell.hasData ? `${cell.date} · noté` : `${cell.date} · trou`;
      return `<span class="cal-cell ${level}${todayCls}" title="${esc(title)}"></span>`;
    }).join('')}</div>`).join('');
  }

  function renderPattern(data) {
    const pattern = data.pattern || {};
    const series = pattern.series || [];
    const sleep = lastKnown(series, 'sleepHours');
    const energy = lastKnown(series, 'energyScore');
    const business = lastKnown(series, 'businessMinutes');
    setText('pattern-chip', `${pattern.knownDays || 0} j notés`);
    setText('pattern-reading', pattern.reading || (pattern.knownDays >= 3
      ? 'Assez de points pour la courbe, pas encore pour une phrase (il en faut ~12).'
      : 'Pas encore assez de jours pour une lecture.'));
    const legend = $('pattern-legend');
    if (legend) {
      legend.innerHTML = [
        `<span class="is-sleep"><i></i>Sommeil ${sleep == null ? '—' : `${fmt(sleep, 1)} h`}</span>`,
        `<span class="is-energy"><i></i>Énergie ${energy == null ? '—' : `${fmt(energy, 1)}/10`}</span>`,
        `<span class="is-business"><i></i>Business ${business == null ? '—' : `${fmt(business)} min`}</span>`
      ].join('');
    }
    renderPatternChart($('pattern-chart'), series, pattern.changepoints || []);
    renderWeekdayBars($('weekday-bars'), pattern.weekday);
    renderCalendar(pattern.calendar || [], data.date || today);
  }

  function renderLifeOS(data) {
    const day = data.lifeos_day || {};
    const summary = data.summary || {};
    const insights = data.insights || {};
    const signal = data.signal || insights.signal || null;
    const debt = data.sleep_debt || insights.sleepDebt || null;
    const restNeed = data.rest_need || insights.restNeed || null;
    const feelSlots = data.feel_slots || day.dayFeelSlots || insights.feelSlots || [];
    const rollup = pickPeriod(data);
    const performance = value(period === 'day' ? day : rollup, 'performanceScore') ?? value(day, 'performanceScore');
    const calls = value(rollup, 'callsMade');
    const physical = value(rollup, 'prospectsPhysical');
    const messages = value(rollup, 'messagesSent');
    const meetings = value(rollup, 'meetingsBooked');
    const revenue = value(rollup, 'revenueGenerated');
    const contacts = value(rollup, 'prospectContacts');
    const newClients = value(rollup, 'newClients');
    const businessMin = value(rollup, 'prospectingMinutes');

    renderVitals(data);

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

    setText('prospecting-value', businessMin === null ? '—' : fmt(businessMin));
    setText('prospecting-caption', `minutes · ${periodLabel()}`);
    setText('calls-value', fmt(calls));
    setText('physical-value', fmt(physical));
    setText('messages-value', fmt(messages));
    setText('meetings-value', fmt(meetings));
    setText('revenue-value', revenue === null ? '—' : `${fmt(revenue)} €`);
    setText('contacts-value', fmt(contacts));
    setText('clients-value', fmt(newClients));
    setText('performance-score', performance === null ? '—' : fmt(performance));
    setText('performance-caption', performance === null ? 'Performance non renseignée' : period === 'day' ? 'Score issu des données saisies dans LifeOS.' : `Moyenne · ${periodLabel()}`);
    setText('data-coverage', `${fmt(summary.daysWithData)} jours de données LifeOS`);

    const tone = signalTone(signal, restNeed, debt);
    const hero = $('hero-card');
    if (hero) {
      hero.classList.remove('tone-ok', 'tone-watch', 'tone-critical');
      hero.classList.add(`tone-${tone}`);
    }
    if (signal?.title) {
      setText('hero-kicker', signal.engine ? `SIGNAL · ${String(signal.engine).toUpperCase()}` : 'SIGNAL DU JOUR');
      setText('today-insight', signal.title);
      setText('today-insight-detail', signal.detail || restNeed?.prose || '');
    } else if (restNeed?.headline) {
      setText('hero-kicker', 'CHARGE · REPOS');
      setText('today-insight', restNeed.headline);
      setText('today-insight-detail', restNeed.prose || '');
    } else {
      setText('hero-kicker', 'SIGNAL DU JOUR');
      setText('today-insight', businessMin === null ? 'Donnée business manquante' : businessMin > 0 ? 'Le business a avancé' : 'Aucune prospection enregistrée');
      setText('today-insight-detail', businessMin === null ? 'Impossible de conclure sans donnée.' : `${fmt(businessMin)} minutes de prospection · ${periodLabel()}.`);
    }

    const nextActions = data.next_actions || [];
    if (nextActions[0]) {
      setText('business-verdict', nextActions[0].name);
      setText('business-verdict-detail', `${nextActions[0].nextAction || nextActions[0].status}${nextActions[0].nextActionAt ? ` · ${nextActions[0].nextActionAt}` : ''}`);
    } else {
      setText('business-verdict', businessMin === null ? 'À renseigner' : businessMin > 0 ? 'En mouvement' : 'À relancer');
      setText('business-verdict-detail', businessMin === null ? 'Saisis tes actions business pour mesurer l’avancée.' : businessMin > 0 ? `${fmt(calls)} appel(s) · ${fmt(physical)} visite(s) · ${fmt(meetings)} RDV.` : 'Le North Star demande une action demain.');
    }
    renderNextActions(nextActions);
    renderSleepDebt(debt, day);
    renderFeelSlots(feelSlots);
    renderEngineCards(data);
    renderPattern(data);

    if (performance !== null && $('score-ring')) $('score-ring').style.strokeDashoffset = `${264 - Math.min(264, performance / 100 * 264)}`;
    const screen = data.screen || {};
    setText('screen-source-status', screen.available ? `${fmt(screen.total_hours, 1)} h enregistrées aujourd’hui` : 'export réel à connecter');
    const google = data.google || {};
    setText('google-source-status', google.available ? `${fmt(google.email_count ?? google.email_count)} emails · ${fmt(google.calendar_events_count ?? google.calendar_events_count)} événements` : 'lecture seule · pas encore synchronisé');
    const activitywatch = data.activitywatch || {};
    setText('activitywatch-source-status', activitywatch.available ? `${fmt(activitywatch.active_hours, 1)} h actives aujourd’hui` : 'agrégats Mac à synchroniser');
    const date = data.date || today;
    setText('date-label', new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }).toUpperCase());
    setText('signal-date', period === 'day' ? date.split('-').reverse().join('.') : periodLabel());
  }

  function renderMeals(data) {
    const stats = data.stats || {};
    setText('protein-today', stats.protein === undefined ? '—' : fmt(stats.protein));
    setText('carbs-today', stats.carbs === undefined ? '—' : fmt(stats.carbs));
    setText('fat-today', stats.fat === undefined ? '—' : fmt(stats.fat));
    setText('cals-today', stats.calories === undefined ? '—' : fmt(stats.calories));
    setBar('protein-bar', stats.protein, 150); setBar('carbs-bar', stats.carbs, 250); setBar('fat-bar', stats.fat, 80); setBar('calories-bar', stats.calories, 2200);
    const meals = data.meals || [];
    const list = $('history-list');
    const fold = $('fold-nutrition');
    if (fold) fold.open = meals.length > 0 || Number(stats.calories) > 0;
    if (!meals.length) { list.innerHTML = '<div class="empty-state"><span>○</span><strong>Aucun repas pour le moment</strong><p>Envoie une photo à Hermes. Seuls le nom et les macros apparaissent ici, jamais l’image.</p></div>'; return; }
    list.innerHTML = meals.map((meal) => {
      const created = meal.created_at || meal.createdAt;
      return `<article class="meal-row"><div class="meal-macros-only"><div class="meal-name">${esc(meal.name || meal.meal_type || 'Repas')}</div><div class="meal-time">${created ? new Date(created).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : 'Aujourd’hui'}</div></div><div class="meal-macros"><span><b>${fmt(meal.protein_g)}</b> pro</span><span><b>${fmt(meal.carbs_g)}</b> gluc.</span><span><b>${fmt(meal.fat_g)}</b> lip.</span><span><b>${fmt(meal.calories)}</b> kcal</span></div><div class="quality">${esc(meal.quality || 'à confirmer')}</div></article>`;
    }).join('');
  }

  function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  async function refresh() {
    try {
      const dashboard = await get(`/dashboard?date=${today}`);
      latest = dashboard;
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

  document.querySelectorAll('[data-period]').forEach((button) => {
    button.addEventListener('click', () => {
      period = button.dataset.period;
      document.querySelectorAll('[data-period]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });
      if (latest) renderLifeOS(latest);
    });
  });

  $('refresh-button')?.addEventListener('click', refresh);
  refresh();
  window.setInterval(refresh, 8000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
})();
