# PAXLAB Browser Engine - v0.9.0-RC6

Release candidate technique construite directement sur la base visuelle stable v0.9.0-RC5.

L'interface et `src/styles.css` restent strictement identiques à RC5. RC6 concentre les changements sur la sécurité DSP, la robustesse du player, la mémoire, le chargement et la validation des exports.

## Nouveautés RC6

### Sécurité DSP

- Gain intermédiaire sans écrêtage prématuré.
- Limiteur offline multicanal lié avec lookahead court.
- Réduction identique sur les canaux pour préserver l'image stéréo.
- Suppression des hard clamps dans les étages Mid/Side intermédiaires.
- Protection NaN / Infinity dans les analyses et les traitements.
- Mesure LUFS / peak allégée pour les passes de calibration.
- Statistiques internes du limiteur : peak avant / après, réduction maximale et moyenne, dépassements et valeurs non finies.
- Cibles LUFS, ceilings, EQ, presets et intensités d'options inchangés.

### Player A/B

- Boucle d'animation active uniquement pendant la lecture.
- Rafraîchissement des meters limité à environ 30 Hz.
- Remise à zéro des meters à la fin naturelle.
- Déverrouillage garanti de la bascule Original / Rendu, même après une erreur.
- Nettoyage renforcé des noeuds et analyseurs.

### Chargement et mémoire

- Validation du poids PCM réel après décodage.
- Estimation prudente de la mémoire nécessaire au rendu.
- Message d'erreur de fichier invalide conservé au lieu d'être effacé par une remise à zéro concurrente.
- Protection existante contre les décodages et rendus obsolètes conservée.

### Export

- Protection synchrone contre les doubles lancements.
- Annulation logique si le rendu change pendant un encodage.
- Validation de la taille et des entêtes WAV 16-bit / 24-bit avant téléchargement.
- Validation de la signature FLAC avant téléchargement.
- Noms, extensions et workflow visuel RC5 conservés.

### Accessibilité invisible

- Overlays d'analyse, de rendu et d'export déclarés comme dialogues modaux.
- Barres de progression exposées avec leurs valeurs ARIA.
- Raccourcis clavier neutralisés pendant l'analyse et le rendu.

## Tests

```bash
npm ci
npm test
npm run build
```

Commandes détaillées :

```bash
npm run test:dsp
npm run test:exports
```

Le zip de livraison ne contient ni `node_modules`, ni `dist`.
