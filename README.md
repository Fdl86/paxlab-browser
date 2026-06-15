# PAXLAB Browser Engine - DEV15.24

DEV15.24 est une experimentation CSS-only de palette premium champagne / gold, basee sur DEV15.23.6. Elle change uniquement la direction visuelle : fond anthracite neutre, surfaces sobres, accent champagne desature, et retrait des restes violet / cyan visibles.

## DEV15.24 - Champagne palette CSS experiment

Objectif : tester une direction visuelle plus studio audio pro, sans toucher au moteur audio ni aux exports.

- Palette anthracite neutre : fond proche #0b0b0e, surfaces #15151a / #1e1e24.
- Accent unique champagne : #d4af6e.
- Etats fonctionnels conserves : succes, warning, erreur.
- Waveform adaptee a la nouvelle palette.
- Boutons actifs, toggles, stepper, badges et export harmonises.
- Rendu flat conserve, sans ajout de glow.

## Points conserves

- Application 100 % navigateur.
- Aucun serveur audio.
- Aucun upload.
- Analyse locale.
- Preview recommandee.
- A/B Original / Rendu PAXLAB.
- Waveform seek clic + drag.
- Export WAV 16-bit, WAV 24-bit et FLAC 24-bit.

## Verification

Le build DEV15.24 a ete verifie avant livraison :

```bash
npm run build
```

Le zip livre ne contient ni `node_modules`, ni `dist`.
