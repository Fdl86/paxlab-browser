# PAXLAB Browser Engine - v0.9.0-RC1

Release candidate de stabilisation basée sur la dernière version validée. Objectif : figer une version propre, cohérente et testable avant release stable.

## Objectif RC1

- Conserver le workflow simple : charger un audio, générer un rendu, comparer en A/B, exporter localement.
- Nettoyer les traces d’anciens blocs prototype/debug.
- Harmoniser le vocabulaire, les paddings, les badges et les tuiles export.
- Garder les informations techniques utiles sans surcharger l’écran principal.

## Modifications RC1

### Nettoyage produit

- Suppression des composants morts non importés : ancien dashboard, ancien conseiller, panneau session et panneau info audio.
- Suppression du helper audio lié à l’ancien conseiller non utilisé.
- Nettoyage de styles legacy associés aux anciens panneaux.

### Interface

- Version visible passée en `PAXLAB Browser Engine - v0.9.0-RC1`.
- Wording principal harmonisé autour de `rendu`, `A/B`, `export local` et `mesures estimées`.
- Tuiles export FLAC / WAV réalignées verticalement.
- Détails techniques et traitement appliqué conservés en version compacte.

### Stabilité

- Aucun changement du moteur audio.
- Aucun changement des presets DSP.
- Aucun changement des exports WAV / FLAC.
- Aucun changement du player A/B.
- Aucun changement du workflow local, sans serveur et sans upload.

## Vérification

```bash
npm ci
npm run build
```

Le zip livré ne contient ni `node_modules`, ni `dist`.
