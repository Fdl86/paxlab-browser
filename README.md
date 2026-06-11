# PAXLAB Browser Engine - dev15.9 Slider Stability

Application Vite / React / TypeScript pour générer une Preview Master locale dans le navigateur.

## Dev15.9

Cette version fiabilise les contrôles experts et le comportement Mix YouTube.

Points principaux :

- le peak polish YouTube respecte maintenant le Headroom demandé ;
- le ceiling effectif YouTube n’est plus contredit par le peak polish ;
- le Type de rendu devient la référence principale pour déclencher le mode Mix YouTube ;
- le profil YouTube ne force plus un traitement YouTube caché si le Type de rendu a été changé ;
- les réglages experts manuels sont préservés quand on change Type de rendu, Aigus fatigants ou Préserver l’espace ;
- les sliders LUFS et Headroom restent découplés ;
- le slider LUFS affiche clairement le plafond Mix YouTube à -14.4 LUFS max ;
- un verrou de rendu évite les doubles renders si le fichier change pendant une génération ;
- le clamp YouTube final évite une analyse inutile si le peak polish n’a pas modifié le fichier ;
- aucun changement volontaire de couleur sonore des presets validés ;
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
