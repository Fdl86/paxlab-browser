# PAXLAB Browser Engine - DEV16.6

DEV16.6 reprend DEV16.5 et applique une passe de micro-polish UI ciblée, sans toucher au moteur audio.

## Objectif

Sécuriser plusieurs ajustements visuels sur l'écran de comparaison et la colonne d'export : barre A/B plus équilibrée, tuiles plus régulières, switches plus lisibles et boutons d'export plus premium.

## Modifications DEV16.6

### Barre A/B

- Le bloc `Volume égal` est centré entre le sélecteur `Original / Rendu PAXLAB` et les boutons de lecture.
- La barre de contrôle passe sur une grille 3 zones propre : source, volume égal, transport.
- Le responsive repasse en colonne sous 720 px pour éviter toute compression.

### Waveform et mesures

- Les temps de lecture sous la waveform respirent davantage avant les 3 tuiles de mesure.
- Les 3 tuiles de mesure DEV16.5 sont conservées et restent pleine largeur.

### Presets et switches

- Les 4 tuiles de preset ont maintenant une hauteur harmonisée, basée sur la plus haute.
- Les icônes sont réintroduites dans les switches : brillance IA, présence vocale, espace stéréo, basses punchy.
- Les états actifs champagne restent inchangés.

### Export

- Les boutons `FLAC 24-bit`, `WAV 24-bit` et `WAV 16-bit` sont retouchés en style champagne premium.
- L'état actif utilise un check rond à droite, plus lisible et plus cohérent avec le reste de l'UI.
- Le CTA export conserve le style action principale champagne.

## Points conservés

- Aucun changement du moteur audio.
- Aucun changement des presets DSP.
- Aucun changement des exports WAV / FLAC.
- Aucun changement du player A/B.
- Application toujours 100 % navigateur, locale, sans upload.

## Vérification

```bash
npm install
npm run build
```

Le zip livré ne contient ni `node_modules`, ni `dist`.
