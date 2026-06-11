# PAXLAB Browser Engine - dev15.11 YouTube Simple Mode

Application Vite / React / TypeScript pour générer une Preview Master locale dans le navigateur.

## Dev15.11

Cette version simplifie le mode Mix YouTube sans modifier le rendu audio validé.

Points principaux :

- aucun changement moteur audio ;
- aucun changement LUFS, peak polish, limiteur ou export WAV ;
- en Mix YouTube, l’interface masque les réglages qui prêtaient à confusion ;
- le headroom manuel est remplacé par une sécurité peak automatique affichée clairement ;
- Mix YouTube conserve uniquement les réglages utiles : nettoyage source, niveau YouTube et brillance / anti-fizz ;
- l’intensité, la largeur stéréo, la densité harmonique et le headroom manuel restent disponibles sur les autres modes ;
- le lecteur renomme LUFS estimé en Niveau local pour éviter la confusion avec le LUFS intégré global ;
- Headroom devient Marge peak dans le lecteur ;
- README, version visible et titre d’onglet navigateur mis à jour.

## Fonctionnement

PAXLAB fonctionne 100 % dans le navigateur :

- aucun upload audio ;
- aucun serveur audio ;
- traitement local ;
- comparaison A/B Original / Preview ;
- export WAV local.

## Installation locale

```bash
npm install
npm run dev
npm run build
```

## Cloudflare Pages

Paramètres conseillés :

- Framework preset : None
- Build command : npm run build
- Output directory : dist
