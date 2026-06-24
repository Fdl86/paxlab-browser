# PAXLAB Browser Engine - DEV16.8

DEV16.8 reprend DEV16.7 et nettoie les anciens blocs de type rapport/debug dans les détails techniques, sans toucher au moteur audio.

## Objectif

Conserver les informations utiles du traitement local, mais les présenter dans une forme plus compacte, plus premium et plus cohérente avec le reste de l'interface.

## Modifications DEV16.8

### Détails techniques

- Le tiroir `Détails techniques` passe en affichage vertical simple.
- Les anciens blocs massifs `Smart Repair` et `Rapport de Preview` sont retirés de l'affichage principal.
- La section `Mesures avant / après` reste la référence principale pour comprendre le rendu.
- Le padding du header `Détails techniques` est harmonisé afin d'éviter un décalage visuel trop important à gauche.

### Traitement appliqué

- Nouveau bloc compact `Traitement appliqué`.
- Résumé clair de la chaîne locale : profil, anti-fizz, basses, stéréo et marge peak.
- Chips synthétiques pour garder les informations importantes visibles sans surcharge.
- Statut `Terminé` et indication d'export sécurisé quand une Preview est disponible.

### Journal technique

- La chaîne détaillée est déplacée dans un `Journal technique` repliable.
- Les données expertes restent disponibles : profil, objectif LUFS, résultat, marge finale, ceiling, anti-fizz, basses, stéréo, réparations et temps de rendu.
- Les cartes du journal sont compactes et responsives.

## Points conservés

- Aucun changement du moteur audio.
- Aucun changement des presets DSP.
- Aucun changement des exports WAV / FLAC.
- Aucun changement du player A/B.
- Aucun changement du workflow local, sans serveur et sans upload.

## Vérification

```bash
npm install
npm run build
```

Le zip livré ne contient ni `node_modules`, ni `dist`.
