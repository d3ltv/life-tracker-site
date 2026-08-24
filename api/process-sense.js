const re = /^(mon process (pour|de) que|méthode|workflow|processus) (.+)$/i

function parseProcess(text) {
  text = text.trim()
  if (!text) return { valid: false, reason: "Pas de texte" }

  // Étape 1 : détecter la phrase naturelle
  const m = text.match(re)
  if (!m) return { valid: false, reason: "Le texte ne ressemble pas à une description de process" }

  const preamble = m[1]
  const raw = m[3]

  if (raw.length < 20) return { valid: false, reason: "Trop court pour identifier un process" }

  // Transformer en étapes séparées par virgules → puis → ensuite → action séparée
  const words = raw.split(/,\s+| puis\b| ensuite\b| ensuite| puis\b| ensuite\b| après\b/i)
  const steps = words
    .map(w => w.trim().replace(/^[.,;]+|[.,;]+$/g, ""))
    .filter(w => w.length > 2)
    .map((s, i) => `${i + 1}. ${s.charAt(0).toUpperCase() + s.slice(1)}`)

  if (steps.length < 2) return { valid: false, reason: "Impossible d'identifier au moins 2 étapes" }

  const title = words[0].replace(/^[.,;]+|[.,;]+$/g, "").substring(0, 80)
  const finalTitle = words.find(w => /vidéo|recrutement|client|appel|proposition|livraison/i.test(w)) || title

  return {
    valid: true,
    title: finalTitle.replace(/^[a-z]/, c => c.toUpperCase()).substring(0, 80),
    description: finalTitle.substring(0, 140),
    steps: steps.slice(0, 8),
    category: detectCategory(raw),
    content: text
  }
}

function detectCategory(text) {
  const t = text.toLowerCase()
  if (/vidéo|recrutement|client|proposition|devis|appel/.test(t)) return 'acquisition'
  if (/livraison|rendre|finir|encaissement/.test(t)) return 'delivery'
  if (/process|étape|procédure|workflow|cadence/.test(t)) return 'process'
  if (/rédiger|écrire|mail|message|note|préparer/.test(t)) return 'communication'
  return 'business'
}

module.exports = { parseProcess };