# PAXLAB Browser Engine - DEV15.16 Premium UX

Application web locale pour améliorer et exporter des morceaux IA/Suno directement dans le navigateur.

PAXLAB reste 100 % navigateur : aucun serveur audio, aucun upload, traitement local, comparaison A/B Original / Preview et export local WAV ou FLAC.

## DEV15.16

Version UX prudente basée sur DEV15.15.2 validée.

- Intégration visuelle premium option B : lecteur A/B plus central, colonne export plus claire, hiérarchie plus proche de la maquette validée.
- Export désormais visible directement dans la colonne droite après génération de Preview.
- Sélection claire des formats : `FLAC 24-bit`, `WAV 24-bit`, `WAV 16-bit`.
- `FLAC 24-bit` devient le choix recommandé par défaut pour YouTube.
- Renommage de l’option `Aigus fatigants` en `AI Brightness Smoothing`.
- Aide courte associée : `Calme les aigus métalliques, le fizz et la fatigue d’écoute.`
- Correction des wordings restés orientés WAV : workflow, landing, overlay de rendu et export.
- Le comparatif de brillance indique maintenant une variation relative en pourcentage par rapport à la brillance d’origine, par exemple `-34 % vs origine`.
- Aucun changement volontaire sur le moteur audio, le Mix YouTube, le LUFS, le limiteur, le traitement `AI Brightness Smoothing` ou l’export FLAC validé.

## Base validée DEV15.15.2

DEV15.15.2 a validé l’export FLAC 24-bit : FLAC valide, `flac -t` OK, 48 kHz, stéréo, 24-bit, durée cohérente, STREAMINFO MD5 présent, PCM décodé identique au WAV PAXLAB 24-bit de référence.

## Workflow

1. Importer un fichier WAV ou MP3.
2. Générer une Preview avec Mix YouTube ou un rendu simple.
3. Comparer Original / Preview en A/B transparent.
4. Exporter localement en FLAC 24-bit, WAV 24-bit ou WAV 16-bit.

## Déploiement Cloudflare Pages

- Build command : `npm run build`
- Build output directory : `dist`
- Root directory : vide

Le dossier `dist` ne doit pas être poussé dans le repo. Cloudflare doit le générer au build.

## Note DEV

Ne pas inclure `node_modules` dans le zip livré. Ne pas inclure `dist` dans le zip livré.
