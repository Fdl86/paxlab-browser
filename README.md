# PAXLAB Browser Engine - DEV15.16.4 Player and export alignment hotfix

PAXLAB Browser Engine est une application web locale Vite / React / TypeScript / Web Audio API destinée à améliorer des morceaux audio générés par IA, notamment Suno.

L'application reste 100 % navigateur : aucun serveur audio, aucun upload, traitement local, comparaison A/B Original / Preview, export local WAV ou FLAC.

## DEV15.16.4

Hotfix UX ciblée sur le lecteur et le panneau export, sans modification du moteur audio.

### Changements

- Le bouton A/B `Preview` devient `Rendu PAXLAB` pour clarifier la version traitée.
- Le sélecteur `Original / Rendu PAXLAB` est recentré au-dessus de la waveform.
- Les boutons `Play`, `Stop` et `Changer de fichier` sont alignés à droite sur la même ligne de contrôle.
- Les hauteurs du sélecteur A/B et des boutons de transport sont harmonisées.
- Le badge `Reco` sous `FLAC 24-bit` est supprimé.
- Le libellé `Format final` est supprimé au-dessus des formats export.
- Le panneau export est remonté et aligné avec la zone principale du lecteur.
- La hiérarchie du panneau export reste compacte : titre, choix du format, nom du fichier, téléchargement.

## État validé conservé

- Mix YouTube 1-click.
- Export WAV 24-bit.
- Export WAV 16-bit.
- Export FLAC 24-bit.
- A/B transparent Original / Preview.
- Rapport simple avant / après.
- Wording `Plafond peak maximum` conservé.
- Le plafond peak reste un plafond de sécurité, pas une cible à atteindre.
- Le calcul de différence de brillance reste exprimé en pourcentage relatif à la brillance d'origine.
- Le moteur audio validé n'a pas été modifié.

## Workflow de test

```bash
npm install
npm run build
```

Le build DEV15.16.4 a été vérifié avant livraison.

## Déploiement Cloudflare Pages

Configuration recommandée :

- Build command : `npm run build`
- Output directory : `dist`
- Node : version Cloudflare Pages par défaut compatible Vite

Le zip de livraison ne contient pas `node_modules` et ne contient pas `dist`.
