# PAXLAB Browser Engine - DEV15.22.1

DEV15.22.1 ajoute la modale d’analyse locale et clarifie les libellés des rendus sur la base validée DEV15.22.

PAXLAB reste une application 100 % navigateur : aucun serveur audio, aucun upload, traitement local, comparaison A/B Original / Rendu PAXLAB, export local WAV / FLAC.

## DEV15.22.1 - Analyse visible et libellés rendus

- Modale d’analyse au chargement du fichier.
- Progression visuelle plus lisible : décodage, mesure du niveau, analyse spectrale, détection brillance IA, choix de la Preview recommandée.
- Durée minimale de feedback visuel pour montrer que PAXLAB travaille même quand l’analyse est rapide.
- `Propre` devient `Nettoyage léger`.
- `Équilibré` devient `Traitement naturel`.
- Suppression de la contradiction avec l’ancien libellé fixe de recommandation.
- Badge `Recommandé` uniquement sur le rendu réellement choisi par l’analyse.
- Textes cohérents dans la sidebar, l’historique, les réglages experts et les résumés.

## Stabilité

- Base CSS optimisée conservée.
- Reset des inputs fichier conservé.
- Erreurs FLAC séparées des messages de succès.
- `canaux` corrigé.
- Export WAV / FLAC inchangé.
- Moteur audio inchangé.

## Build

Le build DEV15.22.1 a été vérifié avant livraison :

```bash
npm run build
```

Le zip livré ne contient ni `node_modules`, ni `dist`.
