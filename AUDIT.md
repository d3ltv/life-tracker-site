# Audit complet LifeOS / Business OS

Date de l'audit : 2026-08-24

## Résumé exécutif

Le dépôt local contient une interface LifeOS, une page Business OS et une API Express, mais la production observée ne correspond pas à cette version du dépôt. Les problèmes prioritaires sont le routage Vercel, l'absence d'intégration Supabase dans le code audité et la séparation des données entre `localStorage`, fichier JSON local et API.

## Vérifications effectuées

- Pages publiques testées : `/`, `/business`, `/business.html`, `/calendar`, `/ia`
- Routes API testées : `/api/status`, `/api/dashboard`, `/api/advice`, `/api/journal`, `/api/history`
- Syntaxe JavaScript locale vérifiée avec `node --check`
- Fichiers Python Life-Analyzer compilés avec `py_compile`
- Variables et références Supabase recherchées dans le dépôt
- Processus locaux, cron, ActivityWatch et Hermes Gateway inspectés

## Résultats critiques

### P0 — Déploiement non aligné avec le dépôt local

La production répond correctement sur `/` et `/calendar`, mais :

- `/business` → 404
- `/business.html` → 404
- `/api/status` → 404
- `/api/dashboard` → 404
- `/api/advice` → 404
- `/api/journal` → 404
- `/api/history` → 404

Le dépôt local contient pourtant `business.html`, `business.js` et `api/index.js`. Cela indique que le projet actuellement déployé n'est pas ce dépôt/version, ou que la configuration Vercel ne publie pas ces fichiers.

### P0 — Supabase n'est pas utilisé par le code audité

Aucune référence à `supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` ou au client Supabase n'a été trouvée dans le code applicatif. La configuration Supabase/Vercel ne suffit donc pas à persister les données :

- Business OS écrit dans `localStorage`
- l'API locale écrit dans `api/data/lifeos.json`
- les conseils et le journal ne sont pas dans une base commune

### P1 — API incompatible avec Vercel en l'état

`api/index.js` lance `app.listen(...)` directement. Cela convient à un serveur Node local, mais une fonction serverless Vercel doit exporter l'application sans dépendre d'un processus persistant. Le dépôt ne contient pas de `vercel.json` ni de configuration racine garantissant le routage de cette API.

### P1 — Données Business OS isolées

`business.js` maintient les données dans une clé `localStorage` :

```text
lifeos-business-v1
```

Un autre appareil, Telegram, Life-Analyzer et le dashboard principal ne voient pas ces données.

### P1 — Conseils Hermes non reliés automatiquement

Business OS sait lire `/api/advice`, mais aucun flux vérifié ne pousse automatiquement chaque réponse de `/conseil` dans cette route. La fonctionnalité est donc partiellement câblée.

### P1 — Saisie du journal partiellement connectée

La page principale tente d'écrire le journal dans `/api/journal`, mais Business OS conserve encore son propre journal dans `localStorage`. Il existe deux mémoires concurrentes.

### P1 — Analyse locale indisponible si le Mac est éteint

Le cron quotidien et le suivi post-rendez-vous tournent sur le Mac. Ils ne s'exécutent pas lorsque le Mac est éteint. Hermes Gateway est supervisé par launchd, mais cela ne change pas cette contrainte.

## Problèmes fonctionnels et qualité du code

### Données

- Les valeurs `null` sont maintenant mieux traitées dans Life-Analyzer, mais plusieurs heuristiques historiques utilisent encore des valeurs par défaut qui peuvent masquer l'absence de donnée.
- Le score global est issu de métriques hétérogènes et ne doit pas être présenté comme une mesure neuroscientifique.
- Les corrélations sont exploratoires et nécessitent davantage de journées.
- Les événements clients, suggestions email et retours post-rendez-vous ne partagent pas encore un modèle persistant commun.

### API

- CORS est ouvert à `*`.
- Les routes journal/conseils n'ont pas d'authentification visible.
- Les dates sont validées de manière minimale.
- Les identifiants utilisent `Date.now()` + aléatoire local.
- Le stockage JSON local n'est pas adapté à Vercel.
- Le webhook Telegram est présent dans l'API locale, mais Hermes Gateway peut déjà gérer Telegram : risque de double traitement si les deux sont activés.
- Les appels Telegram utilisent `fetch` sans gestion complète du rejet réseau.

### Business OS

- `business.js` contient un état local complet, non synchronisé avec Supabase.
- Un client ajouté avec statut `client` augmente le CA, mais une modification ou suppression n'est pas modélisée : risque de double comptage.
- Le pipeline additionne les valeurs de tous les contacts actifs, sans distinguer probabilité de conversion.
- Les boutons et les listes sont visuellement cohérents, mais la page n'est pas disponible en production observée.
- Les pages utilisent principalement des liens `.html`, tandis que l'utilisateur navigue aussi avec des routes propres : le routage doit être décidé et appliqué uniformément.

### Vie privée et sécurité

- ActivityWatch reste local, ce qui est préférable.
- Les agrégats ActivityWatch ne doivent pas exposer automatiquement les titres de fenêtres ou URLs.
- Les secrets ne sont pas présents en clair dans le dépôt audité ; les tokens doivent rester dans Vercel/Hermes config locale.
- Une authentification ou au minimum une protection par secret serveur est nécessaire avant d'exposer journal, conseils et données business publiquement.

### UX / visuel

Points positifs : hiérarchie claire, style Apple/Linear cohérent, distinction LifeOS/Business OS, états vides explicites, traitement visible des données absentes.

À améliorer :

