# PAXLAB Browser Engine - dev08.1 Dynamic Targeting

Application Vite / React / TypeScript pour traitement audio local dans le navigateur.

## Dev08.1

- Dynamic Targeting : la cible n’est plus un chiffre unique, mais une plage loudness + headroom selon le fichier.
- Orientation automatique : Prudent / Équilibré / Impact.
- Option Aigus fatigants : AI Shimmer Control pour calmer les brillances IA agressives.
- Rapport plus honnête : cible atteinte, rendu prudent, cible partielle ou sécurité prioritaire.
- Auto Engine V3.1 : meilleure cohérence entre cible prévue et résultat obtenu.
- Calibration loudness supplémentaire après rendu, avec limiteur de sécurité.
- Waveform min/max centrée conservée.
- A/B instantané conservé.
- Export WAV local conservé.
- Aucun upload serveur.
- Aucune API externe.
- Mesures LUFS / true peak indicatives uniquement.

## Commandes

```bash
npm install
npm run dev
npm run build
```

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
