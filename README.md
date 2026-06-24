# PAXLAB Browser Engine - DEV15.28.4

DEV15.28.4 consolide la base premium DEV15.28.3 avec un polish de respiration UI et une securite responsive. Le moteur audio, les presets, les cibles LUFS, le player A/B, les exports WAV / FLAC, Basses punchy et Espace stereo restent inchanges.

## Objectif

Donner plus d air a la topbar et a la grille principale sans modifier le workflow valide, tout en continuant le nettoyage CSS prudent.

## Modifications DEV15.28.4

- Espacement horizontal augmente dans la topbar.
- Logo, titre, badges `Local` et `Aucun upload` moins colles aux bordures.
- Grille principale legerement mieux alignee avec la topbar.
- Securites responsive ajoutees pour largeurs intermediaires, laptop et mobile.
- Nettoyage CSS prudent sur quelques anciennes regles topbar supersedees.
- Titre de l onglet navigateur passe en `PAXLAB Browser Engine - DEV15.28.4`.

## Points conserves

- Aucun changement DSP volontaire.
- Aucun changement des cibles LUFS.
- Aucun changement du player A/B.
- Aucun changement des exports WAV 16 / 24-bit et FLAC 24-bit.
- Aucun changement de comportement des presets.
- `AI Brightness Smoothing`, `Presence vocale`, `Espace stereo` et `Basses punchy` conservent leur logique.
- Application toujours 100 % navigateur, locale, sans upload.

## Verification

Build verifie avant livraison :

```bash
npm run build
```

Le zip livre ne contient ni `node_modules`, ni `dist`.
