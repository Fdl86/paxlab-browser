# PAXLAB Browser Engine - DEV15.26

DEV15.26 ajoute l option `Espace stereo` a la base stable DEV15.25.3. La version conserve la DA champagne, `Presence vocale`, `AI Brightness Smoothing`, le player, la waveform seek et les exports WAV / FLAC.

## Modifications DEV15.26

- Ajout de l option `Espace stereo`, OFF par defaut.
- Traitement Mid / Side leger avec protection des graves : le Side est elargi uniquement au-dessus d environ 220 Hz.
- Option disponible dans le parcours principal et dans les reglages avances.
- Affichage de l option dans la Preview prete, l historique, le resume et le rapport de traitement.
- Ajout d une ligne `espace stereo M/S securise` dans la chaine appliquee quand l option est active.
- Aucun re-brightening ajoute.
- Aucune modification des cibles LUFS des presets.
- Moteur audio conserve hors ajout cible de l espace stereo.
- Exports WAV / FLAC inchanges.
- Player et waveform inchanges.

## Verification

Le build DEV15.26 doit etre verifie avant livraison :

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
