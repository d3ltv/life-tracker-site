# LifeOS — Design System

## Direction

**Warm-minimal editorial intelligence** : une interface calme, lisible et orientée décision. Le produit ne doit pas ressembler à un tableau de bord financier froid ni à une application médicale. Les données servent une lecture humaine : ce qui s'est passé, ce que cela signifie, quoi faire ensuite.

## Principes

1. Performance avant décoration.
2. Une hiérarchie typographique forte, jamais de surcharge visuelle.
3. Les valeurs absentes affichent `—` ou « non renseigné », jamais un faux zéro.
4. Les données brutes sont secondaires ; le contexte et la prochaine action sont prioritaires.
5. Le site doit rester compréhensible sans JavaScript lorsque le HTML contient le contenu.
6. Aucun mouvement ne doit être nécessaire pour comprendre ou utiliser l'interface.

## Tokens

### Couleurs

```css
--bg: #f5f5f7;
--white: #ffffff;
--ink: #1d1d1f;
--muted: #6e6e73;
--line: #d2d2d7;
--blue: #0071e3;
--blue-soft: #e8f2ff;
--green: #1d8b4c;
--orange: #b85d00;
```

Le texte courant doit conserver un contraste d'au moins 4.5:1. Le bleu d'action doit être utilisé sur fond clair avec une taille lisible, jamais comme texte décoratif faible.

### Espacements

- Base : 4 px
- Contrôles : 12–16 px
- Cartes : 21–28 px
- Sections : 48–76 px
- Rayon principal : 22 px
- Rayon des champs : 9–10 px

### Typographie

- Texte : system-ui, -apple-system, BlinkMacSystemFont, Segoe UI
- Titres : Space Grotesk ou system-ui
- H1 : clamp(38px, 6vw, 72px), interlettrage négatif contrôlé
- Corps : 14–16 px, line-height 1.5–1.6
- Métadonnées : 10–12 px, capitales espacées avec modération

## Composants

### Navigation

Navigation sémantique dans `<nav aria-label="Navigation principale">`. Chaque lien reste atteignable au clavier et possède une surface tactile minimale de 44 × 44 px sur mobile.

### Cartes métriques

Une carte = une métrique, son unité, son objectif et une barre de progression. Une valeur `null` doit apparaître comme inconnue, pas comme 0.

### Journal

Le journal libre est une zone de capture rapide. Il doit accepter les phrases naturelles, afficher un feedback de sauvegarde et préciser la source : web, Telegram ou import.

### Business OS

Le parcours prioritaire est :

```text
Prospect → rendez-vous → proposition → client → prestation → process
```

La prochaine action doit être visible avant les métriques secondaires.

### Dialogues

Utiliser `<dialog>` natif, focus clavier conservé, bouton de fermeture labellisé, validation native et erreur compréhensible.

## Responsive

- Mobile-first sous 760 px.
- Cibles tactiles : 44 px minimum.
- Aucun tableau horizontal obligatoire.
- Les grilles deviennent une colonne sur petit écran.
- Les flèches du tunnel passent verticalement.

## Performance

- Pas de framework ajouté pour une interface statique.
- Pas de vidéo hero, WebGL ou dépendance lourde.
- JavaScript limité aux interactions et aux appels API.
- CSS mutualisé et sans animation coûteuse.
- `transform` et `opacity` uniquement pour les transitions.
- Respect de `prefers-reduced-motion`.

## Accessibilité

- Un seul H1 par page.
- HTML sémantique : header, nav, main, section, article, footer.
- Contrastes vérifiés en thème clair.
- Focus visible obligatoire.
- `aria-label` sur les boutons iconographiques.
- Les états d'erreur doivent être visibles, pas uniquement dans la console.
- Les contenus ne doivent pas dépendre d'une couleur seule.

## AI-readability / GEO

Le H1 et le résumé de chaque page doivent expliquer immédiatement :

- ce qu'est LifeOS ;
- quelles données sont suivies ;
- quel objectif est piloté ;
- ce qui est actuellement renseigné ou absent.

Les données doivent rester dans du HTML textuel, pas dans des images ou des graphiques sans alternative textuelle.

## À éviter

Carrousels, scroll-jacking, curseur personnalisé, preloader, glassmorphism généralisé, vidéo lourde, infinite scroll et personnalisation client-side bloquante.

## Validation

Avant déploiement :

```bash
node --check business.js
node --check scripts.js
node --check api/index.js
npm --prefix api audit --omit=dev
```

Puis vérifier en ligne :

```text
/
/business
/api/status
/api/business/state
```

Le test visuel doit couvrir desktop, mobile, clavier, état vide, erreur API et données Supabase présentes.

## Références de direction

La direction combine la précision de Vercel/Linear pour la hiérarchie et les états, la lisibilité éditoriale d'Apple/Notion, et une logique de bento modulaire sans sacrifier la sobriété ni la performance. Ces références servent de vocabulaire visuel ; elles ne justifient pas de copier une interface ou de charger des effets décoratifs inutiles.

## État actuel

La direction visuelle existante est cohérente, mais la production observée n'est pas encore alignée avec le dépôt local. Le prochain contrôle décisif est le redéploiement puis la vérification des routes publiques.
