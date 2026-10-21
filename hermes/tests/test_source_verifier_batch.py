"""Raw batch framing tests; real Git/checkout guards live in launcher tests."""
import hashlib
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pdca_launcher import _VerifiedGitObjectBatch
from pdca_bridge import Blocked


class FakeProcess:
    def __init__(self, wire, code=0):
        self.stdin, self.stdout = io.BytesIO(), io.BytesIO(wire)
        self.killed, self.waited, self.code = False, False, code
    def kill(self): self.killed = True
    def wait(self, timeout): self.waited = True; return self.code


class BatchProtocolTests(unittest.TestCase):
    def setUp(self):
        self.body = b'raw object bytes\n'
        self.oid = hashlib.sha1(b'blob ' + str(len(self.body)).encode() + b'\0' + self.body).hexdigest()
        self.header = self.oid.encode() + b' blob ' + str(len(self.body)).encode() + b'\n'

    def read(self, wire, kind='blob', oid=None, code=0):
        process = FakeProcess(wire, code)
        with patch('pdca_launcher.subprocess.Popen', return_value=process) as spawn:
            with _VerifiedGitObjectBatch(['/usr/bin/git', '--no-replace-objects'], {'GIT_NO_REPLACE_OBJECTS':'1'}) as objects:
                result = objects.read(kind, oid or self.oid)
        self.assertTrue(process.waited)
        self.assertTrue(process.stdin.closed and process.stdout.closed)
        self.assertEqual(spawn.call_args.args[0], ['/usr/bin/git', '--no-replace-objects', 'cat-file', '--batch'])
        self.assertEqual(spawn.call_args.kwargs['env'], {'GIT_NO_REPLACE_OBJECTS':'1'})
        return result

    def test_exact_raw_object_is_accepted_and_process_reaped(self):
        self.assertEqual(self.read(self.header + self.body + b'\n'), self.body)

    def test_wrong_oid_type_size_or_missing_response_is_rejected(self):
        cases = [b'0'*40 + self.header[40:] + self.body + b'\n',
                 self.header.replace(b' blob ', b' tree ') + self.body + b'\n',
                 self.header.replace(str(len(self.body)).encode(), b'-1') + self.body + b'\n',
                 self.oid.encode() + b' missing\n', b'']
        for wire in cases:
            with self.subTest(wire=wire[:60]), self.assertRaises(Blocked): self.read(wire)

    def test_truncation_bad_trailer_and_hash_change_are_rejected(self):
        for wire in [self.header+self.body[:-1], self.header+self.body+b'X', self.header+b'X'+self.body[1:]+b'\n']:
            with self.subTest(wire=wire[:60]), self.assertRaises(Blocked): self.read(wire)

    def test_unrequested_kind_invalid_oid_and_git_failure_are_rejected(self):
        for kwargs in [{'kind':'tag'}, {'oid':'HEAD'}, {'code':1}]:
            with self.subTest(kwargs=kwargs), self.assertRaises(Blocked): self.read(self.header+self.body+b'\n', **kwargs)


if __name__ == '__main__': unittest.main()
