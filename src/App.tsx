import { useEffect, useState } from "react";
import { decodeAudioFile } from "./audio/decodeAudio";
import type { DecodedAudioInfo, DecodeStatus } from "./audio/types";
import { AudioInfoPanel } from "./components/AudioInfoPanel";
import { UploadPanel } from "./components/UploadPanel";

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [decodeStatus, setDecodeStatus] = useState<DecodeStatus>("idle");
  const [audioInfo, setAudioInfo] = useState<DecodedAudioInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setDecodeStatus("idle");
      setAudioInfo(null);
      setErrorMessage(null);
      return;
    }

    let isCurrentFile = true;

    async function runDecode() {
      setDecodeStatus("loading");
      setAudioInfo(null);
      setErrorMessage(null);

      try {
        const decoded = await decodeAudioFile(selectedFile as File);

        if (!isCurrentFile) {
          return;
        }

        setAudioInfo(decoded);
        setDecodeStatus("success");
      } catch (error) {
        if (!isCurrentFile) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant le décodage audio.";

        setErrorMessage(message);
        setDecodeStatus("error");
      }
    }

    void runDecode();

    return () => {
      isCurrentFile = false;
    };
  }, [selectedFile]);

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="version">PAXLAB Browser Engine - dev01</p>
          <h1>PAXLAB Browser Engine</h1>
          <p className="hero-text">
            Base navigateur locale pour analyser un fichier audio IA, préparer
            plus tard une Preview Master, puis comparer Original / Preview Master
            en A/B.
          </p>
        </div>

        <div className="privacy-card">
          <span>Confidentialité</span>
          <strong>Traitement local</strong>
          <p>
            À cette étape, le fichier est lu depuis ton navigateur. Aucun upload
            serveur, aucune API externe, aucune base de données.
          </p>
        </div>
      </header>

      <div className="layout">
        <UploadPanel
          selectedFile={selectedFile}
          isDecoding={decodeStatus === "loading"}
          onFileSelected={setSelectedFile}
        />

        <AudioInfoPanel
          file={selectedFile}
          status={decodeStatus}
          audioInfo={audioInfo}
          errorMessage={errorMessage}
        />
      </div>

      <section className="panel next-panel">
        <div className="panel-heading">
          <p className="eyebrow">Prochaine étape</p>
          <h2>Moteur Preview Master navigateur</h2>
        </div>

        <p>
          La prochaine brique pourra ajouter un vrai pipeline audio local :
          analyse, waveform, mesures indicatives, traitement prudent des aigus,
          génération d’une Preview Master temporaire, puis comparaison A/B
          transparente.
        </p>

        <p className="honest-note">
          Cette dev01 ne fait pas de mastering final, ne normalise pas encore en
          LUFS officiel, ne propose aucun export et ne prétend pas produire un
          master prêt à distribuer.
        </p>
      </section>
    </main>
  );
}
