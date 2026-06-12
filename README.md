# PAXLAB Browser Engine - DEV15.17.1 Transport alignment hotfix

PAXLAB Browser Engine est une application web locale Vite / React / TypeScript / Web Audio API destinée à améliorer des morceaux audio générés par IA, notamment Suno.

L'application reste 100 % navigateur : aucun serveur audio, aucun upload, traitement local, comparaison A/B Original / Preview, export local WAV ou FLAC.

## DEV15.17.1

Hotfix UX ciblée sur le lecteur et le panneau export, sans modification du moteur audio.

### Changements

- Le bouton éjecter / changer de fichier reprend le même gabarit carré que les boutons Play et Stop.
- La ligne `Original / Rendu PAXLAB` et les boutons transport restent harmonisés sur une hauteur commune.
- La zone gauche n'est plus étirée artificiellement par la grille de résultat.
- Le texte `Lecture courante. Les mesures détaillées restent disponibles dans les accordéons techniques.` est supprimé pour gagner de la hauteur.
- L'alignement vertical entre la zone lecteur à gauche et la colonne export / preview à droite est resserré.
- La hiérarchie export compacte de DEV15.16.4 est conservée : titre, choix du format, nom du fichier, téléchargement.

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

Le build DEV15.17.1 a été vérifié avant livraison.

## Déploiement Cloudflare Pages

Configuration recommandée :

- Build command : `npm run build`
- Output directory : `dist`
- Node : version Cloudflare Pages par défaut compatible Vite

Le zip de livraison ne contient pas `node_modules` et ne contient pas `dist`.
