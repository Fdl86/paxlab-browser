# PAXLAB Browser Engine - DEV15.21.4

DEV15.21.4 est une hotfix stabilité et maintenance basée sur DEV15.21.3.

Cette version corrige la réimportation du même fichier, sépare correctement les erreurs FLAC des exports réussis, corrige le libellé "canaux", ajoute une aide au toggle Volume égal et rend le statut "À régénérer" actionnable. Elle consolide aussi `src/styles.css` en retirant les anciens blocs historiques devenus redondants, sans modifier le moteur audio.

## Workflow validé

- Application 100 % navigateur.
- Aucun serveur audio.
- Aucun upload.
- Traitement local via Web Audio API.
- Comparaison A/B Original / Rendu PAXLAB.
- Export local WAV 16-bit, WAV 24-bit et FLAC 24-bit.

## DEV15.21.4 - Correctifs

- Reset des inputs fichier après sélection pour permettre de recharger le même fichier.
- Erreurs FLAC affichées comme erreurs, plus comme succès.
- Correction `canalx` vers `canaux`.
- Aide tooltip sur `Volume égal`.
- Badge `À régénérer` cliquable quand une Preview doit être régénérée.
- Nettoyage CSS : suppression des anciens blocs d'overrides DEV12.1 à DEV15.20.1 devenus redondants.
- `styles.css` réduit d'environ 9187 lignes à moins de 5000 lignes.

## Commandes

```bash
npm install
npm run build
```

Le build DEV15.21.4 a été vérifié avant livraison.
