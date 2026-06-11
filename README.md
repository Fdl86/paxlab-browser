# PAXLAB Browser Engine - dev15.12 Expert LUFS Fix

Application Vite / React / TypeScript pour générer une Preview Master locale dans le navigateur.

## Dev15.12

Cette version conserve le mode Mix YouTube simplifié et corrige la conformité du slider LUFS hors YouTube.

Points principaux :

- Mix YouTube 1-click conservé comme workflow principal ;
- aucun changement volontaire du rendu Mix YouTube validé ;
- en Mix YouTube, seuls les réglages utiles restent visibles : nettoyage source, niveau YouTube, brillance / anti-fizz ;
- les réglages avancés restent disponibles sur Propre, Équilibré et Impact ;
- correction du slider LUFS hors YouTube : les modes Propre, Équilibré et Impact appliquent maintenant une correction descendante si la sortie dépasse la cible LUFS demandée ;
- le Headroom reste traité comme un plafond peak, pas comme une cible exacte de volume ;
- la calibration loudness peut maintenant corriger vers le bas hors Mix YouTube ;
- le lecteur garde la distinction Niveau local / LUFS intégré global ;
- README, version visible et titre d’onglet navigateur mis à jour.

## Fonctionnement

PAXLAB fonctionne 100 % dans le navigateur :

- aucun upload audio ;
- aucun serveur audio ;
- traitement local ;
- comparaison A/B Original / Preview ;
- export WAV local.

## Installation locale

```bash
npm install
npm run dev
npm run build
```

## Cloudflare Pages

Paramètres conseillés :

- Framework preset : None
- Build command : npm run build
- Output directory : dist
