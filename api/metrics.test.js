const test = require('node:test');
const assert = require('node:assert/strict');
const { computeBusinessMetrics, buildLifeTrends } = require('./metrics');

test('le pipeline exclut les clients déjà signés', () => {
  const result = computeBusinessMetrics([
    { status: 'prospect', value: 800 },
    { status: 'proposition', value: 1200 },
    { status: 'client', value: 1000 },
    { status: 'perdu', value: 900 }
  ]);
  assert.equal(result.pipeline, 2000);
  assert.equal(result.signedValue, 1000);
  assert.equal(result.clients, 1);
});

test('la valeur mensuelle ne compte que les clients enregistrés dans le mois', () => {
  const result = computeBusinessMetrics([
    { status: 'client', value: 1000, created_at: '2026-08-12T10:00:00Z' },
    { status: 'client', value: 800, created_at: '2026-07-30T10:00:00Z' }
  ], new Date('2026-08-24T12:00:00Z'));
  assert.equal(result.signedValue, 1800);
  assert.equal(result.signedValueMonth, 1000);
});

test('la conversion utilise uniquement les résultats connus', () => {
  const result = computeBusinessMetrics([
    { status: 'prospect' },
    { status: 'client' },
    { status: 'perdu' }
  ]);
  assert.equal(result.conversionRate, 50);
});

test('cash encaissé ne compte que les contacts marqués encaissé, jamais signé = payé', () => {
  const result = computeBusinessMetrics([
    { status: 'client', value: 800, payment_status: 'encaisse', paid_amount: 800, paid_at: '2026-08-10' },
    { status: 'client', value: 600, payment_status: 'facture' },
    { status: 'client', value: 500, payment_status: 'du' }
  ], new Date('2026-08-24T12:00:00Z'));
  assert.equal(result.cashCollected, 800);
  assert.equal(result.cashCollectedMonth, 800);
  assert.equal(result.invoicedPending, 600);
});

test('reste à 10k reste calculable sans prix par deal, mais deals restants reste null sans prix', () => {
  const result = computeBusinessMetrics([
    { status: 'client', value: 1000, created_at: '2026-08-05T10:00:00Z' }
  ], new Date('2026-08-24T12:00:00Z'), { revenueTarget: 10000 });
  assert.equal(result.remainingToTarget, 9000);
  assert.equal(result.pricePerDeal, null);
  assert.equal(result.dealsRemaining, null);
});

test('deals restants se calcule dès que Hermes a fixé un prix par deal', () => {
  const result = computeBusinessMetrics([
    { status: 'client', value: 1000, created_at: '2026-08-05T10:00:00Z' }
  ], new Date('2026-08-24T12:00:00Z'), { revenueTarget: 10000, pricePerDeal: 800 });
  assert.equal(result.remainingToTarget, 9000);
  assert.equal(result.pricePerDeal, 800);
  assert.equal(result.dealsRemaining, 12);
});

test('les agrégats repas additionnent les valeurs persistées', () => {
  const { aggregateMeals } = require('./metrics');
  assert.deepEqual(aggregateMeals([
    { protein_g: 20, carbs_g: 35, fat_g: 12, calories: 420 },
    { protein_g: 15, carbs_g: 10, metadata: { fat_g: 8 }, calories: 250 }
  ]), { protein: 35, carbs: 45, fat: 20, calories: 670, count: 2 });
});

test('les tendances conservent null et trient les jours', () => {
  const result = buildLifeTrends([
    { date: '2026-08-24', sommeil: 7.5, sportMin: null },
    { date: '2026-08-22', sommeil: 7, sportMin: 0 }
  ]);
  assert.deepEqual(result.map(x => x.date), ['2026-08-22', '2026-08-24']);
  assert.equal(result[0].sportMinutes, 0);
  assert.equal(result[1].sportMinutes, null);
});

test('moyenne semaine ressenti sur 7 jours', () => {
  const { buildFeelAverages } = require('./metrics');
  const result = buildFeelAverages([
    { date: '2026-08-20', humeur: 4, energie: 5, stress: 8 },
    { date: '2026-08-21', humeur: 8, energie: 7, stress: 2 },
    { date: '2026-08-22', humeur: 6, energie: 6, stress: 5 }
  ], 7);
  assert.equal(result.moodScore, 6);
  assert.equal(result.energyScore, 6);
  assert.equal(result.stressScore, 5);
  assert.equal(result.days, 3);
});

