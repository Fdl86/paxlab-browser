# PAXLAB Browser Engine - DEV15.25.1

DEV15.25.1 consolide uniquement `src/styles.css` a partir de DEV15.25. Le rendu champagne, l option `Presence vocale`, `AI Brightness Smoothing`, le player, la waveform seek et les exports WAV / FLAC sont conserves.

## Modifications DEV15.25.1

- Optimisation severe de `src/styles.css`.
- Fusion des blocs `:root` en un seul bloc de tokens.
- Suppression de nombreux styles historiques inutilises.
- Retrait de blocs UI obsoletes non appeles par le code React actuel.
- Conservation de la DA champagne existante.
- Aucune modification du moteur audio.
- Aucune modification des exports WAV / FLAC.
- Aucune modification des presets ni de la recommandation automatique.

## Verification

Le build DEV15.25.1 a ete verifie avant livraison :

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
