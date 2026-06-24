# PAXLAB Browser Engine - DEV16.4

DEV16.4 reprend la base DEV16.1 et applique la passe de finition demandée sur l'écran d'accueil, les switches de la colonne Rendu et le bouton de génération.

## Objectif

Stabiliser l'interface sans toucher au moteur audio : landing page plus équilibrée, tuiles plus compactes, CTA toujours lisible et comportement visuel constant quand une option est cochée.

## Modifications DEV16.4

### Landing page
- La grille d'accueil utilise `align-items: stretch`.
- La carte Upload et la carte Workflow prennent `height: 100%` pour obtenir une hauteur visuelle alignée.
- La largeur de la colonne Workflow reste pilotée par le token `--landing-side-w`, donc facilement ajustable plus tard.

### Carte Rendu
- Le bouton principal garde le libellé stable `Générer la Preview`.
- Le libellé variable `Générer la Preview conseillée` a été supprimé dans `src/App.tsx`.
- Le CTA reste compact grâce à une grille interne stable, avec padding réduit et colonnes équilibrées.

### Switches
- Les tuiles switches sont compactées.
- Le titre et le toggle sont verrouillés sur la même ligne CSS Grid.
- Le texte explicatif des options reste supprimé pour éviter la masse visuelle.
- Les box suivent le contenu réel + padding, sans hauteur forcée inutile.

### Presets et waveform
- Les ajustements DEV16.1 sont conservés : preset conseillé par étoile, tuiles presets allégées, waveform source alignée sur la waveform A/B via `src/audio/waveformView.ts`.

## Points conservés

- Aucun changement du moteur audio.
- Aucun changement des presets DSP.
- Aucun changement des exports WAV / FLAC.
- Aucun changement du player A/B.
- Application toujours 100 % navigateur, locale, sans upload.

## Vérification

```bash
npm install
npm run build
```

Le zip livré ne contient ni `node_modules`, ni `dist`.
