import gzip
import hashlib
import json
from pathlib import Path
import struct
import unittest

from scripts.data.atlas_geometry import parse_swc, simplify, select_cells

ROOT = Path(__file__).resolve().parents[2]


class AtlasGeometryTests(unittest.TestCase):
    def test_transform_and_source_radius(self):
        nodes = parse_swc(b"1 1 100 200 300 25 -1\n2 3 200 200 300 50 1\n")
        self.assertEqual(nodes[1][0], (0.8, -2.4, 1.6, 0.2))
        self.assertEqual(nodes[2][0][3], 0.4)

    def test_simplification_preserves_branches_and_radius_changes(self):
        nodes = {
            1: ((0, 0, 0, 1), -1),
            2: ((1, 0, 0, 1), 1),
            3: ((2, 0, 0, 1), 2),
            4: ((3, 1, 0, 1), 3),
            5: ((3, -1, 0, 1), 3),
        }
        segments = simplify(nodes)
        self.assertEqual(len(segments) // 8, 3)
        pairs = [
            (tuple(segments[i : i + 4]), tuple(segments[i + 4 : i + 8]))
            for i in range(0, len(segments), 8)
        ]
        self.assertIn((nodes[1][0], nodes[3][0]), pairs)
        self.assertIn((nodes[3][0], nodes[4][0]), pairs)
        nodes[2] = ((1, 0, 0, 4), 1)
        self.assertEqual(len(simplify(nodes)) // 8, 4)

    def test_curved_chain_preserves_deviation_above_tolerance(self):
        nodes = {1: ((0, 0, 0, 1), -1), 2: ((1, 2, 0, 1), 1), 3: ((2, 0, 0, 1), 2)}
        self.assertEqual(len(simplify(nodes, tolerance=1)) // 8, 2)
        self.assertEqual(len(simplify(nodes, tolerance=3)) // 8, 1)

    def test_rejects_invalid_nodes_and_cycles(self):
        for raw in (b"1 1 nan 0 0 1 -1", b"1 1 0 0 0 -1 -1", b"1 1 0 0 0 1 -1\n1 1 0 0 0 1 -1"):
            with self.assertRaises(ValueError):
                parse_swc(raw)
        with self.assertRaises(ValueError):
            simplify({1: ((0, 0, 0, 1), 2), 2: ((1, 0, 0, 1), 1)})

        with self.assertRaises(ValueError):
            simplify({1: ((0, 0, 0, 1), 2), 2: ((1, 0, 0, 1), 1), 3: ((0, 1, 0, 1), 1)})
        with self.assertRaises(ValueError):
            simplify({1: ((0, 0, 0, 1), 1)})

    def test_selection_is_stable_and_keeps_legacy(self):
        catalog = json.loads((ROOT / "public/malecns/neurons.json").read_text())
        legacy = json.loads((ROOT / "public/malecns/skeletons.json").read_text())
        selected = select_cells(catalog, legacy, 768)
        self.assertEqual(selected, select_cells(list(reversed(catalog)), legacy, 768))
        self.assertEqual(len(selected), 768)
        self.assertTrue({c["bodyId"] for c in legacy}.issubset({str(c[0]) for c in selected}))

    def test_published_chunks_match_hashes_catalog_and_bounds(self):
        directory = ROOT / "public/malecns/atlas-v1"
        manifest = json.loads((directory / "manifest.json").read_text())
        catalog = {
            str(r[0]): r for r in json.loads((ROOT / "public/malecns/neurons.json").read_text())
        }
        seen, total = set(), 0
        for chunk in manifest["chunks"]:
            compressed = (directory / chunk["file"]).read_bytes()
            self.assertEqual(hashlib.sha256(compressed).hexdigest(), chunk["sha256"])
            raw = gzip.decompress(compressed)
            self.assertEqual(len(raw), chunk["decodedByteLength"])
            self.assertEqual(len(raw), chunk["segments"] * 32)
            floats = struct.unpack("<" + "f" * (len(raw) // 4), raw)
            offset = 0
            for cell in chunk["cells"]:
                self.assertNotIn(cell["bodyId"], seen)
                seen.add(cell["bodyId"])
                self.assertEqual(cell["offset"], offset)
                self.assertEqual(cell["type"], catalog[cell["bodyId"]][1])
                self.assertEqual(cell["group"], catalog[cell["bodyId"]][6])
                for field, column in [("cellClass", 3), ("side", 4), ("neurotransmitter", 5)]:
                    self.assertEqual(cell[field], catalog[cell["bodyId"]][column])
                for i in range(offset * 8, (offset + cell["segments"]) * 8, 4):
                    for k in range(3):
                        self.assertGreaterEqual(floats[i + k], cell["bounds"][0][k] - 0.001)
                        self.assertLessEqual(floats[i + k], cell["bounds"][1][k] + 0.001)
                    self.assertGreaterEqual(floats[i + 3], 0)
                offset += cell["segments"]
            self.assertEqual(offset, chunk["segments"])
            total += offset
        self.assertEqual(len(seen), manifest["neuronCount"])
        self.assertEqual(total, manifest["segmentCount"])


if __name__ == "__main__":
    unittest.main()
