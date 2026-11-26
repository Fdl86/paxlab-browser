# PAXLAB Web 3.3 - Mastering Edition RC1

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
