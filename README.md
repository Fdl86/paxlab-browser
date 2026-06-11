# PAXLAB Browser Engine - dev15.8 Headroom Slider Fix

Application Vite / React / TypeScript pour générer une Preview Master locale dans le navigateur.

## Dev15.8

Cette version corrige le comportement du slider Headroom en mode expert.

Points principaux :

- le slider Headroom final demandé ne modifie plus la cible LUFS ;
- le slider Headroom ne modifie plus targetRmsDb ;
- le slider Headroom modifie uniquement maxPeakDb ;
- le slider LUFS reste le seul contrôle du niveau perçu cible ;
- correction nécessaire pour tester proprement les exports HR 1.5 / 2.5 / 3.5 ;
- aucun changement dans le moteur audio, les presets, le limiteur ou l’export WAV ;
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
