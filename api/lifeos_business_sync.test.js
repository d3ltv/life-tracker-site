const test = require('node:test');
const assert = require('node:assert/strict');

// Mock business store for unit-level verification of activity/contact planning helpers
test('normalizeIaDay fournit les champs attendus par le sync business', () => {
    const { normalizeIaDay } = require('./lifeos_sync');
    const day = normalizeIaDay({
        date: '2026-08-25',
        appels: 4,
        physique: 1,
        messages: 3,
        rdv: 2,
        clients: 1,
        ca: 800,
        businessMin: 90
    });
    assert.equal(day.callsMade, 4);
    assert.equal(day.prospectsPhysical, 1);
    assert.equal(day.messagesSent, 3);
    assert.equal(day.meetingsBooked, 2);
    assert.equal(day.newClients, 1);
    assert.equal(day.revenueGenerated, 800);
    assert.equal(day.prospectingMinutes, 90);
});
