# PAXLAB Browser Engine - dev15.5 Peak Report Fix

Application Vite / React / TypeScript pour générer une Preview Master locale dans le navigateur.

## Dev15.5

Cette version conserve les traitements audio validés de DEV15.4 et corrige la lisibilité du rapport Peak.

Points principaux :

- aucun changement sur les traitements audio Propre, Équilibré, Impact ou Mix YouTube ;
- correction des faux warnings Peak dans le rapport de Preview ;
- carte "Peak global" alignée sur le peak global exporté ;
- lecteur renommé en "Peak lecture" pour distinguer la mesure courante du peak global ;
- objectifs Peak plus lisibles et moins alarmistes quand le fichier reste dans une zone sûre ;
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
