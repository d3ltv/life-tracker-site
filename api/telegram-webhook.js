/**
 * Webhook Telegram pour les saisies naturelles : process, journal, conseil.
 *
 * Route : POST /api/telegram-webhook
 * Usage : le bot Telegram aura cette URL comme webhook.
 */

const { parseProcess } = require('./process-sense');

const PAT_IMPORTANT = /^(mon process|process pour|process de|processus|méthode|procédure|workflow|je faisais|comment je fais)\b/i;

module.exports = (app, { api }) => {
  app.post('/telegram-webhook', async (req, res) => {
    const update = req.body;

    if (!update.message || !update.message.text) {
      return res.status(200).json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat?.id;
    const text = message.text.trim();

    if (!chatId) return res.status(200).json({ ok: true });

    // Détection d'un process : "...ma méthode pour faire tel truc : étape 1, étape 2..."
    if (PAT_IMPORTANT.test(text)) {
      const parsed = parseProcess(text);

      if (!parsed.valid) {
        return res.status(400).json({
          ok: false,
          error: `Pas encore assez de détails : ${parsed.reason}`
        });
      }

      // Sauvegarde dans Supabase business_processes
      const processPayload = {
        title: parsed.title,
        description: parsed.description,
        steps_json: JSON.stringify(parsed.steps),
        category: parsed.category,
        status: 'brouillon',
        source: 'telegram',
        metadata: JSON.stringify({
          text_original: text,
          confidence: parsed.confidence || 'moyen'
        })
      };

      try {
        const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/business/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'authorization': `Bearer ${process.env.INTEGRATION_SYNC_SECRET || ''}`
          },
          body: JSON.stringify(processPayload)
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error);

        // Réponse de confirmation à l'utilisateur
        const reply = parsed.steps.map((s, i) => i === 0 ? s : `→ ${s.replace(/^\d+\.\s*/, '')}`).join('\n');
        url_telegram = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        fetch(url_telegram, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `📌 **Process enregistré dans Business OS** :\n\n${reply}\n\nVoir sur ton site : https://life-tracker-site.vercel.app/business`,
            parse_mode: 'Markdown'
          })
        });

        return res.status(201).json({
          success: true,
          process: result,
          confirmation_sent: true
        });
      } catch (error) {
        return res.status(500).json({
          ok: false,
          error: `Enregistrement impossible : ${error.message}`
        });
      }
    }

    // CE QUE JE N'AI PAS IMPLÉMENTÉ AUTOMATIQUEMENT POUR L'INSTANT :
    // - detecter "j'ai appris quelque chose" → note
    // - detecter "un client m'a dit X" → contact/client
    return res.status(200).json({ ok: true });
  });
};
