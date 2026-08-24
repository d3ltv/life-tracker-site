const fs = require('fs');
const path = require('path');

const dataDirectory = path.join(__dirname, 'data');
const dataFile = path.join(dataDirectory, 'lifeos.json');

function emptyState() {
  return { meals: [], journalEntries: [], adviceEntries: [], lifeosDays: {} };
}

function readState() {
  try {
    if (!fs.existsSync(dataFile)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return {
      meals: Array.isArray(parsed.meals) ? parsed.meals : [],
      journalEntries: Array.isArray(parsed.journalEntries) ? parsed.journalEntries : [],
      adviceEntries: Array.isArray(parsed.adviceEntries) ? parsed.adviceEntries : [],
      lifeosDays: parsed.lifeosDays && typeof parsed.lifeosDays === 'object' ? parsed.lifeosDays : {}
    };
  } catch (error) {
    console.error('Impossible de lire le stockage LifeOS:', error.message);
    return emptyState();
  }
}

function writeState(state) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporaryFile = `${dataFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(temporaryFile, dataFile);
}

function updateState(mutator) {
  const state = readState();
  mutator(state);
  writeState(state);
  return state;
}

module.exports = { readState, writeState, updateState, dataFile };

