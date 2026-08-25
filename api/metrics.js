function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeBusinessMetrics(contacts = [], now = new Date(), settings = {}) {
  const active = contacts.filter(item => item.status !== 'perdu');
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const prospects = contacts.filter(item => item.status === 'prospect');
  const opportunities = contacts.filter(item => ['rdv', 'proposition'].includes(item.status));
  const clients = contacts.filter(item => item.status === 'client');
  const pipeline = active
    .filter(item => item.status !== 'client')
    .reduce((sum, item) => sum + number(item.value), 0);
  const signedValue = clients.reduce((sum, item) => sum + number(item.value), 0);
  const signedValueMonth = clients
    .filter(item => String(item.created_at || item.createdAt || '').slice(0, 7) === monthKey)
    .reduce((sum, item) => sum + number(item.value), 0);
  const averageDeal = clients.length ? signedValue / clients.length : null;
  const knownOutcomes = clients.length + contacts.filter(item => item.status === 'perdu').length;
  const conversionRate = knownOutcomes ? clients.length / knownOutcomes * 100 : null;

  // Encaissement réel : distinct du statut CRM. Un contact "client" n'a pas forcément payé.
  const paidContacts = contacts.filter(item => item.payment_status === 'encaisse');
  const cashCollected = paidContacts.reduce((sum, item) => sum + number(item.paid_amount), 0);
  const cashCollectedMonth = paidContacts
    .filter(item => String(item.paid_at || '').slice(0, 7) === monthKey)
    .reduce((sum, item) => sum + number(item.paid_amount), 0);
  const invoicedPending = contacts
    .filter(item => item.payment_status === 'facture')
    .reduce((sum, item) => sum + number(item.value), 0);

  // "Combien il manque ce mois" : objectif − signé du mois, traduit en nombre de deals
  // si Hermes a fixé un prix réel. Tant qu'il n'y a pas de prix, on ne devine pas.
  const revenueTarget = settings.revenueTarget != null ? number(settings.revenueTarget) : 10000;
  const remainingToTarget = Math.max(0, revenueTarget - signedValueMonth);
  const pricePerDeal = settings.pricePerDeal != null && Number(settings.pricePerDeal) > 0
    ? Number(settings.pricePerDeal)
    : null;
  const dealsRemaining = pricePerDeal ? Math.ceil(remainingToTarget / pricePerDeal) : null;

  return {
    prospects: prospects.length,
    opportunities: opportunities.length,
    clients: clients.length,
    pipeline,
    signedValue,
    signedValueMonth,
    averageDeal,
    conversionRate,
    cashCollected,
    cashCollectedMonth,
    invoicedPending,
    revenueTarget,
    remainingToTarget,
    pricePerDeal,
    dealsRemaining
  };
}

function buildLifeTrends(days = [], limit = 30) {
  return days
    .filter(day => day && day.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-Math.max(1, Math.min(Number(limit) || 30, 90)))
    .map(day => ({
      date: day.date,
      sleepHours: day.sommeil ?? day.sleepHours ?? null,
      sportMinutes: day.sportMin ?? day.sportMinutes ?? null,
      businessMinutes: day.businessMin ?? day.prospectingMinutes ?? null,
      moodScore: day.humeur ?? day.moodScore ?? null,
      energyScore: day.energie ?? day.energyScore ?? null,
      stressScore: day.stress ?? day.stressScore ?? null,
      performanceScore: day.score ?? day.performanceScore ?? null
    }));
}

function averageKnown(values = []) {
  const known = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!known.length) return null;
  return Math.round((known.reduce((sum, value) => sum + value, 0) / known.length) * 10) / 10;
}

