"""Local CPU speech worker for OMP Bridge."""
import json
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VOICES = {"no": "no_NO-talesyntese-medium", "en": "en_US-lessac-medium"}
MODELS = ROOT / "models"


def install():
    from huggingface_hub import hf_hub_download, snapshot_download

    snapshot_download("Systran/faster-whisper-small", revision="536b0662742c02347bc0e980a01041f333bce120",
                      local_dir=MODELS / "whisper-small",
                      allow_patterns=["config.json", "model.bin", "tokenizer.json", "vocabulary.*"])
    folders = {
        "no": "no/no_NO/talesyntese/medium",
        "en": "en/en_US/lessac/medium",
    }
    for lang, name in VOICES.items():
        for filename in (name + ".onnx", name + ".onnx.json", "MODEL_CARD"):
            hf_hub_download("rhasspy/piper-voices", filename=f"{folders[lang]}/{filename}",
                            revision="009c8f461676f543c9cad93abd10e81d552bee75",
                            local_dir=MODELS / "piper")
    config = {"stt": {"id": "whisper-small"}, "tts": {"id": "piper-bilingual"}}
    (ROOT / "voice-config.json").write_text(json.dumps(config), encoding="utf-8")


class Voice:
    def __init__(self):
        self.whisper = None
        self.piper = {}

    def run(self, request):
        lang = "en" if request.get("language") == "en" else "no"
        if request["command"] == "stt":
            from faster_whisper import WhisperModel

            if self.whisper is None:
                self.whisper = WhisperModel(str(MODELS / "whisper-small"), device="cpu", compute_type="int8")
            segments, info = self.whisper.transcribe(request["wav"], language=lang, beam_size=3, vad_filter=True)
            return {"text": " ".join(segment.text.strip() for segment in segments).strip(), "duration": info.duration}
        if request["command"] == "tts":
            from piper import PiperVoice

            if lang not in self.piper:
                model = next((MODELS / "piper").rglob(VOICES[lang] + ".onnx"))
                self.piper[lang] = PiperVoice.load(model)
            with wave.open(request["out"], "wb") as output:
                self.piper[lang].synthesize_wav(request["text"], output)
            return {}
        raise ValueError("Unknown voice command")


if __name__ == "__main__":
    if sys.argv[1:] == ["install"]:
        install()
    elif sys.argv[1:] == ["serve"]:
        voice = Voice()
        for line in sys.stdin:
            try:
                reply = {"ok": True, **voice.run(json.loads(line))}
            except Exception as error:
                reply = {"ok": False, "error": str(error)}
            print(json.dumps(reply), flush=True)
