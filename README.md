# PAXLAB Browser Engine - DEV15.27

DEV15.27 ajoute l option `Basses punchy` sur la base stable DEV15.26.1. La fonction renforce le kick et le grave utile de facon controlee, sans changer les cibles LUFS, le player, ni les exports WAV / FLAC.

## Modifications DEV15.27

- Ajout du switch `Basses punchy`, OFF par defaut.
- Renfort controle de la zone grave utile autour du kick, avec bas-medium surveille.
- Intensite adaptee au preset : tres legere en Nettoyage leger, moderee en Traitement naturel, standard en Mix YouTube, reduite en Impact.
- Incompatibilite automatique avec `Presence vocale` pour eviter un equilibre voix + bas trop pousse.
- Compatibilite conservee avec `AI Brightness Smoothing` et `Espace stereo`.
- Ajout de la tuile `Basses punchy` dans `Ce que PAXLAB a change` quand l option est active.
- Ajout de la mesure avant / apres dans le panneau Avant / Apres.
- Ajout des donnees correspondantes dans `Details techniques` et dans l historique des previews.
- Aucune modification volontaire du niveau LUFS cible.

## Points conserves

- Traitement naturel conserve sa logique douce et peut rester plus prudent en LUFS.
- `Mix YouTube` conserve sa cible YouTube validee.
- `Espace stereo` conserve les graves proteges au centre.
- Aucun re-brightening ajoute.
- Export WAV 16 / 24-bit et FLAC 24-bit inchanges.
- Player A/B et waveform inchanges.
- Application toujours 100 % navigateur, locale, sans upload.

## Verification

Le build DEV15.27 doit etre verifie avant livraison :

```bash
npm run build
```

Le zip livre ne doit contenir ni `node_modules`, ni `dist`.
