# PAXLAB Browser Engine - v0.9.0-RC2

Release candidate de polish final basée sur RC1. Objectif : renforcer l'aspect produit fini sans modifier le moteur audio.

## Objectif RC2

- Donner plus de présence aux boutons principaux `Générer` et `Exporter`.
- Supprimer les sous-textes redondants dans les CTA principaux.
- Basculer directement les réglages en mode avancé, sans doublon simple/expert.
- Nettoyer le code et le CSS legacy liés à l'ancien mode simple.
- Conserver le workflow : charger, générer, comparer en A/B, exporter localement.

## Modifications RC2

### Interface

- Boutons principaux avec relief premium léger, ombre interne et état pressé.
- Bouton de génération centré et simplifié.
- Bouton d'export centré et simplifié en `Exporter le fichier`.
- `Réglages experts` renommé en `Réglages avancés`.
- Suppression du toggle `Simple / Expert` dans les réglages avancés.
- Suppression des cartes simples redondantes dans les réglages.

### Optimisation

- Suppression du code React devenu mort après retrait du mode simple.
- Suppression des styles CSS legacy du mode simple et du mode toggle.
- Vérification du CSS après nettoyage.

### Stabilité

- Aucun changement du moteur audio.
- Aucun changement des presets DSP.
- Aucun changement du player A/B.
- Aucun changement de waveform.
- Aucun changement des exports WAV / FLAC.

## Vérification

```bash
npm ci
npm run build
```

Le zip livré ne contient ni `node_modules`, ni `dist`.
