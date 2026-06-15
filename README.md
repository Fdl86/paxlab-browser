# PAXLAB Browser Engine - DEV15.23.6

DEV15.23.6 est une hotfix de l export local basee sur DEV15.23.5. Elle corrige le message de succes obsolète apres regeneration d une Preview et simplifie la modale d export pour ne garder qu un indicateur de chargement.

## DEV15.23.6 - Export success state fix

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

Le build DEV15.23.6 a ete verifie avant livraison :

```bash
npm run build
```

Le zip de livraison ne contient ni `node_modules`, ni `dist`.
