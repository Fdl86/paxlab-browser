# PAXLAB Browser Engine - DEV15.23.4

DEV15.23.4 est une consolidation de stabilité basée sur DEV15.23.3. Elle corrige les bugs non visibles relevés par audit, avec priorité au player, au seek, à l’export et aux états fichier. Le moteur audio, les presets, la recommandation automatique et les exports WAV / FLAC restent inchangés.

PAXLAB reste une application 100 % navigateur : aucun serveur audio, aucun upload, traitement local, comparaison A/B Original / Rendu PAXLAB, export local WAV / FLAC.

## DEV15.23.4 - Bug audit fixes

- Suppression de la timeline native sous la waveform pour éliminer le décalage visuel entre le bouton range navigateur et le SVG.
- La waveform reste le contrôle principal : clic et drag pour naviguer dans le morceau.
- Drag waveform throttlé en lecture pour limiter les redémarrages audio en rafale.
- Correction du switch Original / Rendu PAXLAB à la fin du morceau : arrêt propre au lieu d’une micro-relance.
- Protection conservée contre le double Play et les démarrages audio obsolètes.
- Limite fichier maintenue à 100 MB.
- Avertissement discret pour gros fichiers, car l’analyse reste locale dans le navigateur.
- Export FLAC : wording renforcé pendant l’encodage local.
- Nom d’export : changer FLAC / WAV ne réinitialise plus le nom saisi, l’extension est normalisée au téléchargement.
- Fichier invalide : refus propre sans conserver le fichier dans l’état courant.
- Badge À régénérer plus explicitement actionnable.
- Raccourci R limité aux états prêts et ramenant vers le bloc rendu.
- Titre export clarifié en Preview sélectionnée.
- Nettoyage des styles morts liés à l’ancienne timeline native.

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

Le build DEV15.23.4 a été vérifié avant livraison :

```bash
npm run build
```

Le zip livré ne contient ni `node_modules`, ni `dist`.
