# PAXLAB Browser Engine - DEV15.25

DEV15.25 ajoute l option `Presence vocale` comme option de rendu separee, exclusive avec `AI Brightness Smoothing`. Cette version conserve le moteur audio principal, les presets, le player, la waveform seek et les exports WAV / FLAC valides.

## Modifications DEV15.25

- Ajout de l option `Presence vocale` dans le panneau `Rendu`.
- Option desactivee par defaut : aucun changement sonore si elle n est pas activee.
- `Presence vocale` et `AI Brightness Smoothing` sont exclusives : quand l une est active, l autre est grisee.
- Traitement vocal subtil : nettoyage leger du voile, presence douce du chant et articulation controlee.
- Aucun boost systematique au-dessus de 6 kHz afin d eviter de ramener du fizz IA.
- Historique, resume et rapports indiquent correctement l option de presence vocale quand elle est active.
- CSS complete avec l etat grise des options incompatibles.

## Verification

Le build DEV15.25 a ete verifie avant livraison :

```bash
npm run build
```

Contraintes conservees :

- application 100 % navigateur ;
- aucun serveur audio ;
- aucun upload ;
- traitement local ;
- export local WAV / FLAC ;
- zip sans `node_modules` ;
- zip sans `dist`.
