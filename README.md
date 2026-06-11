# PAXLAB Browser Engine - dev15.13 Peak Clarity

Application Vite / React / TypeScript pour générer une Preview Master locale dans le navigateur.

## Dev15.13

Cette version clarifie le vocabulaire autour du headroom / peak sans modifier le rendu audio.

Points principaux :

- aucun changement moteur audio ;
- aucun changement LUFS, limiteur, peak polish ou export WAV ;
- le réglage "Headroom final demandé" devient "Plafond peak maximum" ;
- les rapports parlent maintenant de "Marge peak" plutôt que de headroom comme cible ;
- l’interface précise que le peak réel peut rester plus bas selon la cible LUFS et la dynamique source ;
- Mix YouTube conserve le mode simple validé : nettoyage source, niveau YouTube, brillance / anti-fizz ;
- les réglages avancés restent disponibles sur Propre, Équilibré et Impact ;
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
