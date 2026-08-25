const test = require('node:test');
const assert = require('node:assert/strict');
const { pickLifeosDay, normalizeIaDay, normalizeInsights } = require('./lifeos_sync');

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

test('normalize sépare appels / physique / CA / RDV', () => {
    const day = normalizeIaDay({
        date: '2026-08-25',
        appels: 3,
        physique: 2,
        messages: 5,
        rdv: 1,
        ca: 600,
        clients: 1,
        contacts: 5
    });
    assert.equal(day.callsMade, 3);
    assert.equal(day.prospectsPhysical, 2);
    assert.equal(day.messagesSent, 5);
    assert.equal(day.meetingsBooked, 1);
    assert.equal(day.revenueGenerated, 600);
    assert.equal(day.newClients, 1);
    assert.equal(day.prospectContacts, 5);
});

test('normalizeInsights lit dette + pipeline + signal', () => {
    const insights = normalizeInsights({
        detteSommeil: {
            heures: 5.5,
            regime: 'watch',
            tendance: 'rising',
            resume: '~5.5 h de sommeil en dette',
            prose: 'Ajoute 47 min',
            planMin: 47,
            nuits: 7
        },
        pipeline: {
            contacts7d: 12,
            clients7d: 1,
            conversionPct7d: 8.3,
            contacts28d: 40,
            clients28d: 3,
            conversionPct28d: 7.5,
            conversionPctJourJ: 10,
            joursMesures: 8
        },
        signal: { titre: 'Dérive sport', detail: 'Trop bas', moteur: 'drift' },
        ressentiSlots: [{ slot: 'morning', mood: 6.2, energy: 5.1, n: 9 }]
    });
    assert.equal(insights.sleepDebt.hours, 5.5);
    assert.equal(insights.sleepDebt.regime, 'watch');
    assert.equal(insights.sleepDebt.planMin, 47);
    assert.equal(insights.pipeline.contacts7d, 12);
    assert.equal(insights.pipeline.conversionPct7d, 8.3);
    assert.equal(insights.signal.title, 'Dérive sport');
    assert.equal(insights.feelSlots[0].slot, 'morning');
});

test('normalizeInsights lit cartes moteur, repos, dérives et prévision', () => {
    const insights = normalizeInsights({
        cartes: [
            {
                id: 'consensus-sleep',
                titre: 'Sommeil en baisse',
                detail: 'Moins de 7 h',
                moteur: 'consensus',
                theme: 'sleep',
                kind: 'bad',
                salience: 0.91,
                preuves: [{ label: '7 j', value: '6,2 h' }]
            }
        ],
        repos: { niveau: 'need', score: 72, resume: 'Journée off', prose: 'Charge trop haute', jour: 'dimanche' },
        derives: [{ id: 'drift-sport', metric: 'sport', severite: 'hard', titre: 'Sport à la traîne', detail: '35% du rythme' }],
        prevision: { titre: 'Semaine à risque', detail: 'Sport sous l’objectif', risque: 'high', sport: 80, business: 120 }
    });
    assert.equal(insights.cards.length, 1);
    assert.equal(insights.cards[0].title, 'Sommeil en baisse');
    assert.equal(insights.cards[0].kind, 'bad');
    assert.equal(insights.cards[0].evidence[0].value, '6,2 h');
    assert.equal(insights.restNeed.level, 'need');
    assert.equal(insights.drift[0].severity, 'hard');
    assert.equal(insights.forecast.risk, 'high');
    assert.equal(insights.forecast.business, 120);
});

test('humeur / énergie = moyenne des créneaux du jour', () => {
    const day = normalizeIaDay({
        date: '2026-08-25',
        humeur: 9,
        energie: 9,
        ressenti: {
            humeur: 6,
            energie: 5,
            stress: 4,
            n: 2,
            creneaux: [
                { slot: 'morning', humeur: 5, energie: 4 },
                { slot: 'evening', humeur: 7, energie: 6 }
            ]
        }
    });
    assert.equal(day.moodScore, 6);
    assert.equal(day.energyScore, 5);
    assert.equal(day.feelSampleCount, 2);
    assert.equal(day.dayFeelSlots.length, 2);
});

test('ingest insights écrase le pull', () => {
    const payload = {
        jour: { date: '2026-08-25', sommeil: 7 },
        signal: { titre: 'Ancien', detail: 'x', moteur: 'ewma' }
    };
    const { insights } = pickLifeosDay(payload, '2026-08-25', {
        date: '2026-08-25',
        insights: { signal: { titre: 'Nouveau', detail: 'y', moteur: 'drift' } }
    });
    assert.equal(insights.signal.title, 'Nouveau');
});
