# PAXLAB Browser Engine - DEV15.25.3

DEV15.25.3 est une hotfix CSS de DEV15.25.2. Elle conserve la DA champagne, l option `Presence vocale`, `AI Brightness Smoothing`, le player, la waveform seek et les exports WAV / FLAC.

## Modifications DEV15.25.3

- Correction de la ligne de controles du player : `Original / Rendu PAXLAB`, `Volume egal`, puis les boutons transport restent alignes horizontalement sur desktop.
- Homogeneisation de la largeur de colonne droite avant et apres generation de Preview.
- Correction des separateurs visibles entre `Historique des previews`, `Reglages experts` et `Details techniques`.
- Ajout de l etat visuel champagne sur l accordion selectionne.
- Correction de la double barre horizontale sous `Historique des previews`.
- Reconstruction des accordéons en pile verticale pleine largeur pour supprimer le bug `grid-column: 1 / -1`.
- Hotfix CSS uniquement, sans modification du moteur audio.
- Aucune modification des exports WAV / FLAC.
- Aucune modification des presets ni de la recommandation automatique.

## Verification

Le build DEV15.25.3 doit etre verifie avant livraison :

```bash
npm run build
```

Contraintes conservees :

- application 100 % navigateur ;
- aucun serveur audio ;
- aucun upload ;
- traitement local ;
- export local WAV / FLAC ;
- zip sans `node_modules` ;
- zip sans `dist`.
