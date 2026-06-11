# PAXLAB Browser Engine - dev15.14 FLAC Export

Application web locale pour améliorer et exporter des morceaux IA/Suno directement dans le navigateur.

## DEV15.14

Cette version ajoute l’export FLAC 24-bit tout en conservant les exports WAV existants.

- Ajout d’un bouton `Télécharger FLAC 24-bit` dans le panneau d’export.
- Conservation de l’export principal `WAV 24-bit`.
- Conservation de l’option secondaire `WAV 16-bit`.
- Encodage FLAC local, sans upload, sans serveur.
- Micro-correction UX du badge `Aigus IA / fizz` : l’écart est affiché en points (`pt`) au lieu d’un pourcentage ambigu.
- Aucun changement volontaire sur le rendu audio, le Mix YouTube, le LUFS, le limiteur ou les traitements.

## Workflow

1. Importer un fichier WAV ou MP3.
2. Générer une Preview.
3. Comparer Original / Preview en A/B.
4. Exporter en WAV 24-bit, FLAC 24-bit ou WAV 16-bit.

## Déploiement Cloudflare Pages

- Build command : `npm run build`
- Build output directory : `dist`
- Root directory : vide

Le dossier `dist` ne doit pas être poussé dans le repo. Cloudflare doit le générer au build.
