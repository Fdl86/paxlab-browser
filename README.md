# PAXLAB Browser Engine - dev15.10 Rebuild Consistency Fix

Application Vite / React / TypeScript pour générer une Preview Master locale dans le navigateur.

## Dev15.10

Cette version corrige une divergence de logique entre les contrôles simples et les contrôles experts.

Points principaux :

- correction de la fonction rebuild dans App.tsx ;
- les boutons simples de Type de rendu ne réinitialisent plus les réglages experts ;
- le toggle Aigus fatigants ne réinitialise plus les réglages experts ;
- la logique de préservation est alignée avec PreviewControls.tsx ;
- Headroom, LUFS, intensité, nettoyage source, brillance, largeur stéréo et densité sont conservés ;
- en Mix YouTube, la cible LUFS reste plafonnée à -14.4 LUFS max ;
- aucun changement moteur audio ;
- aucun changement peak polish ;
- aucun changement limiteur ;
- aucun changement export WAV ;
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
