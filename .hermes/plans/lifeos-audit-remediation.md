# Plan de correction LifeOS / Business OS

## Constat

La production observée ne servait pas `business.html` ni les routes `/api/*`, alors que ces éléments existent dans le dépôt local. Le code audité ne consommait pas Supabase et les données Business OS restaient dans `localStorage`.

## Priorité P0

- Configuration Vercel explicite pour `/business` et `/api/*`.
- API Express exportable en fonction serverless.
- Health check et tests HTTP de production après déploiement.

## Priorité P1

- Couche Supabase serveur sans clé secrète côté navigateur.
- Tables persistantes pour journal, conseils, repas, contacts, process et objectifs.
- Lecture/écriture Business OS depuis Supabase.
- Repli local explicite si Supabase n'est pas configuré.

## Priorité P2

- Connecter `/conseil` à l'endpoint `/advice`.
- Relier les retours post-rendez-vous au parcours client.
- Déporter les tâches planifiées si le Mac est éteint.
- Ajouter tests automatisés, authentification et observabilité.

## Critères d'acceptation

- `/business` répond sans 404.
- `/api/status`, `/api/business/state`, `/api/journal` et `/api/advice` répondent.
- Supabase est utilisé côté serveur lorsque les variables sont présentes.
- Les données du Business OS survivent à un changement d'appareil.
- Le mode local continue de fonctionner sans Supabase.
- Aucun secret n'est dans le dépôt.
- Les contrôles JavaScript et API passent.

## État

- Audit documenté dans `AUDIT.md`.
- Routage Vercel ajouté.
- API serverless préparée.
- Schéma Supabase ajouté dans `supabase/schema.sql`.
- Couche Supabase ajoutée.
- Migration journal, conseils et Business OS en cours de finalisation.
- Déploiement production à vérifier depuis le projet Vercel réellement lié.