function buildFeelAverages(days = [], limit = 7) {
  const recent = days
    .filter((day) => day && day.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-Math.max(1, Math.min(Number(limit) || 7, 90)));
  return {
    moodScore: averageKnown(recent.map((day) => day.humeur ?? day.moodScore)),
    energyScore: averageKnown(recent.map((day) => day.energie ?? day.energyScore)),
    stressScore: averageKnown(recent.map((day) => day.stress ?? day.stressScore)),
    days: recent.filter((day) => (day.humeur ?? day.moodScore) != null || (day.energie ?? day.energyScore) != null || (day.stress ?? day.stressScore) != null).length,
    window: limit
  };
}

function mealFat(meal) {
  return number(meal.fat_g ?? meal.lipides ?? meal.metadata?.fat_g ?? meal.metadata?.lipides);
}

function uniqueByDate(days = []) {
  const map = new Map();
  for (const day of days) {
    if (day && day.date) map.set(String(day.date), day);
  }
  return [...map.values()];
}

function daysEndingOn(days = [], endDate, count = 7) {
  const end = String(endDate || '');
  return uniqueByDate(days)
    .filter((day) => !end || String(day.date) <= end)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-Math.max(1, Math.min(Number(count) || 7, 90)));
}

function sumKnown(values = []) {
  const known = values
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!known.length) return null;
  return Math.round(known.reduce((sum, value) => sum + value, 0) * 10) / 10;
}

function pickMetric(day, keys) {
  for (const key of keys) {
    if (day[key] !== undefined && day[key] !== null && day[key] !== '') return day[key];
  }
  return null;
}

function buildPeriodRollup(days = []) {
  const known = uniqueByDate(days).filter((day) => day && day.date);
  const metric = (keys, mode) => {
    const values = known.map((day) => pickMetric(day, keys));
    return mode === 'avg' ? averageKnown(values) : sumKnown(values);
  };
  return {
    sleepHours: metric(['sommeil', 'sleepHours'], 'avg'),
    sportMinutes: metric(['sportMin', 'sportMinutes'], 'sum'),
    moodScore: metric(['humeur', 'moodScore'], 'avg'),
    energyScore: metric(['energie', 'energyScore'], 'avg'),
    stressScore: metric(['stress', 'stressScore'], 'avg'),
    prospectingMinutes: metric(['businessMin', 'prospectingMinutes'], 'sum'),
    callsMade: metric(['appels', 'callsMade'], 'sum'),
    prospectsPhysical: metric(['physique', 'prospectsPhysical'], 'sum'),
    messagesSent: metric(['messages', 'messagesSent'], 'sum'),
    meetingsBooked: metric(['rdv', 'meetingsBooked'], 'sum'),
    revenueGenerated: metric(['ca', 'revenueGenerated'], 'sum'),
    prospectContacts: metric(['contacts', 'prospectContacts'], 'sum'),
    newClients: metric(['clients', 'newClients'], 'sum'),
    performanceScore: metric(['score', 'performanceScore'], 'avg'),
    days: known.length,
    daysWithData: known.filter((day) => (
      pickMetric(day, ['sommeil', 'sleepHours']) != null
      || pickMetric(day, ['humeur', 'moodScore']) != null
      || pickMetric(day, ['businessMin', 'prospectingMinutes']) != null
    )).length
  };
}

function upcomingActions(contacts = [], limit = 5) {
  return (contacts || [])
    .filter((item) => item && (item.next_action || item.nextAction || item.next_action_at || item.nextActionAt))
    .sort((a, b) => {
      const da = String(a.next_action_at || a.nextActionAt || '9999-12-31');
      const db = String(b.next_action_at || b.nextActionAt || '9999-12-31');
      return da.localeCompare(db);
    })
    .slice(0, Math.max(1, Math.min(Number(limit) || 5, 20)))
    .map((item) => ({
      name: item.name,
      status: item.status,
      nextAction: item.next_action || item.nextAction || '',
      nextActionAt: item.next_action_at || item.nextActionAt || null,
      value: number(item.value)
    }));
}

const WEEKDAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function frNum(value, digits = 1) {
  return Number(value).toFixed(digits).replace('.', ',');
}

function addDays(iso, delta) {
  const date = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(delta));
  return date.toISOString().slice(0, 10);
}

