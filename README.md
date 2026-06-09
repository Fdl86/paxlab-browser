# PAXLAB Browser Engine - dev12 Guided Studio UX

Application Vite / React / TypeScript pour générer une Preview Master locale dans le navigateur.

## Dev12

- Refonte d’architecture UI/UX en parcours guidé.
- Avant import : landing premium sans studio vide.
- Après import : choix simple du rendu Propre / Équilibré / Impact.
- Option Aigus fatigants conservée et visible.
- Pendant traitement : overlay local premium avec étapes.
- Après génération : bloc A/B central, export WAV visible, historique repliable.
- Mode Expert déplacé dans un accordéon, fermé par défaut.
- Historique des previews conservé, mais moins envahissant.
- Moteur audio conservé : Propre, Équilibré, Impact, Aigus fatigants, Préserver l’espace.
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
