# PAXLAB Browser Engine - DEV15.25.2

DEV15.25.2 est une hotfix CSS basee sur DEV15.25.1. Elle conserve la DA champagne, l option `Presence vocale`, `AI Brightness Smoothing`, le player, la waveform seek et les exports WAV / FLAC.

## Modifications DEV15.25.2

- Correction de la ligne de controles du player : `Original / Rendu PAXLAB`, `Volume egal`, puis les boutons transport restent alignes horizontalement sur desktop.
- Correction des separateurs visibles entre `Historique des previews`, `Reglages experts` et `Details techniques`.
- Hotfix CSS uniquement, sans modification du moteur audio.
- Aucune modification des exports WAV / FLAC.
- Aucune modification des presets ni de la recommandation automatique.

## Verification

Le build DEV15.25.2 doit etre verifie avant livraison :

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
