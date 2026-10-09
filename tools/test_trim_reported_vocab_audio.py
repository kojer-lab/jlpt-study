"""Safety and real-MP3 smoke tests for reviewed final-vowel trimming."""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parent / "trim-reported-vocab-audio.py"
spec = importlib.util.spec_from_file_location("trim_reported", MODULE_PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class TrimReportedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.original = {n: getattr(mod, n) for n in (
            "ROOT", "BATCH_PATH", "SOURCE_PATH", "MANIFEST_PATH", "REVISIONS_PATH"
        )}
        mod.ROOT = self.root
        mod.BATCH_PATH = self.root / "audio/vocab/trim-batch.json"
        mod.SOURCE_PATH = self.root / "audio/vocab/source.json"
        mod.MANIFEST_PATH = self.root / "audio/vocab/manifest.json"
        mod.REVISIONS_PATH = self.root / "audio/vocab/repaired-revisions.json"
        mod.BATCH_PATH.parent.mkdir(parents=True)
        self.rel = "audio/vocab/test123-ex1.mp3"
        self.path = self.root / self.rel
        self.path.write_bytes(b"0" * 4000)
        self.write(mod.SOURCE_PATH, {"items": [{"id": "test123", "kind": "example", "index": 0, "path": self.rel}]})
        self.write(mod.MANIFEST_PATH, {"files": {"test123": {"word": None, "examples": [self.rel]}}})
        self.write(mod.REVISIONS_PATH, {"version": 1, "files": {}})
        self.entry = {
            "word_id": "test123", "kind": "example", "index": 0,
            "error_type": "문장 끝에 이상한 소리", "reviewed": True,
            "report_ids": [5], "remove_tail_ms": 220,
        }

    def tearDown(self):
        for n, value in self.original.items():
            setattr(mod, n, value)
        self.temp.cleanup()

    @staticmethod
    def write(path, data):
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def queue(self, items):
        self.write(mod.BATCH_PATH, {"version": 1, "batch_id": "trim-review-01", "items": items})

    def test_empty_batch_is_noop(self):
        self.queue([])
        self.assertEqual(mod.check_batch(), [])

    def test_valid_reported_target(self):
        self.queue([self.entry])
        self.assertEqual(mod.check_batch()[0]["relative"], self.rel)

    def test_wrong_error_category_rejected(self):
        self.queue([dict(self.entry, error_type="발음·억양이 부자연스러움")])
        with self.assertRaisesRegex(ValueError, "Only reviewed"):
            mod.check_batch()

    def test_unreviewed_cut_rejected(self):
        self.queue([dict(self.entry, reviewed=False)])
        with self.assertRaisesRegex(ValueError, "Only reviewed"):
            mod.check_batch()

    def test_missing_report_rejected(self):
        self.queue([dict(self.entry, report_ids=[])])
        with self.assertRaisesRegex(ValueError, "report ID"):
            mod.check_batch()

    def test_unsafe_cut_rejected(self):
        self.queue([dict(self.entry, remove_tail_ms=1500)])
        with self.assertRaisesRegex(ValueError, "50..800"):
            mod.check_batch()

    def test_duplicate_rejected(self):
        self.queue([self.entry, self.entry])
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            mod.check_batch()

    def test_manifest_mismatch_rejected(self):
        self.queue([self.entry])
        self.write(mod.MANIFEST_PATH, {"files": {"test123": {"examples": ["audio/vocab/other-ex1.mp3"]}}})
        with self.assertRaisesRegex(ValueError, "path mismatch"):
            mod.check_batch()

    def test_end_sound_trim_mp3_smoke(self):
        self.queue([self.entry])
        subprocess.run([
            "ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-f", "lavfi",
            "-i", "sine=frequency=440:duration=2.25", "-codec:a", "libmp3lame",
            "-ar", "24000", "-ac", "1", "-b:a", "48k", str(self.path),
        ], check=True)
        original = self.path.read_bytes()
        before = mod.probe_mp3(self.path)
        mod.apply_trim(mod.check_batch())
        after = mod.probe_mp3(self.path)
        self.assertLess(after, before)
        self.assertGreater(before - after, 0.02)
        self.assertNotEqual(original, self.path.read_bytes())
        new_rev = mod.load_json(mod.REVISIONS_PATH)
        self.assertIn(self.rel, new_rev["files"])

    def test_trim_uses_speech_end_not_encoded_trailing_silence(self):
        """A/B preview trims the actual last spoken sound, not the MP3 footer."""
        self.queue([self.entry])
        subprocess.run([
            "ffmpeg", "-nostdin", "-y", "-loglevel", "error",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=1.40",
            "-af", "apad=pad_dur=0.70", "-codec:a", "libmp3lame",
            "-ar", "24000", "-ac", "1", "-b:a", "48k", str(self.path)
        ], check=True)
        original = self.path.read_bytes()
        original_duration = mod.probe_mp3(self.path)
        speech_end = mod.speech_end_seconds(self.path)
        self.assertGreater(original_duration, speech_end + 0.55)
        self.assertAlmostEqual(speech_end, 1.4, delta=0.05)
        mod.apply_trim(mod.check_batch())
        new_duration = mod.probe_mp3(self.path)
        expected = speech_end - 0.220 + 0.025 + 0.120
        self.assertAlmostEqual(new_duration, expected, delta=0.16)
        self.assertLess(new_duration, original_duration - 0.45)
        self.assertNotEqual(original, self.path.read_bytes())

    def test_protect_short_clip(self):
        self.queue([dict(self.entry, remove_tail_ms=700)])
        subprocess.run([
            "ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-f", "lavfi",
            "-i", "sine=frequency=440:duration=0.9", "-codec:a", "libmp3lame",
            "-ar", "24000", "-ac", "1", "-b:a", "48k", str(self.path),
        ], check=True)
        original = self.path.read_bytes()
        with self.assertRaisesRegex(ValueError, "Cut would remove too much"):
            mod.apply_trim(mod.check_batch())
        self.assertEqual(original, self.path.read_bytes())


if __name__ == "__main__":
    unittest.main()
