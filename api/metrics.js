function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeBusinessMetrics(contacts = [], now = new Date()) {
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
  return { prospects: prospects.length, opportunities: opportunities.length, clients: clients.length, pipeline, signedValue, signedValueMonth, averageDeal, conversionRate };
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
      performanceScore: day.score ?? day.performanceScore ?? null
    }));
}

function aggregateMeals(meals = []) {
  return meals.reduce((totals, meal) => ({
    protein: totals.protein + number(meal.protein_g),
    carbs: totals.carbs + number(meal.carbs_g),
    calories: totals.calories + number(meal.calories),
    count: totals.count + 1
  }), { protein: 0, carbs: 0, calories: 0, count: 0 });
}

module.exports = { computeBusinessMetrics, buildLifeTrends, aggregateMeals };
