# PAXLAB Browser Engine - dev15.7 Dynamics Gauge Fix

Application Vite / React / TypeScript pour générer une Preview Master locale dans le navigateur.

## Dev15.7

Cette version conserve strictement les traitements audio validés et corrige uniquement la lecture visuelle des jauges.

Points principaux :

- aucun changement sur les traitements audio Propre, Équilibré, Impact ou Mix YouTube ;
- aucun changement LUFS, peak, limiteur ou export WAV ;
- jauge Peak global alignée sur le plafond du preset ;
- jauge Dynamique calibrée selon le preset ;
- Mix YouTube affiche un objectif de respiration plutôt qu’un objectif de densité ;
- bloc Avant / Après renommé en Dynamique / respiration ;
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
