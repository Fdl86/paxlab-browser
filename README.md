# PAXLAB Browser Engine - dev08 Instant A/B

Application Vite / React / TypeScript pour traitement audio local dans le navigateur.

## Dev08

- A/B Engine V3 : commutation Original / Preview plus immédiate, avec micro crossfade court.
- Auto Engine V3 : cible LUFS estimée plus ambitieuse pour les sources très basses.
- Calibration automatique : cible prévue, résultat obtenu, écart loudness et headroom.
- Historique Preview enrichi : LUFS, true peak, headroom et gain appliqué par version.
- Waveform min/max centrée conservée.
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
