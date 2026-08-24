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

test('la conversion utilise uniquement les résultats connus', () => {
  const result = computeBusinessMetrics([
    { status: 'prospect' },
    { status: 'client' },
    { status: 'perdu' }
  ]);
  assert.equal(result.conversionRate, 50);
});

test('les agrégats repas additionnent les valeurs persistées', () => {
  const { aggregateMeals } = require('./metrics');
  assert.deepEqual(aggregateMeals([
    { protein_g: 20, carbs_g: 35, calories: 420 },
    { protein_g: 15, carbs_g: 10, calories: 250 }
  ]), { protein: 35, carbs: 45, calories: 670, count: 2 });
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