- navigation et routes de production cohérentes ;
- état de synchronisation Supabase réellement visible ;
- erreurs API affichées à l'utilisateur au lieu d'être seulement envoyées dans `console.warn` ;
- ajout de date et filtres pour l'historique business ;
- responsive réellement testé sur mobile ;
- accessibilité clavier des dialogues et feedback après sauvegarde ;
- séparation plus claire entre données saisies, données importées et inférences.

## Plan de correction priorisé

### Phase 1 — Restaurer une production cohérente

1. Ajouter une configuration Vercel explicite.
2. Garantir la publication des pages `index.html` et `business.html`.
3. Garantir une route API serverless réelle.
4. Ajouter un endpoint de health check vérifiable.
5. Tester les URLs publiques après déploiement.

### Phase 2 — Source de vérité Supabase

1. Créer un schéma SQL versionné.
2. Ajouter un client serveur Supabase utilisant uniquement des variables d'environnement.
3. Remplacer le stockage JSON pour journal, conseils, repas et données business.
4. Conserver `localStorage` uniquement comme cache hors-ligne temporaire.
5. Ajouter des identifiants et timestamps persistants.

### Phase 3 — Synchroniser les interfaces

1. Faire lire Business OS depuis l'API/Supabase.
2. Faire écrire les contacts, process, notes et objectifs dans la même base.
3. Afficher dans le dashboard les données LifeOS `/api/ia?scope=tout`.
4. Afficher l'état de synchronisation et les erreurs.
5. Dédupliquer les données venues de Telegram et du web.

### Phase 4 — Automatisations

1. Relier `/conseil` à l'enregistrement du conseil.
2. Relier les réponses post-rendez-vous au parcours client.
3. Ajouter les confirmations avant création Google Agenda.
4. Déporter le cron vers un environnement toujours disponible si nécessaire.
5. Garder ActivityWatch local et ne synchroniser que des agrégats consentis.

### Phase 5 — Qualité et sécurité

1. Ajouter tests API et tests de normalisation.
2. Valider dates, statuts, montants et longueurs.
3. Protéger les routes privées.
4. Ajouter logs structurés sans secrets.
5. Tester mobile, clavier, états vides et erreurs réseau.

## Décision ActivityWatch

ActivityWatch est pertinent sans Apple Watch, car il mesure l'activité de l'ordinateur. Il reste optionnel : s'il est absent, l'analyse doit continuer. Il ne constitue pas une mesure directe de l'énergie cognitive.

## Audit visuel détaillé

### Direction actuelle

La direction est **warm-minimal éditoriale** : fond gris clair, cartes blanches, accent bleu, grandes accroches et cartes arrondies. Elle est cohérente avec une application personnelle de pilotage et évite les effets lourds. La hiérarchie est lisible sur la page d'accueil observée.

### Artefacts visuels détectés

1. **Page Business OS absente en production** : le défaut fonctionnel devient aussi un défaut visuel critique, car la navigation annonce une destination inaccessible.
2. **`business.css` dupliqué et mal terminé** : plusieurs règles `@media`, `.milestone`, `.business-metrics` et `.architecture-note` étaient répétées ; la fin contenait une fermeture de bloc incohérente.
3. **Navigation non uniforme** : mélange de routes propres (`/business`) et de fichiers (`business.html`, `index.html`), pouvant provoquer des 404 selon le déploiement.
4. **Feedback de synchronisation absent** : l'interface affichait un système actif sans indiquer clairement si la donnée venait de Supabase, du cache local ou d'un échec réseau.
5. **États d'erreur invisibles** : Business OS ne montrait pas les erreurs API ; elles étaient uniquement envoyées dans `console.warn` ou `console.error`.
6. **Cibles tactiles trop petites** : plusieurs boutons visuels faisaient environ 38 px, sous la cible WCAG recommandée de 44 px.
7. **Risque de confusion métrique** : certains libellés peuvent donner l'impression que `score` mesure la cognition ; il doit être présenté comme un score LifeOS calculé, non comme une mesure neurologique.

### Corrections visuelles appliquées

- liens internes normalisés vers `/` et `/business` ;
- règles CSS finales nettoyées pour éviter les overrides contradictoires ;
- `DESIGN.md` ajouté avec tokens, responsive, accessibilité, performance et AI-readability ;
- normalisation des données Supabase vers les noms attendus par l'interface ;
- états `null` conservés comme non renseignés ;
- navigation et structure H1 vérifiées localement ;
- API préparée pour retourner la source `supabase` ou `local`.

### Validation visuelle restante

Le navigateur de test distant a demandé une autorisation de remote debugging qui n'était pas disponible pendant l'audit ; je n'ai donc pas prétendu avoir réalisé une comparaison screenshot pixel par pixel. La validation visuelle finale doit être faite après redéploiement sur `/`, `/business` et mobile réel.

## Conclusion

Le projet possède une bonne direction fonctionnelle et un langage visuel cohérent, mais il est actuellement fragmenté entre plusieurs stockages et versions déployées. La priorité n'est pas d'ajouter davantage de métriques : c'est d'établir une source de vérité Supabase, un routage Vercel vérifiable et un flux unique entre web, Telegram, LifeOS et Life-Analyzer.

## Limites de l'audit

L'accès aux logs Vercel, au dépôt exact lié au projet Vercel et aux variables d'environnement Supabase n'était pas disponible depuis le dépôt local. Les conclusions de production sont donc basées sur les réponses HTTP publiques et le code présent localement.

---

# Plan d'implémentation retenu

La correction commence par le socle : configuration de déploiement, API compatible serverless, couche de persistance Supabase optionnelle par environnement, puis migration progressive des écrans. Aucun secret ne sera écrit dans les fichiers suivis.
