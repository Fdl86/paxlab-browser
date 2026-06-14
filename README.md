# PAXLAB Browser Engine - DEV15.23.3

DEV15.23.3 réécrit proprement la waveform interactive afin que le seek, la partie déjà écoutée et le playhead utilisent une seule base de calcul.

PAXLAB reste une application 100 % navigateur : aucun serveur audio, aucun upload, traitement local, comparaison A/B Original / Rendu PAXLAB, export local WAV / FLAC.

## DEV15.23.3 - Correction structurelle waveform

- Clic sur la waveform pour se déplacer dans le morceau.
- Cliquer-glisser sur la waveform pour scrub fluide.
- Suppression de l’ancien playhead HTML historique.
- Le seek est calculé depuis le SVG réel, pas depuis le conteneur parent.
- La partie déjà écoutée est dessinée barre par barre, avec découpe de la barre traversée.
- La partie restante reste en gris-violet sombre.
- Le playhead SVG utilise exactement le même `progressRatio` que la couleur déjà écoutée.
- Nettoyage du bloc CSS waveform pour éviter les anciennes règles contradictoires.
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

Le build DEV15.23.3 a été vérifié avant livraison :

```bash
npm run build
```

Le zip livré ne contient ni `node_modules`, ni `dist`.
