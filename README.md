# PAXLAB Browser Engine - DEV15.23

DEV15.23 ajoute le seek directement dans la waveform et une couleur différente pour la partie déjà écoutée, sur la base stable DEV15.22.1.

PAXLAB reste une application 100 % navigateur : aucun serveur audio, aucun upload, traitement local, comparaison A/B Original / Rendu PAXLAB, export local WAV / FLAC.

## DEV15.23 - Waveform seek et progression d'écoute

- Clic sur la waveform pour se déplacer dans le morceau.
- Cliquer-glisser sur la waveform pour scruber plus précisément.
- Partie déjà écoutée affichée en violet.
- Partie restante affichée en gris-violet sombre.
- Curseur pointeur réactivé uniquement sur la waveform interactive.
- Playhead conservé pour indiquer la position de lecture.
- Barre de timeline existante conservée en complément.

## Stabilité conservée

- Modale d’analyse locale au chargement conservée.
- Preview recommandée dynamique conservée.
- Libellés `Nettoyage léger` et `Traitement naturel` conservés.
- Base CSS optimisée conservée.
- Reset des inputs fichier conservé.
- Erreurs FLAC séparées des messages de succès.
- Export WAV / FLAC inchangé.
- Moteur audio inchangé.

## Build

Le build DEV15.23 a été vérifié avant livraison :

```bash
npm run build
```

Le zip livré ne contient ni `node_modules`, ni `dist`.
