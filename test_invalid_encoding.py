import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from validate import validate


class EncodingTests(unittest.TestCase):
    def test_invalid_utf8_is_a_validation_error(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "WATCHDOG.yml"
            path.write_bytes(b"instructions: \xff\n")
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(validate(str(path)), 1)
            self.assertIn("error:", output.getvalue())
