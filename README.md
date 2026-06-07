# PAXLAB Browser Engine - dev04 Realtime

Application Vite / React / TypeScript hébergée sur Cloudflare Pages.

Objectif : analyse et Preview Master locale dans le navigateur pour fichiers WAV / MP3, sans upload serveur.

## Dev04 Realtime

- Import WAV / MP3 local
- Décodage Web Audio API
- Analyse source indicative
- Cible automatique estimée selon le niveau, les aigus et la dynamique du fichier
- Génération Preview Master locale en mémoire navigateur
- Lecteur A/B Original / Preview Master avec source active clairement affichée
- Monitoring dynamique pendant l’écoute : peak approx., integrated estimé, short-term estimé, niveau de sortie, headroom et statut
- Waveform cliquable
- Suppression de l’affichage des zones d’écoute
- Chaîne automatique V0.7 : anti-fizz, de-click léger, de-clipper prudent, contrôle sub, EQ simplifiée, stéréo, densité, compression, limiteur sécurité
- Aucun export
- Aucun upload serveur
- Aucune mesure LUFS officielle

## Commandes

```bash
npm install
npm run dev
npm run build
```

## Cloudflare Pages

- Build command : `npm run build`
- Output directory : `dist`
- Framework preset : `None` ou `Vite` si disponible

## Notes

Les indicateurs LUFS / true peak sont des estimations internes utiles pour comparer Original et Preview Master. Ils ne remplacent pas une mesure EBU R128 officielle.