test('rollup semaine additionne le business et moyenne le sommeil', () => {
  const { buildPeriodRollup, daysEndingOn, upcomingActions } = require('./metrics');
  const days = [
    { date: '2026-08-20', sommeil: 7, businessMin: 30, appels: 2, ca: 0 },
    { date: '2026-08-24', sommeil: 8, businessMin: 60, appels: 1, ca: 400 },
    { date: '2026-08-25', sommeil: 6, businessMin: 45, appels: 3, ca: 200 }
  ];
  const week = buildPeriodRollup(daysEndingOn(days, '2026-08-25', 7));
  assert.equal(week.sleepHours, 7);
  assert.equal(week.prospectingMinutes, 135);
  assert.equal(week.callsMade, 6);
  assert.equal(week.revenueGenerated, 600);
  assert.equal(week.days, 3);
  const dayOnly = buildPeriodRollup([{ date: '2026-08-25', sommeil: 8 }]);
  assert.equal(dayOnly.sleepHours, 8);
  assert.equal(dayOnly.prospectingMinutes, null);
  const actions = upcomingActions([
    { name: 'Plus tard', next_action: 'Relancer', next_action_at: '2026-09-01' },
    { name: 'Urgent', next_action: 'Appeler', next_action_at: '2026-08-26' },
    { name: 'Sans date', next_action: 'Noter' }
  ]);
  assert.equal(actions[0].name, 'Urgent');
  assert.equal(actions[2].name, 'Sans date');
});

test('la série 28 j laisse les jours manquants à null', () => {
  const { fillDailySeries } = require('./metrics');
  const series = fillDailySeries([
    { date: '2026-08-20', sommeil: 7.5, energie: 6 },
    { date: '2026-08-25', sommeil: 8, energie: 7 }
  ], '2026-08-25', 7);
  assert.equal(series.length, 7);
  assert.equal(series[0].date, '2026-08-19');
  assert.equal(series[0].sleepHours, null);
  assert.equal(series[1].sleepHours, 7.5);
  assert.equal(series[5].sleepHours, null);
  assert.equal(series[6].sleepHours, 8);
});

test('changepoint ignore les trous et détecte une rupture', () => {
  const { detectChangepoint } = require('./metrics');
  const points = [];
  for (let i = 1; i <= 16; i += 1) {
    points.push({ date: `2026-08-${String(i).padStart(2, '0')}`, value: i <= 8 ? 5 : 9 });
  }
  const hit = detectChangepoint(points);
  assert.equal(hit.date, '2026-08-09');
  assert.equal(hit.direction, 'up');
  assert.ok(hit.score >= 0.55);
});

test('changepoint n’utilise pas les jours vides comme des zéros', () => {
  const { detectChangepoint } = require('./metrics');
  const points = [
    { date: '2026-08-10', value: null },
    { date: '2026-08-11', value: null },
    { date: '2026-08-12', value: null },
    { date: '2026-08-13', value: null },
    { date: '2026-08-20', value: 7.5 },
    { date: '2026-08-21', value: 8 },
    { date: '2026-08-22', value: 7.8 }
  ];
  assert.equal(detectChangepoint(points), null);
});

test('lag sommeil → énergie J+1 ne s’affirme pas sous 12 paires', () => {
  const { buildSleepEnergyLag } = require('./metrics');
  const series = [];
  for (let i = 1; i <= 8; i += 1) {
    series.push({ date: `2026-08-${String(i).padStart(2, '0')}`, sleepHours: 5, energyScore: 4 });
  }
  const lag = buildSleepEnergyLag(series);
  assert.equal(lag.enough, false);
  assert.equal(lag.sentence, null);
});

test('lag sommeil → énergie J+1 chiffre les nuits courtes', () => {
  const { buildSleepEnergyLag } = require('./metrics');
  const series = [];
  for (let i = 1; i <= 16; i += 1) {
    const low = i % 2 === 1;
    series.push({
      date: `2026-08-${String(i).padStart(2, '0')}`,
      sleepHours: low ? 5.5 : 8,
      energyScore: low ? 7.5 : 4
    });
  }
  const lag = buildSleepEnergyLag(series);
  assert.equal(lag.enough, true);
  assert.equal(lag.n, 15);
  assert.ok(lag.delta <= -1);
  assert.match(lag.sentence, /6,5/);
});

test('les jeudis bas ressortent dans la phrase weekday', () => {
  const { buildWeekdayPattern } = require('./metrics');
  const series = [];
  for (let i = 0; i < 28; i += 1) {
    const date = new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10);
    const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    series.push({ date, energyScore: dow === 3 ? 4 : 7 });
  }
  const weekday = buildWeekdayPattern(series, 'energyScore');
  assert.match(weekday.sentence, /jeudi/);
  assert.match(weekday.sentence, /dessous/);
});

test('le calendrier aligne 12 semaines et ne convertit pas un trou en zéro', () => {
  const { buildCalendar, buildPattern } = require('./metrics');
  const cells = buildCalendar([
    { date: '2026-08-25', score: 80, businessMin: 40 }
  ], '2026-08-25', 12);
  assert.equal(cells.length, 84);
  assert.equal(cells[0].weekday, 'lundi');
  const today = cells.find((cell) => cell.date === '2026-08-25');
  assert.equal(today.hasData, true);
  assert.equal(today.level, 4);
  const empty = cells.find((cell) => cell.date === '2026-08-24');
  assert.equal(empty.hasData, false);
  assert.equal(empty.level, 0);
  const pattern = buildPattern([
    { date: '2026-08-25', sommeil: 8, energie: 7, businessMin: 40 }
  ], '2026-08-25');
  assert.equal(pattern.series.length, 28);
  assert.equal(pattern.knownDays, 1);
});
