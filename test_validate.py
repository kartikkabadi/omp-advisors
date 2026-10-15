"""Exercise roster validation through real YAML files."""

import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from validate import validate


class OptionalFieldTests(unittest.TestCase):
    def check_roster(self, fields):
        text = (
            "instructions: Review changes\nadvisors:\n"
            "  - name: Reviewer\n    instructions: Check bugs\n" + fields
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "WATCHDOG.yml"
            path.write_text(text, encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()) as output:
                result = validate(str(path))
        return result, output.getvalue()

    def test_explicit_null_is_not_an_omitted_field(self):
        for field in ("enabled", "tools"):
            with self.subTest(field=field):
                result, output = self.check_roster(f"    {field}: null\n")
                self.assertEqual(result, 1)
                self.assertIn(f"`{field}`", output)

    def test_omitted_fields_keep_their_defaults(self):
        self.assertEqual(self.check_roster("")[0], 0)

    def test_false_and_empty_tools_are_valid(self):
        self.assertEqual(self.check_roster("    enabled: false\n    tools: []\n")[0], 0)


if __name__ == "__main__":
    unittest.main()
