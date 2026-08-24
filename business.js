(() => {
  const storeKey = 'lifeos-business-v1';
  const state = JSON.parse(localStorage.getItem(storeKey) || '{"revenue":0,"savings":0,"prospects":[],"clients":[],"processes":[],"journal":[]}');
  const $ = (id) => document.getElementById(id);
  const save = () => { localStorage.setItem(storeKey, JSON.stringify(state)); $('last-update').textContent = new Date().toLocaleString('fr-FR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); };
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  async function loadAdvice() {
    const list = $('advice-list');
    if (!list) return;
    try {
      const response = await fetch('/api/advice?limit=10', { cache: 'no-store' });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      if (!data.entries || !data.entries.length) return;
      list.innerHTML = data.entries.map(item => `<article class="advice-entry"><div class="advice-meta">${esc(item.domain || 'business')} · ${esc(item.priority || 'normal')} · ${esc(item.date || '')}</div><strong>${esc(item.diagnosis)}</strong>${item.lever ? `<p>${esc(item.lever)}</p>` : ''}<p class="advice-action">→ ${esc(item.action)}</p></article>`).join('');
    } catch (error) {
      console.warn('Conseils : API indisponible.', error);
    }
  }

  function render() {
    $('revenue-value').textContent = Number(state.revenue || 0).toLocaleString('fr-FR');
    loadAdvice();
    
    $('prospects-value').textContent = state.prospects.length;
    $('clients-value').textContent = state.clients.length;
    $('value-clients').textContent = state.clients.filter(x => x.status === 'client').length;
    $('value-processes').textContent = state.processes.length;
    $('value-notes').textContent = state.journal.length;
    $('savings-label').textContent = `${Number(state.savings || 0).toLocaleString('fr-FR')} / 2 000 €`;
    $('savings-progress').style.width = `${Math.min(100, Number(state.savings || 0) / 20)}%`;
    $('revenue-bar').style.width = `${Math.min(100, Number(state.revenue || 0) / 100)}%`;
    $('prospects-bar').style.width = `${Math.min(100, state.prospects.length * 10)}%`;
    $('clients-bar').style.width = `${Math.min(100, state.clients.length * 20)}%`;
    renderList('clients-list', state.clients, 'Aucun client ou prospect enregistré.', (x) => `<div class="entry-row"><div><div class="entry-title">${esc(x.name)}</div><div class="entry-meta">${esc(x.note || '')}</div></div><span class="entry-tag">${esc(x.status)}</span></div>`);
    renderList('process-list', state.processes, 'Aucun process documenté.', (x) => `<div class="entry-row"><div><div class="entry-title">${esc(x.title)}</div><div class="entry-meta">${esc(x.description || '')}</div></div><span class="entry-tag">process</span></div>`);
    renderList('journal-list', state.journal, 'Aucune note dans le journal.', (x) => `<div class="entry-row"><div><div class="entry-title">${esc(x.title)}</div><div class="entry-meta">${esc(x.body)}</div></div><span class="entry-tag">${esc(x.date)}</span></div>`);
  }
  function renderList(id, items, empty, template) { const el=$(id); el.innerHTML=items.length ? items.slice().reverse().map(template).join('') : `<div class="blank-state"><span>—</span><strong>${empty}</strong><p>Utilise le bouton « + Ajouter » pour commencer à construire ta mémoire opérationnelle.</p></div>`; }
  function fields(type) {
    if(type==='client') return `<div class="field"><label>Nom / entreprise</label><input name="name" required placeholder="Ex. Premier client"></div><div class="field"><label>Statut</label><select name="status"><option>prospect</option><option>client</option><option>perdu</option></select></div><div class="field"><label>Note</label><textarea name="note" placeholder="Besoin, offre, prochaine action..."></textarea></div>`;
    if(type==='process') return `<div class="field"><label>Nom du process</label><input name="title" required placeholder="Ex. Onboarding client"></div><div class="field"><label>Étapes / description</label><textarea name="description" required placeholder="1. ...&#10;2. ...&#10;3. ..."></textarea></div>`;
    return `<div class="field"><label>Titre</label><input name="title" required placeholder="Décision, apprentissage ou erreur"></div><div class="field"><label>Contenu</label><textarea name="body" required placeholder="Ce qui s'est passé, ce que j'ai appris, ce que je change..."></textarea></div>`;
  }
  let activeType;
  document.querySelectorAll('[data-open]').forEach(btn => btn.addEventListener('click', () => { activeType=btn.dataset.open.replace('-form',''); $('dialog-title').textContent=activeType==='client'?'Nouveau contact':activeType==='process'?'Nouveau process':'Nouvelle note'; $('dialog-fields').innerHTML=fields(activeType); $('entry-dialog').showModal(); }));
  $('entry-form').addEventListener('submit', e => { e.preventDefault(); const data=Object.fromEntries(new FormData(e.target)); if(activeType==='client') { state.clients.push(data); if(data.status==='client') state.revenue = Number(state.revenue || 0); } if(activeType==='process') state.processes.push(data); if(activeType==='journal') state.journal.push({...data,date:new Date().toLocaleDateString('fr-FR')}); save(); render(); $('entry-dialog').close(); e.target.reset(); });
  $('export-button').addEventListener('click', () => { const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`lifeos-business-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href); });
  render();
})();
