# PAXLAB Browser Engine - DEV15.20

DEV15.20 applique la direction flat violet de référence sur la base DEV15.19 : interface sombre disciplinée, accent violet unique, topbar compacte, layout 2 colonnes plus net, sidebar persistante et export visible. Le moteur audio, les exports WAV / FLAC et le calcul de brillance ne sont pas modifiés.

PAXLAB Browser Engine est une application web locale Vite / React / TypeScript / Web Audio API destinée à améliorer des morceaux audio générés par IA, notamment Suno.

L'application reste 100 % navigateur : aucun serveur audio, aucun upload, traitement local, comparaison A/B Original / Rendu PAXLAB, export local WAV ou FLAC.

## DEV15.19

Release UI basée sur DEV15.18.1. Le moteur audio, l'export WAV, l'export FLAC et le calcul de brillance ne sont pas modifiés.

### Direction visuelle

- Passage vers une interface dark flat plus disciplinée.
- Fond proche `#0a0a0f`.
- Surfaces principales proches `#13131a` et `#1c1c26`.
- Accent violet unique `#7c6dfa`.
- Suppression visuelle des gradients et glows sur les composants principaux.
- Hiérarchie typographique simplifiée : valeurs clés en blanc, labels en gris clair, éléments secondaires en gris désaturé.

### Layout et workflow

- Layout principal en 2 colonnes : écoute et comparaison à gauche, configuration et export à droite.
- Sidebar droite persistante avec choix du rendu, résumé Preview et export.
- Export local visible dans le flux principal, avec CTA clair.
- Message de confiance renforcé : Local - Aucun upload dans la topbar, l'upload et le CTA.
- Stepper visuel plus lisible avec état actif violet.

### Corrections UI groupées

- Waveform désormais visuelle seulement : curseur par défaut, pas de curseur main.
- Conservation du bouton éjecter au gabarit Play / Stop.
- Conservation du bouton A/B Original / Rendu PAXLAB.
- Conservation du rapport d'écoute DEV15.18.
- Conservation des correctifs de stabilité DEV15.18.1.

## État validé conservé

- Mix YouTube 1-click.
- AI Brightness Smoothing.
- Export WAV 24-bit.
- Export WAV 16-bit.
- Export FLAC 24-bit.
- A/B transparent Original / Rendu PAXLAB.
- Wording `Plafond peak maximum` conservé.
- Le plafond peak reste un plafond de sécurité, pas une cible à atteindre.
- Le moteur audio validé n'a pas été modifié.
- L'export FLAC validé n'a pas été modifié.

## Workflow de test

```bash
npm install
npm run build
```

Le build DEV15.19 a été vérifié avant livraison.

## Déploiement Cloudflare Pages

Configuration recommandée :

- Build command : `npm run build`
- Output directory : `dist`
- Node : version Cloudflare Pages par défaut compatible Vite

Le zip de livraison ne contient pas `node_modules` et ne contient pas `dist`.
