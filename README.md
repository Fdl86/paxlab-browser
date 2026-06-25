# PAXLAB Browser Engine - v0.9.0-RC3

Release candidate de finition basée sur RC2. Objectif : renforcer l'aspect produit fini, améliorer les contrôles visibles et corriger le retour immédiat du format d'export, sans modifier le moteur audio.

## Objectif RC3

- Donner un relief premium léger aux vrais boutons d'action.
- Garder les cartes de format export en style plat pour ne pas surcharger l'interface.
- Corriger l'alignement vertical des capsules d'état.
- Rendre l'ouverture du journal technique plus visible.
- Mettre à jour immédiatement l'extension du nom de fichier quand le format export change.
- Conserver le workflow : charger, générer, comparer en A/B, exporter localement.

## Modifications RC3

### Interface

- Relief 3D léger appliqué uniquement aux boutons : `Original`, `Rendu PAXLAB`, `Play`, `Stop`, `Changer de fichier`, `Générer le rendu PAXLAB`, `Exporter le fichier`.
- Les boutons de choix de format `FLAC 24-bit`, `WAV 24-bit`, `WAV 16-bit` restent plats et lisibles.
- Capsule `Export sécurisé` mieux centrée verticalement.
- Contrôle du `Journal technique` placé à droite dans l'en-tête de la ligne, avec libellé `Afficher` / `Masquer` plus visible.

### Export

- Le champ `Nom du fichier` se met à jour immédiatement quand l'utilisateur change de format.
- Le suffixe `16bit` / `24bit` et l'extension `.wav` / `.flac` restent cohérents avec le format sélectionné.
- Le nom final reste normalisé au moment du téléchargement.

### Optimisation

- CSS ajusté par petites touches, sans créer de nouveau système parallèle.
- Vérification du CSS après modification.
- Aucun composant legacy réintroduit.

### Stabilité

- Aucun changement du moteur audio.
- Aucun changement des presets DSP.
- Aucun changement du player A/B.
- Aucun changement de waveform.
- Aucun changement des exports WAV / FLAC, hors nom de fichier affiché.

## Vérification

```bash
npm ci
npm run build
```

Le zip livré ne contient ni `node_modules`, ni `dist`.
