# PAXLAB Web Studio 3.3 - RC2

FR / EN. Application de mastering local dans le navigateur, dérivée de PAXLAB Browser 0.9.0-RC6 et des sources DSP de PAXLAB Studio DEV3.3 RC4/RC4.1.

**Statut : source candidate à compiler et à valider.** Le moteur C# est inclus, mais la compilation WebAssembly et la parité numérique des rendus Windows/Web n'ont pas été exécutées dans l'environnement de préparation. Le workflow GitHub bloque le déploiement en cas d'échec de compilation ou de test navigateur.

## Déploiement GitHub Pages

1. Décompresser l'archive à la racine du dépôt `paxlab-browser`. Remplacer les fichiers suivis existants ; supprimer `src/components/` (anciens composants remplacés). Ne pas remplacer le dossier `.git` du dépôt.
2. Dans GitHub > Settings > Pages > Build and deployment, choisir **GitHub Actions**.
3. Commit et push sur `main`. Le workflow `.github/workflows/pages.yml` installe Node, .NET 8 et `wasm-tools`, exécute les tests, compile le moteur et l'interface, puis vérifie le fonctionnement dans Chromium avant de publier `dist`.
4. Ouvrir l'adresse Pages uniquement après succès du workflow. Les fichiers audio sont lus et traités sur l'appareil de l'utilisateur, pas par GitHub.

Pour une migration propre, `git rm -r src/components` avant de copier les fichiers est suffisant pour les composants remplacés. Les anciens modules DSP TypeScript sont conservés uniquement comme référence et pour les tests historiques ; ils ne servent pas de fallback silencieux au nouveau moteur.

## Compilation locale

Prérequis : Node 22.16+, npm, .NET SDK 8 et workload `wasm-tools`.

```sh
dotnet workload install wasm-tools
npm ci
npm test
npm run build
npm run preview
```

`npm run dev` compile également le moteur avant de lancer Vite. Le moteur généré est copié dans `public/engine/`, puis embarqué dans `dist/`. Servir via HTTP(S), pas en ouvrant directement `index.html` avec file://.

## Fonctions

- V5.5 et V6 : sources C# d'origine, restauration adaptative V6 et garde true peak.
- Détection expérimentale V5.5/V6 : PCM16 stéréo 48 kHz, 20 secondes minimum, lecture du PCM avant décodage. Si indéterminé, choix explicite obligatoire. Seuils historiques conservés ; ne pas confondre diagnostic probable et preuve de provenance.
- Mastering : presets léger, naturel, impact, YouTube, anti-fatigue, plus ouvert, recommandation issue de l'analyse, options stéréo/voix/basses.
- Finition B, R1 Doux, R2 Progressif, Rider Off/Auto/Forcé et ses trois profils. Le Rider pré-master est contourné quand B ou R1/R2 est actif, comme dans Windows.
- Comparaison A/B, différence globale alignée, signal retiré par la restauration V6 si disponible, waveform, mesures, export WAV/FLAC 16/24 bits.
- Français/English sans rechargement, préférences locales, correction de génération mémorisée par SHA-256 du fichier si disponible. Aucun SRT, Whisper, CTC, playlist ou lecteur de bibliothèque.

L'interface a été resserrée sur un seul morceau. Les anciennes cartes détaillées, l'historique de session et les réglages experts complets n'ont pas été reportés dans cette RC. Les WAV PCM supportés sont décodés sans rééchantillonnage ; autres formats décodés à 48 kHz par le navigateur. Le moteur emploie l'analyse CPU C# plutôt que le backend Vulkan Windows. Ces différences doivent être contrôlées avant d'annoncer une parité de rendu.

## Validation réalisée / à réaliser

- 16 fichiers C# modèles et DSP identiques octet pour octet aux sources Windows ; empreintes dans `engine/DSP-SHA256.txt`.
- Détecteur : adaptation du lecteur NAudio à la lecture d'octets PCM en mémoire ; calcul FFT et seuils conservés.
- 7/7 tests DSP TypeScript historiques et 3/3 tests WAV historiques passés localement via TypeScript 5.8.3. Ces tests ne valident pas le nouveau moteur WASM.
- Tests locaux de cohérence des clés FR/EN et du parseur WAV passés ; syntaxe TypeScript et JavaScript vérifiée.
- Compilation .NET/WASM et build Vite non exécutés localement : SDK absent et dépendances npm non disponibles. Le test navigateur est inclus mais non exécuté localement.
- Comparaison sur de vrais exports Suno : à réaliser (V5.5 et V6, YouTube, B, R1, R2, Rider). Ne pas déclarer de parité bit à bit avant cette comparaison.

---

## English - setup and validation

Unzip into the existing repository root, remove the replaced `src/components/` directory, keep the repository's `.git` directory, enable **GitHub Actions** in Settings > Pages, and push to `main`. The workflow builds and tests the site before deployment. Local build commands are listed above.

