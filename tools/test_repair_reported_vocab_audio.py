"""Offline safety tests for the reviewed pronunciation batch parser."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parent / "repair-reported-vocab-audio.py"
spec = importlib.util.spec_from_file_location("repair_reported_audio", MODULE_PATH)
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


class ReviewedBatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.originals = {name: getattr(batch, name) for name in (
            "ROOT", "BATCH_PATH", "SOURCE_PATH", "MANIFEST_PATH", "REVISIONS_PATH"
        )}
        batch.ROOT = self.root
        batch.BATCH_PATH = self.root / "audio/vocab/repair-batch.json"
        batch.SOURCE_PATH = self.root / "audio/vocab/source.json"
        batch.MANIFEST_PATH = self.root / "audio/vocab/manifest.json"
        batch.REVISIONS_PATH = self.root / "audio/vocab/repaired-revisions.json"
        batch.BATCH_PATH.parent.mkdir(parents=True)
        word = "audio/vocab/test123-word.mp3"
        example = "audio/vocab/test123-ex1.mp3"
        self._write(batch.SOURCE_PATH, {"items": [
            {"id": "test123", "kind": "word", "index": None, "path": word},
            {"id": "test123", "kind": "example", "index": 0, "path": example},
        ]})
        self._write(batch.MANIFEST_PATH, {"files": {
            "test123": {"word": word, "examples": [example]}
        }})
        self._write(batch.REVISIONS_PATH, {"version": 1, "files": {}})
        for p in (word, example):
            target = self.root / p
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"\x01" * 1600)
        self.word = {
            "word_id": "test123", "kind": "word", "index": None,
            "spoken_text": "ことば", "report_ids": [1],
        }
        self.example = {
            "word_id": "test123", "kind": "example", "index": 0,
            "spoken_text": "てつづきがとどこおっている", "report_ids": [2],
        }

    def tearDown(self):
        for k, v in self.originals.items():
            setattr(batch, k, v)
        self.temp.cleanup()

    @staticmethod
    def _write(path, obj):
        path.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")

    def queue(self, entries):
        self._write(batch.BATCH_PATH, {
            "version": 1, "batch_id": "reviewed-batch-001", "items": entries
        })

    def test_empty_batch_skips_model(self):
        self.queue([])
        self.assertEqual(batch.check_batch(), [])

    def test_valid_word_and_example(self):
        self.queue([self.word, self.example])
        targets = batch.check_batch()
        self.assertEqual(len(targets), 2)
        self.assertEqual(targets[1]["relative"], "audio/vocab/test123-ex1.mp3")

    def test_duplicate_target_rejected(self):
        self.queue([self.word, dict(self.word, report_ids=[3])])
        with self.assertRaisesRegex(ValueError, "Duplicate target"):
            batch.check_batch()

    def test_out_of_range_example_rejected(self):
        self.queue([dict(self.example, index=11)])
        with self.assertRaisesRegex(ValueError, "index"):
            batch.check_batch()

    def test_wrong_manifest_path_rejected(self):
        self.queue([self.word])
        self._write(batch.MANIFEST_PATH, {"files": {
            "test123": {"word": "audio/vocab/other-word.mp3", "examples": []}
        }})
        with self.assertRaisesRegex(ValueError, "mismatch"):
            batch.check_batch()

    def test_control_characters_rejected(self):
        self.queue([dict(self.word, spoken_text="ことば\n別の行")])
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            batch.check_batch()

    def test_more_than_twenty_rejected(self):
        self.queue([self.word] * 21)
        with self.assertRaisesRegex(ValueError, "at most 20"):
            batch.check_batch()

    def test_missing_reviewed_pronunciation_rejected(self):
        self.queue([dict(self.word, spoken_text="")])
        with self.assertRaisesRegex(ValueError, "mandatory"):
            batch.check_batch()


if __name__ == "__main__":
    unittest.main()
