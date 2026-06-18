# PAXLAB Browser Engine - DEV15.26.1

DEV15.26.1 ajoute le reporting visuel de l option `Espace stereo` sur la base stable DEV15.26. Le DSP Mid / Side, les cibles LUFS, le player et les exports WAV / FLAC restent inchanges.

## Modifications DEV15.26.1

- Ajout d une mesure `Espace stereo` avant / apres dans le rapport de Preview.
- Ajout d une ligne `Espace stereo` dans le panneau Avant / Apres.
- Ajout du delta d espace stereo dans le rapport de traitement local.
- Ajout du delta dans l historique des previews quand l option est active.
- Calcul local du ratio Side / Mid avant et apres rendu.
- Reporting des variations globales, graves et haut du spectre pour verifier que les graves restent proteges.
- CSS minimal pour integrer la nouvelle tuile sans casser la grille existante.

## Points conserves

- Traitement audio DEV15.26 conserve.
- Option `Espace stereo` toujours OFF par defaut.
- Aucun re-brightening ajoute.
- Aucune modification des cibles LUFS.
- Export WAV 16 / 24-bit et FLAC 24-bit inchanges.
- Player A/B et waveform inchanges.
- Application toujours 100 % navigateur, locale, sans upload.

## Verification

Le build DEV15.26.1 doit etre verifie avant livraison :

```bash
npm run build
```

Le zip livre ne doit contenir ni `node_modules`, ni `dist`.