This release candidate reuses the original Windows C# mastering and restoration algorithms via a browser WebAssembly worker. It supports V5.5/V6, experimental generation detection (with manual confirmation when undetermined), Finishing B, Gentle (R1), Progressive (R2), Auto Level Rider, waveform and A/B comparison, and WAV/FLAC export. No subtitles or standalone media library. The language switch is immediate and persistent. Audio remains on the device.

The previous detailed dashboard, session history and full expert controls are not included in this focused RC. Supported PCM WAV files retain their sample rate; other formats are decoded at 48 kHz. The Windows Vulkan analysis backend is not used in the browser. The C# WebAssembly build, browser integration and audio parity must be validated before claiming production readiness. The supplied GitHub workflow checks compilation and browser smoke tests; synthetic tests do not establish parity on real music.

## RC1 PERF1 - browser performance and live progress

Production builds now enable WebAssembly AOT (ahead-of-time compilation) with the same C# DSP algorithms. This should reduce CPU-bound mastering time, at the cost of a longer deployment build and potentially a larger first download. Actual speed and numerical parity must be measured on real files after publishing. No reduced-quality or fast-audio mode is introduced.

The mastering dialog shows actual engine stages (including optional Rider, V6 restoration and experimental finishing), an indeterminate progress bar and elapsed time, in FR/EN. It closes on completion or reported failure. It does not estimate a percentage or remaining time. Worker-side render duration is logged in the browser console as `PAXLAB DSP + transfer preparation`.

Cloudflare Pages: keep the existing build command that installs .NET 8 and `wasm-tools` before `npm run build`. If the AOT build exceeds Cloudflare's 20-minute build or 25 MiB per-asset limit, explicitly set `PAXLAB_WASM_AOT=0` as a build environment variable to restore the previous interpreted build (the progress dialog remains available). Remove the variable to re-enable AOT. GitHub Actions continues to use Ubuntu 24.04, .NET 8, and its mandatory browser smoke tests. No silent fallback is used.

After publishing, compare the same original and options against the previous Web or Windows export, and record the console duration on the same browser/device. `npm test` also checks progress message dispatch and translation coverage; `scripts/browserSmoke.mjs` verifies the real WASM events and modal in Chromium.

## RC2 - STUDIO UI

Refonte de l’interface de mastering, inspirée de PAXLAB Studio Windows : aucun menu latéral, aucun module SRT, Media Player ou traitement par lot. Une seule waveform pour Original / Rendu PAXLAB / Résidu, réglages à droite et mesures avant/après sous la lecture. Le résidu correspond uniquement au signal réellement retiré de V6 lorsqu’il est disponible et non silencieux. Le bouton est désactivé sinon ; aucune différence globale n’est proposée. La position de lecture est conservée lors des changements de source.

Le volume d’écoute et l’option Volume égal ne modifient que le gain du lecteur. Volume égal atténue le plus fort des deux signaux en utilisant les LUFS intégrés estimés, sans amplification, sans modification du PCM et sans normalisation du résidu. Toutes les options de traitement RC1 PERF1 et les quatre combinaisons d’export WAV/FLAC 16/24 bits sont conservées. Les presets supplémentaires et la préservation de l’espace sont dans les réglages avancés. La modale de progression réelle et l’AOT restent inchangés.

Application du patch RC2 : décompresser par-dessus RC1 PERF1 à la racine du dépôt. Aucun changement de configuration Cloudflare ou GitHub Actions requis.

Validation locale : tests historiques DSP 7/7, export WAV 3/3, parseur WAV 8/8, clés FR/EN, progression et gain d’écoute 10/10. Les sources DSP, le worker, le projet .NET et le script AOT restent identiques à RC1 PERF1. Le build complet avec React/Vite/.NET et le test Chromium réel restent à exécuter en CI.

English: Windows-inspired mastering-only interface, one waveform with Original / Master / Residual, equal loudness monitoring by attenuation, persistent listening volume, compact controls and before/after metrics. No subtitle, library or batch module. All RC1 PERF1 mastering options, export formats, progress events and AOT settings are preserved. Apply the patch on top of RC1 PERF1; no deployment configuration changes are required.

## RC2.1 - COMPACT UI + RESIDUAL FIX

Patch cumulatif à appliquer sur RC2 STUDIO UI, avec ou sans le précédent Residual Fix. Waveform de 106 px sur ordinateur, commandes et mesures compactées. Trois blocs sous la waveform : Finition B et nivellement R1/R2, Auto Level Rider et options complémentaires. Le Rider reste neutralisé si B ou R1/R2 est actif ; ses préférences sont conservées. Les modes Off/Auto/Forcé et les trois profils restent disponibles. Les détails de détection sont repliés par défaut. Export WAV/FLAC et nom du fichier accessibles sans défilement dans la disposition de bureau standard ; les détails dépliés et petits écrans peuvent défiler.

Les algorithmes DSP, la compilation AOT et les paramètres de mastering restent identiques. Le correctif Résidu modifie uniquement la disponibilité du signal d’écoute dans Program.cs et l’interface. Aucun changement de configuration GitHub/Cloudflare.

English: compact single-waveform workspace, three processing groups, accessible export, and disabled Residual unless the engine reports a non-silent removed signal. No mastering algorithm changes.
