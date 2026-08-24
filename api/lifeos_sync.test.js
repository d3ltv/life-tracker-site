const test = require('node:test');
const assert = require('node:assert/strict');
const { pickLifeosDay, normalizeIaDay } = require('./lifeos_sync');

test('prend le jour Paris même s’il n’est pas dans mois.jours', () => {
    const payload = {
        jour: { date: '2026-08-25', sommeil: 7, humeur: 6, note: undefined },
        mois: { jours: [{ date: '2026-08-24', sommeil: 8 }] }
    };
    const { day } = pickLifeosDay(payload, '2026-08-25');
    assert.equal(day.date, '2026-08-25');
    assert.equal(day.sleepHours, 7);
    assert.equal(day.moodScore, 6);
});

test('un ingest plus récent recouvre le pull', () => {
    const payload = { jour: { date: '2026-08-25', sommeil: 6 }, mois: { jours: [] } };
    const { day } = pickLifeosDay(payload, '2026-08-25', { date: '2026-08-25', sommeil: 8, businessMin: 45 });
    assert.equal(day.sleepHours, 8);
    assert.equal(day.prospectingMinutes, 45);
});

test('normalize mappe les clés françaises', () => {
    const day = normalizeIaDay({ date: '2026-08-25', sportMin: 20, energie: 4 });
    assert.equal(day.sportMinutes, 20);
    assert.equal(day.energyScore, 4);
});

test('normalize mappe les nouveaux signaux (dette sommeil, social, deep work)', () => {
    const day = normalizeIaDay({
        date: '2026-08-25',
        detteSommeil: 4.2,
        socialMin: 45,
        deepWorkMin: 90,
        meetingMin: 120,
        lectureMin: 15,
    });
    assert.equal(day.sleepDebtHours, 4.2);
    assert.equal(day.socialMinutes, 45);
    assert.equal(day.deepWorkMinutes, 90);
    assert.equal(day.meetingMinutes, 120);
    assert.equal(day.readingMinutes, 15);
});
