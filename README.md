# PAXLAB Browser Engine - DEV15.29

DEV15.29 reconstruit `src/styles.css` depuis une base propre pour stabiliser l UI premium et préparer un responsive réellement exploitable. Le moteur audio, les presets, les cibles LUFS, Basses punchy, Espace stéréo, le player A/B et les exports WAV / FLAC restent inchangés.

## Modifications DEV15.29

- Reconstruction complète de `src/styles.css` avec une structure claire : tokens, base, topbar, layouts, player, sidebar, export, accordéons et responsive.
- Desktop premium conservé dans l esprit de DEV15.28.4.
- Responsive reconstruit autour de breakpoints propres : 1380, 1200, 900, 640 et 440 px.
- Collapse à une colonne dès 1200 px pour éviter la sidebar trop large sur laptop.
- Correction du libellé `Marge peak` au repos avec `En attente de lecture`.
- Réduction massive des règles concurrentes et des `!important`.
- Titre de l onglet navigateur passé en `PAXLAB Browser Engine - DEV15.29`.

## Contraintes conservées

- Traitement 100 % navigateur.
- Aucun upload audio.
- Aucun serveur audio.
- Exports locaux WAV 16-bit, WAV 24-bit et FLAC 24-bit.
- A/B Original / Rendu PAXLAB conservé.

## Build

```bash
npm install
npm run build
```
