# PAXLAB Browser Engine - DEV15.28.7

DEV15.28.7 securise la chaine DSP de PAXLAB sans modifier volontairement les presets, les cibles LUFS, l UI premium stable, le player A/B ni les exports WAV / FLAC.

## Objectif

Preserver les transitoires jusqu au limiteur final, remplacer le hard clipping historique par une limitation multicanale liee et rendre les traitements stereo plus surs sur les sources larges ou proches du plafond.

## Modifications DEV15.28.7

- Gain intermediaire Float32 sans clamp a `-1 / +1`.
- Suppression des clamps intermediaires dans la largeur stereo, `Espace stereo`, la densite douce et le peak polish YouTube.
- Nouveau limiteur multicanal lie avec lookahead de 3 ms et release progressive de 85 ms.
- Gain de reduction identique sur tous les canaux afin de preserver l image stereo.
- Limiteur final applique a tous les presets apres DC offset, fades et finitions YouTube.
- Recalibration loudness securisee, bornee et mesuree avec une passe LUFS / peak allegee.
- Protection commune contre NaN et Infinity dans les buffers audio.
- Statistiques internes de securite : peak avant / apres, reduction maximale et moyenne, depassements et valeurs non finies.
- Tests DSP synthetiques inclus : gain sans clamp, ceiling, stereo link, transparence sous plafond, NaN / Infinity, traitements M/S et absence de plateau hard clip.

## Points conserves

- Cibles LUFS et plafonds de chaque preset inchanges.
- `Traitement naturel` conserve sa logique douce.
- `Mix YouTube` conserve sa cible validee autour de -14 LUFS.
- Intensite de `Basses punchy` et d `Espace stereo` inchangee.
- Exclusivites des options inchangees.
- Player A/B, waveform et UI inchanges.
- Exports WAV 16-bit, WAV 24-bit et FLAC 24-bit inchanges.
- Application toujours 100 % locale dans le navigateur, sans upload.

## Verification

```bash
npm run test:dsp
npm run build
```

Le zip livre ne contient ni `node_modules`, ni `dist`, ni fichiers temporaires de test.
