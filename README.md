# PAXLAB Browser Engine - DEV16.1

DEV16.1 reprend `paxlab-browser-dev16-ui-rewrite.zip` et applique une passe ciblée sur la colonne Rendu, la landing page et la waveform source.

## Objectif

Rendre l'interface plus lisible sans repartir dans un empilement CSS fragile : moins de texte dans les tuiles, hauteur des switches réduite, espacement régulier, waveform source alignée sur le composant A/B post-traitement.

## Modifications DEV16.1

### Landing page
- Colonne Workflow élargie via le token `--landing-side-w` pour éviter les retours à la ligne inutiles.
- La largeur reste pilotée par variable CSS pour rester facilement ajustable.

### Carte Rendu
- Suppression des badges texte `Recommandé` dans la carte Rendu.
- Le preset conseillé est maintenant signalé par une étoile à côté du libellé du preset.
- Les presets affichent uniquement : nom du preset + phrase courte.
- Le bouton `Générer la Preview` reprend le même espacement vertical que les tuiles de switches.

### Switches
- Suppression du texte explicatif sous les switches.
- Titre et toggle sont alignés sur une seule ligne.
- Hauteur réduite : les tuiles suivent désormais le contenu + padding, sans masse inutile.

### Waveform
- Ajout d'un helper partagé `src/audio/waveformView.ts`.
- La waveform de l'écran `Morceau chargé` utilise le même calcul, les mêmes dimensions et les mêmes classes visuelles que la waveform du monitoring A/B.

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
