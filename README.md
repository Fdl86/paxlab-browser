# PAXLAB Browser Engine - dev02

Application Vite + React + TypeScript deployable sur Cloudflare Pages.

## Fonctionnalités dev02

- Import local WAV / MP3.
- Décodage local via Web Audio API.
- Lecteur local Original.
- Génération d'une Preview Master en mémoire navigateur via OfflineAudioContext.
- Réglages audio avec bouton d'application manuel.
- Comparaison A/B Original / Preview Master en conservant la position de lecture.
- Mesures indicatives RMS simple / peak / crest factor.
- Aucun upload serveur.
- Aucun backend.
- Aucun export audio.
- Aucune mesure LUFS officielle annoncée.

## Commandes

```bash
npm install
npm run dev
npm run build
```

## Cloudflare Pages

- Framework preset : None ou Vite si disponible
- Build command : `npm run build`
- Build output directory : `dist`
- Root directory : vide ou `/`
