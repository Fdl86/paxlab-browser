# PAXLAB Browser Engine - DEV16.7

DEV16.7 reprend DEV16.6 et compacte la section Détails techniques, sans toucher au moteur audio.

## Objectif

Rendre les mesures après Preview plus lisibles et plus utiles : moins de répétitions, lignes plus compactes, bandes Original / Preview avec échelles fixes par mesure, et résumé à l'écoute intégré.

## Modifications DEV16.7

### Détails techniques

- Le titre de section devient `Détails techniques` avec un sous-titre `Mesures avant / après`.
- Le bloc `Traduction à l'écoute` est remplacé par un résumé compact intégré en haut de section.
- Les lignes de comparaison sont compactées pour réduire fortement la hauteur totale.
- Chaque ligne conserve une lecture Original / Preview avec deux bandes fines.
- Une légende indique clairement : champagne = Original, vert = Preview, échelles fixes par mesure.
- Chaque mesure affiche un verdict court à droite et l'échelle utilisée.

### Échelles visuelles

- Niveau perçu : échelle de -18 à -12 LUFS.
- Peak global : échelle de -12 à 0 dBFS.
- Brillance IA / fizz : échelle de 0 à 4 %.
- Dynamique / respiration : échelle adaptée au preset actif.
- Basses punchy : échelle de 0 à 60 % utiles.
- Espace stéréo : échelle de 0.25 à 0.60.

### Nettoyage visuel

- Les chips techniques restent en bas, mais dans un style compact.
- La note finale devient plus courte et plus discrète.
- Les anciennes classes avant / après sont conservées pour sécurité, mais la nouvelle section utilise des classes dédiées `technical-*`.

## Points conservés

- Aucun changement du moteur audio.
- Aucun changement des presets DSP.
- Aucun changement des exports WAV / FLAC.
- Aucun changement du player A/B.
- Aucun changement du workflow local, sans serveur et sans upload.

## Vérification

```bash
npm install
npm run build
```

Le zip livré ne contient ni `node_modules`, ni `dist`.
