# PAXLAB Browser Engine - dev08.3 Target Reality

Application Vite / React / TypeScript pour traitement audio local dans le navigateur.

## Dev08.3

- Séparation claire entre objectif indicatif, résultat obtenu et sécurité audio.
- L’UI n’affiche plus une plage LUFS comme si elle était garantie.
- Le panneau Rendu local affiche le résultat LUFS et le headroom réellement obtenus après génération.
- Le Smart Repair parle d’objectif indicatif plutôt que de promesse de cible fixe.
- Le dashboard explique quand le rendu est contrôlé : headroom respecté mais loudness volontairement plus prudent pour éviter d’écraser.
- Headroom final et headroom actif moyen conservés.
- Mode Impact et option Aigus fatigants conservés.
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
