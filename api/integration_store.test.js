const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('./integration_store');

test('accepte un snapshot agrégé Gmail', () => {
  const row = validate({ source: 'gmail', snapshot_date: '2026-08-24', summary: { email_count: 3 }, items: [] });
  assert.equal(row.source, 'gmail');
  assert.equal(row.summary.email_count, 3);
});

test('refuse une source non autorisée', () => {
  assert.throws(() => validate({ source: 'browser_history', snapshot_date: '2026-08-24' }), /Source invalide/);
});

test('limite les éléments synchronisés à 100', () => {
  const row = validate({ source: 'calendar', snapshot_date: '2026-08-24', items: Array.from({length: 130}, (_, i) => ({ start: `2026-08-24T0${i % 10}:00:00` })) });
  assert.equal(row.items.length, 100);
});

test('retire emails, URLs et titres des snapshots', () => {
  const row = validate({
    source: 'gmail',
    snapshot_date: '2026-08-24',
    summary: { email_count_30d: 12, status: 'connected', leaked: 'secret' },
    items: [{ date: '2026-08-24', kind: 'rendez-vous potentiel', confidence: 'moyenne', subject: 'Devis villa', from: 'ada@example.com', url: 'https://mail.google.com' }]
  });
  assert.equal(row.summary.email_count_30d, 12);
  assert.equal(row.summary.leaked, undefined);
  assert.deepEqual(row.items[0], { date: '2026-08-24', kind: 'rendez-vous potentiel', confidence: 'moyenne' });
});
