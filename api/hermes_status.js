const { client, isConfigured } = require('./supabase');
const fs = require('fs');
const path = require('path');

const TABLE = 'hermes_heartbeat';
const LOCAL_FILE = path.join(__dirname, 'data', 'hermes_heartbeat.json');

function sanitize(payload = {}) {
  const gateway = payload.gateway && typeof payload.gateway === 'object' ? payload.gateway : {};
  const telegram = payload.telegram && typeof payload.telegram === 'object' ? payload.telegram : {};
  const model = payload.model && typeof payload.model === 'object' ? payload.model : {};
  const auth = payload.auth && typeof payload.auth === 'object' ? payload.auth : {};
  const cron = payload.cron && typeof payload.cron === 'object' ? payload.cron : {};
  const update = payload.update && typeof payload.update === 'object' ? payload.update : {};
  return {
    agent: 'hermes',
    collected_at: payload.collected_at || new Date().toISOString(),
    version: payload.version || null,
    gateway: {
      state: gateway.state || null,
      running: Boolean(gateway.running),
      pid: gateway.pid ?? null,
      pid_alive: gateway.pid_alive !== false,
      pid_check: gateway.pid_check || null,
      socket_present: gateway.socket_present ?? null,
      active_agents: gateway.active_agents ?? null,
      updated_at: gateway.updated_at || null,
      exit_reason: gateway.exit_reason || null
    },
    telegram: {
      state: telegram.state || null,
      needs_attention: Boolean(telegram.needs_attention),
      error_code: telegram.error_code || null,
      updated_at: telegram.updated_at || null
    },
    platforms: payload.platforms && typeof payload.platforms === 'object' ? payload.platforms : {},
    model: {
      default: model.default || null,
      provider: model.provider || null,
      base_url: model.base_url || null
    },
    auth: {
      active_provider: auth.active_provider || null,
      ok: Boolean(auth.ok),
      expires_at: auth.expires_at || null,
      expires_soon: Boolean(auth.expires_soon),
      seconds_left: Number.isFinite(auth.seconds_left) ? auth.seconds_left : null,
      reason: auth.reason || null,
      updated_at: auth.updated_at || null
    },
    cron: {
      ticker_heartbeat_age_sec: cron.ticker_heartbeat_age_sec ?? null
    },
    update: {
      behind: update.behind ?? null,
      ver: update.ver || null
    }
  };
}

function writeLocal(payload) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(payload, null, 2));
}

function readLocal() {
  try {
    if (!fs.existsSync(LOCAL_FILE)) return null;
    return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function upsert(raw) {
  const payload = sanitize(raw);
  if (isConfigured()) {
    const { data, error } = await client()
      .from(TABLE)
      .upsert({ id: 1, payload, collected_at: payload.collected_at }, { onConflict: 'id' })
      .select('payload, collected_at')
      .single();
    if (error) throw error;
    return { ...(data.payload || payload), collected_at: data.collected_at || payload.collected_at, _storage: 'supabase' };
  }
  writeLocal(payload);
  return { ...payload, _storage: 'local-file' };
}

async function latest() {
  if (isConfigured()) {
    const { data, error } = await client()
      .from(TABLE)
      .select('payload, collected_at')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { ...(data.payload || {}), collected_at: data.collected_at || data.payload?.collected_at, _storage: 'supabase' };
  }
  const local = readLocal();
  return local ? { ...local, _storage: 'local-file' } : null;
}

function isFresh(payload, maxAgeSec = 900) {
  if (!payload?.collected_at) return false;
  const t = Date.parse(payload.collected_at);
  if (Number.isNaN(t)) return false;
  return (Date.now() - t) / 1000 <= maxAgeSec;
}

module.exports = { sanitize, upsert, latest, isFresh };