function weekdayMon0(iso) {
  return (new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function mean(values = []) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values = []) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function knownNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function seriesPoint(day = {}) {
  return {
    date: day.date || null,
    sleepHours: knownNumber(pickMetric(day, ['sommeil', 'sleepHours'])),
    sportMinutes: pickMetric(day, ['sportMin', 'sportMinutes']) == null ? null : Number(pickMetric(day, ['sportMin', 'sportMinutes'])),
    moodScore: knownNumber(pickMetric(day, ['humeur', 'moodScore'])),
    energyScore: knownNumber(pickMetric(day, ['energie', 'energyScore'])),
    stressScore: knownNumber(pickMetric(day, ['stress', 'stressScore'])),
    businessMinutes: pickMetric(day, ['businessMin', 'prospectingMinutes']) == null ? null : Number(pickMetric(day, ['businessMin', 'prospectingMinutes'])),
    performanceScore: pickMetric(day, ['score', 'performanceScore']) == null ? null : Number(pickMetric(day, ['score', 'performanceScore']))
  };
}

function fillDailySeries(days = [], endDate, count = 28) {
  const map = new Map(uniqueByDate(days).map((day) => [String(day.date), day]));
  const end = String(endDate || '').slice(0, 10);
  if (!end) return [];
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = addDays(end, -i);
    const day = map.get(date);
    out.push(day ? seriesPoint(day) : {
      date,
      sleepHours: null,
      sportMinutes: null,
      moodScore: null,
      energyScore: null,
      stressScore: null,
      businessMinutes: null,
      performanceScore: null
    });
  }
  return out;
}

function detectChangepoint(points = [], minSegment = 4) {
  const known = points.filter((point) => point && point.date && point.value != null && Number.isFinite(Number(point.value)));
  const n = known.length;
  if (n < minSegment * 2 + 1) return null;
  const values = known.map((point) => Number(point.value));
  const sd = stddev(values);
  if (sd < 1e-6) return null;
  let best = null;
  for (let i = minSegment; i <= n - minSegment; i += 1) {
    const before = values.slice(0, i);
    const after = values.slice(i);
    const beforeMean = mean(before);
    const afterMean = mean(after);
    const score = (Math.abs(afterMean - beforeMean) / sd) * Math.sqrt(Math.min(before.length, after.length) / n);
    if (!best || score > best.score) {
      best = {
        date: known[i].date,
        index: i,
        score,
        beforeMean,
        afterMean
      };
    }
  }
  if (!best || best.score < 0.55) return null;
  return {
    date: best.date,
    score: round2(best.score),
    beforeMean: round1(best.beforeMean),
    afterMean: round1(best.afterMean),
    direction: best.afterMean >= best.beforeMean ? 'up' : 'down'
  };
}

function pearson(xs = [], ys = []) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const x = xs[i] - mx;
    const y = ys[i] - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  if (dx < 1e-9 || dy < 1e-9) return null;
  return round2(num / Math.sqrt(dx * dy));
}

function buildWeekdayPattern(series = [], key, { minN = 3, minDelta = 0.6, unit = 'pt' } = {}) {
  const buckets = Array.from({ length: 7 }, () => []);
  for (const day of series) {
    const value = knownNumber(day[key]);
    if (value == null) continue;
    buckets[weekdayMon0(day.date)].push(value);
  }
  const overallValues = buckets.flat();
  const bars = buckets.map((values, index) => ({
    weekday: WEEKDAYS_FR[index],
    avg: values.length ? round1(mean(values)) : null,
    n: values.length
  }));
  if (overallValues.length < 8) {
    return { bars, overall: null, sentence: null };
  }
  const overall = round1(mean(overallValues));
  let peak = null;
  for (const bar of bars) {
    if (bar.n < minN || bar.avg == null) continue;
    const delta = round1(bar.avg - overall);
    if (!peak || Math.abs(delta) > Math.abs(peak.delta)) peak = { ...bar, delta };
  }
  let sentence = null;
  if (peak && Math.abs(peak.delta) >= minDelta) {
    const below = peak.delta < 0;
    sentence = `Les ${peak.weekday}s sont ${frNum(Math.abs(peak.delta))} ${unit} d’énergie en ${below ? 'dessous' : 'dessus'}.`;
  }
  return { bars, overall, sentence };
}

