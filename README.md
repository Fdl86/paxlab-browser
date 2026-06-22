# PAXLAB Browser Engine - DEV15.28.3

DEV15.28.3 consolide la refonte premium DEV15.28.2 avec un polish UI cible : topbar simplifiee, metriques de lecture plus propres au demarrage et nettoyage CSS prudent. La logique audio reste celle de DEV15.27.1 : moteur DSP, cibles LUFS, player A/B, exports WAV / FLAC, Basses punchy, Espace stereo et securites restent inchanges.

## Objectif

Figer une base UI premium stable, lisible et plus propre techniquement, sans toucher au son ni au workflow valide.

## Modifications DEV15.28.3

- Topbar simplifiee : seuls les badges `Local` et `Aucun upload` restent visibles.
- Suppression des elements topbar parasites : `Reglages experts`, aide `?` et pseudo-elements CSS heredites.
- Metriques de lecture au repos : remplacement de `-inf` par `--`.
- Sous-textes au repos plus propres : `En attente de lecture`.
- Nettoyage CSS prudent sur la zone topbar : retrait des anciennes regles concurrentes et classes mortes evidentes.
- Titre de l onglet navigateur passe en `PAXLAB Browser Engine - DEV15.28.3`.

## Points conserves

- Aucun changement DSP volontaire.
- Aucun changement des cibles LUFS.
- Aucun changement du player A/B.
- Aucun changement des exports WAV 16 / 24-bit et FLAC 24-bit.
- `Traitement naturel` conserve sa logique douce.
- `Mix YouTube` conserve sa cible YouTube validee.
- `Impact`, `Espace stereo`, `Presence vocale`, `AI Brightness Smoothing` et `Basses punchy` conservent leur comportement.
- Application toujours 100 % navigateur, locale, sans upload.

## Verification

Build verifie avant livraison :

```bash
npm run build
```

Le zip livre ne contient ni `node_modules`, ni `dist`.
