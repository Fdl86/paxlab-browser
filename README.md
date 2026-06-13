# PAXLAB Browser Engine - DEV15.18 Final UI and listening report

PAXLAB Browser Engine est une application web locale Vite / React / TypeScript / Web Audio API destinée à améliorer des morceaux audio générés par IA, notamment Suno.

L'application reste 100 % navigateur : aucun serveur audio, aucun upload, traitement local, comparaison A/B Original / Preview, export local WAV ou FLAC.

## DEV15.18

Release groupée de finition UX et de clarification du rapport avant / après, sans modification du moteur audio.

### Changements UI conservés et finalisés

- Le bouton éjecter / changer de fichier garde le même gabarit carré que les boutons Play et Stop.
- La ligne `Original / Rendu PAXLAB`, Play, Stop et éjecter reste harmonisée sur une hauteur commune.
- Le texte `Lecture courante. Les mesures détaillées restent disponibles dans les accordéons techniques.` reste supprimé pour garder l'écran plus compact.
- Le panneau export compact reste prioritaire dans la colonne droite : titre de Preview, formats, nom du fichier, téléchargement.
- L'interface garde la direction premium DEV15.16 / DEV15.17, sans nouvelle refonte lourde.

### Rapport avant / après amélioré

- Le bloc `Avant / Après` devient `Lecture auditive du rendu`.
- Une synthèse courte traduit les mesures en ressenti probable : pression sonore, brillance IA, assise grave, respiration.
- Chaque ligne garde les chiffres Original / Preview, mais ajoute une lecture plus simple : `Moins de pression sonore`, `Aigus IA calmés`, `Crêtes plus libres`, `Respiration préservée`, etc.
- La différence de brillance reste exprimée en pourcentage relatif à la brillance d'origine.

## État validé conservé

- Mix YouTube 1-click.
- Export WAV 24-bit.
- Export WAV 16-bit.
- Export FLAC 24-bit.
- A/B transparent Original / Rendu PAXLAB.
- Wording `Plafond peak maximum` conservé.
- Le plafond peak reste un plafond de sécurité, pas une cible à atteindre.
- Le moteur audio validé n'a pas été modifié.
- L'export FLAC validé n'a pas été modifié.

## Workflow de test

```bash
npm install
npm run build
```

Le build DEV15.18 a été vérifié avant livraison.

## Déploiement Cloudflare Pages

Configuration recommandée :

- Build command : `npm run build`
- Output directory : `dist`
- Node : version Cloudflare Pages par défaut compatible Vite

Le zip de livraison ne contient pas `node_modules` et ne contient pas `dist`.
