# PAXLAB Browser Engine - DEV15.28.2

DEV15.28.2 corrige les alignements restants de la sidebar premium et consolide les cartes de rendu, les options avancees et les cartes export. La logique audio reste celle de DEV15.27.1 : moteur DSP, cibles LUFS, player A/B, exports WAV / FLAC, Basses punchy, Espace stereo et securites restent inchanges.

## Objectif

Rendre l interface plus proche d un vrai dashboard audio premium : plus lisible, plus dense, plus propre, avec une hierarchie visuelle plus forte et un workflow toujours simple.

## Modifications DEV15.28.2

- Nouveau traitement visuel global dark premium avec accent champagne.
- Topbar retravaillee : marque PAXLAB, badges Local, Aucun upload, Reglages experts et aide.
- Layout principal plus proche de la maquette : grand panneau A/B a gauche, configuration et export a droite.
- Lecteur A/B renforce : source Original / Rendu PAXLAB, bouton Volume egal, transports alignes, waveform plus premium.
- Tuiles de monitoring plus lisibles : Peak lecture, Niveau local, Marge peak.
- Bloc `Ce que PAXLAB a change` harmonise avec 5 tuiles stables.
- Panneau `Rendu` retravaille : recommandation plus visible, presets en liste verticale, options sous forme de switches premium.
- Panneau export retravaille : formats plus lisibles, nom de fichier, CTA export plus coherent.
- Accordions bas de page : affichage horizontal quand tout est ferme, empilement propre quand un accordéon est ouvert, sans retour du bug grid-column.
- Titre de l onglet navigateur passe en `PAXLAB Browser Engine - DEV15.28.2`.


### Correctifs et optimisation CSS DEV15.28.2

- Alignement corrige des options de la colonne droite : icone, libelle et switch sont verrouilles sur une grille unique.
- Nettoyage du bloc visuel DEV15.28 : suppression du deuxieme `:root`, retrait de la couche premium concurrente et remplacement par une couche compacte.
- Reduction du fichier `src/styles.css` par rapport a DEV15.28 tout en conservant le rendu premium.
- Aucun changement DSP, player, export ou preset.

## Points conserves

- Aucun changement DSP volontaire.
- Aucun changement des cibles LUFS.
- Aucun changement du player A/B.
- Aucun changement des exports WAV 16 / 24-bit et FLAC 24-bit.
- `Traitement naturel` conserve sa logique douce.
- `Mix YouTube` conserve sa cible YouTube validee.
- `Impact`, `Espace stereo`, `Presence vocale`, `AI Brightness Smoothing` et `Basses punchy` conservent leur comportement.
- Application toujours 100 % navigateur, locale, sans upload.

## Verification

Build verifie avant livraison :

```bash
npm run build
```

Le zip livre ne contient ni `node_modules`, ni `dist`.
