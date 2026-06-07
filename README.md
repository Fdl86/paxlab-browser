# PAXLAB Browser Engine - dev03 XXL hotfix deploy

Application Vite / React / TypeScript hébergée sur Cloudflare Pages.

Objectif : analyse et Preview Master locale dans le navigateur pour fichiers WAV / MP3, sans upload serveur.

## Dev03 XXL

- Import WAV / MP3 local
- Décodage Web Audio API
- Analyse source indicative
- Waveform cliquable
- Zones d’écoute suggérées
- Génération Preview Master locale
- Chaîne automatique V0.6 : anti-fizz, de-click léger, de-clipper prudent, contrôle sub, EQ simplifiée, stéréo, densité, compression, niveau cible estimé, limiteur
- Comparaison A/B Original / Preview Master
- Aucun export
- Aucun upload serveur
- Aucune mesure LUFS officielle

## Commandes

```bash
npm install
npm run dev
npm run build
```

## Cloudflare Pages

- Build command : `npm run build`
- Output directory : `dist`
- Framework preset : `None` ou `Vite` si disponible


## Hotfix deploy

Ce package corrige le lockfile npm pour Cloudflare Pages en forçant le registre npm public.