function businessWeekendSentence(series = []) {
  const known = series.filter((day) => day.businessMinutes != null && Number.isFinite(Number(day.businessMinutes)));
  if (known.length < 8) return null;
  const weekdays = known.filter((day) => weekdayMon0(day.date) < 5);
  const weekend = known.filter((day) => weekdayMon0(day.date) >= 5);
  if (weekdays.length < 5) return null;
  const mid = Math.max(1, Math.floor(weekdays.length / 2));
  const first = mean(weekdays.slice(0, mid).map((day) => Number(day.businessMinutes)));
  const last = mean(weekdays.slice(mid).map((day) => Number(day.businessMinutes)));
  const slope = last - first;
  const weekdayMean = mean(weekdays.map((day) => Number(day.businessMinutes)));
  const weekendMean = weekend.length ? mean(weekend.map((day) => Number(day.businessMinutes))) : null;
  const weekendGap = weekendMean == null ? 0 : weekdayMean - weekendMean;
  if (Math.abs(slope) < 12 && weekendGap > 20) return 'Hors effet weekend, le business est stable.';
  if (slope <= -20) return 'Hors effet weekend, le business baisse.';
  if (slope >= 20) return 'Hors effet weekend, le business accélère.';
  return null;
}

function buildSleepEnergyLag(series = [], { minN = 12, lowSleep = 6.5 } = {}) {
  const pairs = [];
  for (let i = 0; i < series.length - 1; i += 1) {
    const sleep = knownNumber(series[i].sleepHours);
    const energy = knownNumber(series[i + 1].energyScore);
    if (sleep == null || energy == null) continue;
    if (addDays(series[i].date, 1) !== series[i + 1].date) continue;
    pairs.push({ sleep, energy });
  }
  const n = pairs.length;
  if (n < minN) {
    return { n, enough: false, r: null, delta: null, sentence: null };
  }
  const r = pearson(pairs.map((row) => row.sleep), pairs.map((row) => row.energy));
  const low = pairs.filter((row) => row.sleep < lowSleep);
  const rest = pairs.filter((row) => row.sleep >= lowSleep);
  let delta = null;
  if (low.length >= 3 && rest.length >= 3) {
    delta = round1(mean(low.map((row) => row.energy)) - mean(rest.map((row) => row.energy)));
  }
  let sentence = null;
  if (delta != null && Math.abs(delta) >= 0.5) {
    const sign = delta < 0 ? '−' : '+';
    sentence = `Les nuits < ${frNum(lowSleep)} h : ${sign}${frNum(Math.abs(delta))} d’énergie le lendemain (n = ${n}).`;
  } else if (r != null && Math.abs(r) >= 0.35) {
    sentence = `Sommeil et énergie J+1 vont dans le même sens (r = ${frNum(r, 2)}, n = ${n}).`;
  }
  return { n, enough: true, r, delta, sentence };
}

function calendarIntensity(point) {
  const hasData = [
    point.sleepHours,
    point.energyScore,
    point.moodScore,
    point.sportMinutes,
    point.businessMinutes,
    point.performanceScore
  ].some((value) => value != null && Number.isFinite(Number(value)));
  if (!hasData) return { hasData: false, level: 0, value: null };
  if (point.performanceScore != null && Number.isFinite(Number(point.performanceScore))) {
    const score = Number(point.performanceScore);
    const level = score >= 75 ? 4 : score >= 55 ? 3 : score >= 35 ? 2 : 1;
    return { hasData: true, level, value: score };
  }
  if (point.businessMinutes != null && Number.isFinite(Number(point.businessMinutes))) {
    const minutes = Number(point.businessMinutes);
    const level = minutes >= 90 ? 4 : minutes >= 45 ? 3 : minutes >= 15 ? 2 : minutes > 0 ? 1 : 1;
    return { hasData: true, level, value: minutes };
  }
  return { hasData: true, level: 1, value: point.sleepHours ?? point.energyScore };
}

