# Vérification de réalité — LifeOS / Business OS

Date : 2026-08-24

## Verdict exécutif

Le projet n'est pas uniquement visuel, mais il n'est pas encore entièrement connecté en production. Une partie du pipeline fonctionne réellement en local : récupération LifeOS IA, normalisation française, ActivityWatch, analyses de corrélations, moteur d'évidence N-of-1, Gmail/Agenda local via gws, génération Telegram et API locale. En revanche, la production publique observée est toujours une autre version : `/business` et `/api/*` répondent 404.

## Matrice d'implémentation

| Élément | Présent dans le code | Exécuté/testé | Connecté production | Verdict |
|---|---:|---:|---:|---|
| LifeOS `/api/ia?scope=tout` | Oui | Oui | Source publique active | ✅ réel |
| Normalisation des champs français | Oui | Oui | Utilisée par analyse locale | ✅ réel |
| Sleep/humeur/énergie/sport/business | Oui | Oui | Non visible dans API production actuelle | ✅ réel local |
| Screen Time CSV | Oui | Oui | Manuel | ⚠️ partiel |
| Finances CSV | Oui | Oui | Manuel | ⚠️ partiel |
| Calendrier ICS local | Oui | Oui | Manuel | ⚠️ partiel |
| Gmail | Oui | Oui, cache 100 emails | Non dans Vercel | ✅ réel local |
| Google Agenda | Oui | Oui, cache 6 événements | Non dans Vercel | ✅ réel local |
| Suggestions de rendez-vous | Oui | Détection testée | Telegram local | ⚠️ partiel |
| Création Agenda après confirmation | Non | Non | Non | ❌ manquant |
| Suivi post-rendez-vous | Oui | Script compilé, aucun événement dû | Cron Mac | ⚠️ partiel |
| Réponse Telegram post-RDV vers parcours client | Non | Non | Non | ❌ manquant |
| Telegram rapport quotidien | Oui | Oui, 10 messages | Cron Mac | ✅ local |
| `/conseil` Hermes | Skill activée | Non vérifié end-to-end | Dépend Gateway | ⚠️ partiel |
| Enregistrement automatique du conseil | Endpoint local Oui | Non depuis `/conseil` | Production 404 | ❌ non relié |
| Journal web | Oui | Local POST/GET 201/200 | Production 404 | ⚠️ local |
| Persistance JSON fallback | Oui | Oui après redémarrage | Inadapté à Vercel | ⚠️ développement |
| Persistance Supabase | Code serveur Oui | Impossible sans variables présentes | Non vérifiable | ⚠️ non prouvé |
| Business contacts Supabase | Code serveur Oui | Fallback local testé | Production 404 | ⚠️ non prouvé |
| Business process Supabase | Code serveur Oui | Fallback local testé | Production 404 | ⚠️ non prouvé |
| Business settings Supabase | Code serveur Oui | Fallback local testé | Production 404 | ⚠️ non prouvé |
| Business OS interface | Oui | Syntaxe/HTML validés | `/business` 404 | ⚠️ non déployé |
| ActivityWatch | Oui | Serveur local et 6 jours lus | Local uniquement | ✅ réel local |
| PersonalEvidenceEngine | Oui | 6 jours, 0 signal retenu | Rapport local | ✅ réel prudent |
| Pearson associations | Oui | Utilisé par moteur | Local | ✅ réel |
| HDDM | Non | Non | Non | ❌ seulement cité |
| PyMC | Non | Non | Non | ❌ seulement cité |
| DoWhy | Non | Non | Non | ❌ seulement cité |
| causal-learn | Non | Non | Non | ❌ seulement cité |
| MNE-Python | Non | Non | Non | ❌ seulement cité |
| Nilearn | Non | Non | Non | ❌ seulement cité |
| PsychoPy | Non | Non | Non | ❌ seulement cité |
| The Virtual Brain | Non | Non | Non | ❌ seulement cité |
| neurolib | Non | Non | Non | ❌ seulement cité |

## Preuves d'exécution locale

- `python -m py_compile` : tous les modules Life-Analyzer passent.
- `node --check` : API et scripts JavaScript passent.
- `npm audit --omit=dev` : 0 vulnérabilité.
- LifeOS frais récupéré : 6 jours, dernier jour corrigé au 2026-08-24.
- ActivityWatch local détecté : 6 jours agrégés.
- Gmail/Agenda : 100 emails et 6 événements lus via le cache/source local.
- Rapport quotidien généré et envoyé : 10 messages lors du dernier run.
- API locale : `/api/status` 200, `/api/business/state` 200, `/api/advice` 200, `/api/journal` 200.
- API locale : POST journal 201 puis lecture vérifiée.
- Moteur N-of-1 : 6 observations, 0 signal, comportement prudent attendu.
- Avec 4 observations : 0 signal, garde-fou vérifié.

## Preuves de non-connexion production

Contrôle HTTP public sur `https://habit-track-xi.vercel.app` :

- `/` : 200
- `/calendar` : 200
- `/ia` : 200
- `/business` : 404
- `/api/status` : 404
- `/api/business/state` : 404
- `/api/advice` : 404
- `/api/journal` : 404
- `/api/dashboard` : 404

Conclusion : le dernier déploiement public ne contient pas le socle actuellement présent dans le dépôt local, ou le domaine pointe vers un autre projet Vercel.

## Bugs corrigés pendant cette vérification

1. `record_entry.py` importait `sources.completeness_engine`, module inexistant ; corrigé vers `engines.completeness_engine`.
2. LifeOS `/api/ia` renvoyait le 23 août avant le 24 août dans `recentDays`; le client trie maintenant par date décroissante.
3. L'API Express lançait toujours `app.listen` au chargement ; elle exporte maintenant l'application et ne lance le serveur que lorsqu'elle est exécutée directement.
4. Le préfixe `/api` est normalisé pour les rewrites Vercel.
5. `business.css` avait des règles responsive dupliquées et une fermeture incohérente ; nettoyé.
6. Les liens internes mélangeaient fichiers HTML et routes propres ; normalisés.
7. Le test `--help` a créé une fausse note manuelle ; supprimée après vérification.

## Gaps bloquants restants

### Production

- Redéployer le dépôt local corrigé sur le projet Vercel réellement utilisé.
- Vérifier que `vercel.json` est pris en compte.
- Vérifier les routes publiques après déploiement.

### Supabase

- Exécuter `supabase/schema.sql`.
- Configurer `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` dans Vercel.
- Tester une écriture puis une lecture depuis la production.
- Ajouter une authentification avant d'exposer des données personnelles.

### Automatisations

- Relier réellement la skill `/conseil` à POST `/api/advice`.
- Relier la réponse post-rendez-vous au contact et au parcours client.
- Ajouter la création Google Agenda après confirmation explicite.
- Déporter cron/analyse sur un service disponible lorsque le Mac est éteint, sauf ActivityWatch qui reste local.

### Open source scientifique

Les projets de veille ne sont pas « installés » dans le projet. Ils servent de références méthodologiques. Le code actuel n'utilise pas HDDM, PyMC, DoWhy, causal-learn, MNE, Nilearn, PsychoPy, TVB ou neurolib. Il serait incorrect de les présenter comme des briques déjà opérationnelles.

## Conclusion honnête

Le socle est réel et exécutable localement, mais l'intégration de bout en bout n'est pas encore démontrée. Le principal risque est de confondre « code présent » avec « fonctionnalité accessible en production ». La preuve finale sera obtenue uniquement après redéploiement, test Supabase réel, création d'une donnée depuis le site, lecture depuis une autre session, puis vérification de son apparition dans Business OS et Telegram.
