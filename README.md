# PAXLAB Browser Engine - DEV16

DEV16 reprend la base DEV15.28.4 et **réécrit entièrement la couche UI/CSS** pour garantir
une évolutivité durable, sans toucher au moteur audio.

## Objectif

Rendre l'interface nette, cohérente et surtout **modifiable sans casse**, en remplaçant
un CSS empilé par patches (1451 lignes, ~1580 `!important`, 24 media queries qui se
chevauchaient) par une architecture en couches pilotée par tokens.

## Modifications DEV16

### Direction visuelle — "Studio clair-obscur"
- ADN sombre + or conservé, mais l'or devient un **accent réservé** (action primaire + marque).
- Profondeur par **surfaces neutres en couches** (fond / surface / inset) à la place des
  dégradés radiaux empilés. Aplats nets : plus premium et plus rapide à peindre.
- Rôles de couleur clairs : **bleu** = interactif / export, **vert / ambre / rouge** = états des vumètres.
- Hiérarchie typographique et rythme d'espacement 8 px régularisés.

### Architecture CSS (réécrite de zéro)
- Couches : `reset → tokens → typo → primitives → layout → composants → responsive`.
- **0 `!important`** (contre ~1580). Changer une couleur = changer un token.
- **3 breakpoints nets** sans chevauchement : 1024px, 720px, 480px.
- `styles.css` : 1451 → ~720 lignes. Bundle CSS : ~118 kB → ~45 kB (gzip 18 → 8 kB).

### UX ("user first")
- Les 4 switches (`Basses punchy`, `Espace stéréo`, `Présence vocale`, `AI Brightness
  Smoothing`) restent **groupés au même endroit** dans la carte Rendu.
- L'**incompatibilité mutuelle** s'affiche désormais **en clair sous le toggle** concerné
  (visible sur mobile), au lieu d'un `title` au survol.

## Points conservés (inchangés)

- Aucun changement DSP, cibles LUFS, player A/B.
- Exports WAV 16 / 24-bit et FLAC 24-bit inchangés.
- Comportement des presets inchangé.
- `AI Brightness Smoothing`, `Présence vocale`, `Espace stéréo`, `Basses punchy` :
  logique identique.
- Application 100 % navigateur, locale, sans upload.

## Vérification

```bash
npm install
npm run build
```

Build vérifié avant livraison (TypeScript clean). Le zip livré ne contient ni
`node_modules`, ni `dist`.

> Note : la passe visuelle finale (rendu navigateur) est à faire côté utilisateur ;
> la livraison garantit le build et la couverture de toutes les classes vivantes.
