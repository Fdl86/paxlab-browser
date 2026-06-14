# PAXLAB Browser Engine - DEV15.22

DEV15.22 ajoute le flux **Preview recommandée** sur la base validée DEV15.21.4 CSS optimized only.

PAXLAB reste une application 100 % navigateur : aucun serveur audio, aucun upload, traitement local, comparaison A/B Original / Rendu PAXLAB, export local WAV / FLAC.

## DEV15.22 - Preview recommandée

- Analyse locale automatique après chargement du fichier.
- Sélection automatique du rendu recommandé à partir des métriques source.
- Bouton principal dans la sidebar : `Générer la Preview recommandée`.
- Suppression du bandeau central `Lancer l’analyse`, devenu redondant.
- Message discret dans la carte morceau chargé : analyse en cours / terminée / erreur.
- Badge `Recommandé` sur le rendu conseillé.
- Note courte expliquant pourquoi PAXLAB recommande ce rendu.
- Maintien du contrôle utilisateur : l’utilisateur peut toujours choisir un autre rendu avant génération.

## Stabilité

- Base CSS optimisée conservée.
- Reset des inputs fichier conservé.
- Erreurs FLAC séparées des messages de succès.
- `canaux` corrigé.
- Export WAV / FLAC inchangé.
- Moteur audio inchangé.

## Build

Le build DEV15.22 a été vérifié avant livraison :

```bash
npm run build
```

Le zip livré ne contient ni `node_modules`, ni `dist`.
