# PAXLAB Browser Engine - DEV15.18.1 Stability fixes

PAXLAB Browser Engine est une application web locale Vite / React / TypeScript / Web Audio API destinée à améliorer des morceaux audio générés par IA, notamment Suno.

L'application reste 100 % navigateur : aucun serveur audio, aucun upload, traitement local, comparaison A/B Original / Preview, export local WAV ou FLAC.

## DEV15.18.1

Release de stabilité basée sur DEV15.18. Le moteur audio, l'export WAV et l'export FLAC ne sont pas modifiés.

### Correctifs de stabilité

- Sécurisation du verrou de rendu si un fichier change pendant une génération.
- Raccourci clavier R aligné sur les réglages courants.
- Export : l'ancien object URL est révoqué après le déclenchement du nouveau téléchargement, pas avant.
- Waveform : clés SVG stables pour éviter les flashs au switch A/B.
- Historique : la sélection d'une ancienne Preview réinitialise bien l'état d'export.
- Mobile : suppression du seek doublon sur la waveform, le slider reste la seule entrée de navigation.

### Petites améliorations UI

- Le stepper indique l'analyse en cours sur l'étape Mixer.
- L'overlay de traitement se ferme immédiatement en cas d'erreur de Preview.
- L'export affiche une action vers les réglages si la Preview doit être régénérée.
- Le nom de fichier n'est plus nettoyé au blur, seulement au moment de l'export.
- Alignement vertical du bouton actif Original / Rendu PAXLAB corrigé.

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

Le build DEV15.18.1 a été vérifié avant livraison.

## Déploiement Cloudflare Pages

Configuration recommandée :

- Build command : `npm run build`
- Output directory : `dist`
- Node : version Cloudflare Pages par défaut compatible Vite

Le zip de livraison ne contient pas `node_modules` et ne contient pas `dist`.
