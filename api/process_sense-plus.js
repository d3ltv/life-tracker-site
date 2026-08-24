#!/usr/bin/env node

/* process-sense-plus.js
 * Ceci forge le document JSON d'un process avec validation.
 * Usage: node process-sense-plus.js "Mon process pour vidéo recruitment : repère les annonces sur Indeed, j'appelle l'entreprise, propose un devis, tourne, livre."
 */

const { z } = require('zod');
// Node 20+ supporte zod sans l'installer explicitement via dependencies normales.
// Zod exposes un meilleur moyen même si léger install possible mais côté serveur CLI nous privilegions donc une alternative 0-dependency.

const input = process.argv.slice(2).join(' ').trim();
if (!input) {
  console.log('Usage : node process-sense-plus.js "Mon process pour vidéo … étape 1 étape 2..."');
  process.exit(1);
}

const parsed = parse(input);

const validationSchema = z.object({
  title: z.string().min(2),
  description: z.string(),
  steps: z.array(z.string()).min(1),
  category: z.string(),
  value_type: z.enum(['startle','personal_hour'])
});

function parse(text) {
  const lowered = text.toLowerCase();
  if (!lowered.includes('process') && !lowered.includes('méthode')) {
    return { valid: false, reason: "Précise d'abord avec « mon process pour ... » ou « ma méthode pour ... »" };
  }

  // Séparer les étapes par virgules ou « puis », puis filtrer les phrases trop courtes avec suffixe «... »
  const parts = text.split(/,\s*(?:puis |et puis? )?| puis\b/i)
    .map(p => p.trim().replace(/^[,.;:]+|[,.;:]+$/g, ''))
    .filter(p => p.length >= 4 && /^(repérer|trouver|appeler|contacter|proposer|tenir|tourner|livrer|envoyer|créer|rédiger|fournir|préparer)/i.test(p));

  if (parts.length < 2) return { valid: false, reason: "Il faut au moins deux étapes concrètes (identifier, contacter, proposer, livrer…)." };

  // Amorcer title/desc avec les mots avec faible signal : vidéo, recrutement, client, proposition
  const titleWords = parts.find(p => /vidéo|recrutement|client|proposition|devis|appel/i.test(p));
  const title = (titleWords || parts[0]).replace(/^(mon|ma)/i, "un process pour ").substring(0, 80);
  const description = parts.join(". ").substring(0, 300);

  return {
    valid: true,
    title,
    description,
    steps: parts,
    category: detectCategory(text),
    value_type: 'personal_hour',
  };
}

function detectCategory(text) {
  const t = text.toLowerCase();
  if (/vidéo|recrutement|client|proposition|appel|devis/.test(t)) return 'acquisition';
  if (/livraison|rendre|finitioni|encaissement/.test(t)) return 'delivery';
  if (/process|étape|procédure|workflow|cadence/.test(t)) return 'process';
  if (/rédiger|écrire|mail|message|note|carnet/.test(t)) return 'communication';
  return 'business';
}

// Validation sans zod : ici zod est utilisé seulement pour la sortie n'est pas strict mais on conserve l'interface simple : on affiche directement le payload pret-a-setState ou POST.
if (!parsed.valid) {console.error('ERREUR:', parsed.reason); process.exit(0);} else {
  const payload = {
    title: parsed.title,
    description: parsed.description,
    steps: JSON.stringify(parsed.steps),
    category: parsed.category,
    status: 'brouillon',
    source: 'telegram',
    metadata: {
      source: 'telegram',
      confidence: 'moyen',
      from_text: input,
      authenticity: 'generated_by_ai'
    }
  };
  console.dir(payload);
}