function buildCalendar(days = [], endDate, weeks = 12) {
  const end = String(endDate || '').slice(0, 10);
  if (!end) return [];
  const endDow = weekdayMon0(end);
  const start = addDays(end, -endDow - (weeks - 1) * 7);
  const filled = fillDailySeries(days, addDays(start, weeks * 7 - 1), weeks * 7);
  const byDate = new Map(filled.map((day) => [day.date, day]));
  const cells = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const date = addDays(start, i);
    const point = byDate.get(date) || { date };
    const tone = calendarIntensity(point);
    cells.push({
      date,
      weekday: WEEKDAYS_FR[weekdayMon0(date)],
      future: date > end,
      hasData: tone.hasData && date <= end,
      level: date > end ? 0 : tone.level,
      value: date > end ? null : tone.value
    });
  }
  return cells;
}

function changepointsFromCards(cards = []) {
  return (cards || [])
    .filter((card) => card && (card.engine === 'changepoint' || card.moteur === 'changepoint'))
    .map((card) => {
      const dateRow = (card.evidence || []).find((row) => /date/i.test(String(row.label || '')));
      const date = String(dateRow?.value || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      return {
        metric: card.theme || 'serie',
        date,
        label: card.title,
        source: 'habit-track'
      };
    })
    .filter(Boolean);
}

function buildPattern(days = [], endDate, cards = []) {
  const series = fillDailySeries(days, endDate, 28);
  const calendar = buildCalendar(days, endDate, 12);
  const sleepCp = detectChangepoint(series.map((day) => ({ date: day.date, value: day.sleepHours })));
  const energyCp = detectChangepoint(series.map((day) => ({ date: day.date, value: day.energyScore })));
  const businessCp = detectChangepoint(series.map((day) => ({ date: day.date, value: day.businessMinutes })));
  const computed = [
    sleepCp && { metric: 'sleep', label: 'Sommeil', ...sleepCp },
    energyCp && { metric: 'energy', label: 'Énergie', ...energyCp },
    businessCp && { metric: 'business', label: 'Business', ...businessCp }
  ].filter(Boolean);
  const fromCards = changepointsFromCards(cards);
  const changepoints = fromCards.length ? fromCards : computed;
  const weekday = buildWeekdayPattern(series, 'energyScore', { unit: 'pt' });
  const lag = buildSleepEnergyLag(series);
  const businessNote = businessWeekendSentence(series);
  const sentences = [weekday.sentence, lag.sentence, businessNote].filter(Boolean).slice(0, 2);
  const knownDays = series.filter((day) => (
    day.sleepHours != null || day.energyScore != null || day.businessMinutes != null
  )).length;
  return {
    series,
    calendar,
    changepoints,
    weekday,
    lag,
    reading: sentences.join(' ') || null,
    knownDays
  };
}

function aggregateMeals(meals = []) {
  return meals.reduce((totals, meal) => ({
    protein: totals.protein + number(meal.protein_g),
    carbs: totals.carbs + number(meal.carbs_g),
    fat: totals.fat + mealFat(meal),
    calories: totals.calories + number(meal.calories),
    count: totals.count + 1
  }), { protein: 0, carbs: 0, fat: 0, calories: 0, count: 0 });
}

module.exports = {
  computeBusinessMetrics,
  buildLifeTrends,
  buildFeelAverages,
  averageKnown,
  aggregateMeals,
  buildPeriodRollup,
  daysEndingOn,
  uniqueByDate,
  upcomingActions,
  fillDailySeries,
  detectChangepoint,
  buildPattern,
  buildCalendar,
  buildSleepEnergyLag,
  buildWeekdayPattern
};
