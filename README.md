# PAXLAB Browser Engine - DEV15.23.5

DEV15.23.5 est une consolidation orientee export et rendu Impact. Elle part de DEV15.23.4, conserve la base player stable et ajoute un feedback visible pendant l export local. Le moteur audio, l export WAV, l export FLAC, la waveform interactive et la recommandation automatique restent compatibles avec la base precedente.

## DEV15.23.5 - Export feedback and Impact profile

- Ajout d une modale d export local pendant la preparation FLAC / WAV.
- Arret du player avant le debut effectif de l encodage export.
- Pause courte avant encodage pour laisser le navigateur afficher la modale et appliquer l arret audio.
- Message gros fichier active dans la modale d analyse.
- Recommandation Impact renforcee pour les sources a LUFS bas avec des cretes deja presentes.
- Impact automatique base sur le profil Power pour differencier clairement ce rendu du Mix YouTube.
- Les boutons de rendu simples recalculent maintenant vraiment les valeurs du preset choisi.
- Aucun changement de palette dans cette version.

## Garanties de workflow

- Application 100 % navigateur.
- Aucun serveur audio.
- Aucun upload.
- Traitement local Web Audio API.
- Comparaison A/B Original / Rendu PAXLAB.
- Export WAV 24-bit, WAV 16-bit et FLAC 24-bit.

## Validation

Le build DEV15.23.5 a ete verifie avant livraison :

```bash
npm run build
```

Le zip de livraison ne contient ni `node_modules`, ni `dist`.
