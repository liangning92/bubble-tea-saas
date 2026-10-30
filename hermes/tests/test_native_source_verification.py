"""Current native verifier, synthetic checkout only; never reads an owner SDK home."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import source_verification as native

class NativeSourceVerificationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.source=Path(self.temp.name)/'source';self.source.mkdir()
        self.env={'PATH':'/usr/bin:/bin','GIT_CONFIG_GLOBAL':os.devnull,'GIT_CONFIG_NOSYSTEM':'1','GIT_TERMINAL_PROMPT':'0'}
        self.git('init','-q');(self.source/'module.py').write_text('VALUE = 1\n');(self.source/'.gitignore').write_text('*.ignored\n')
        self.git('add','.');self.git('-c','user.name=Synthetic','-c','user.email=test@example.invalid','-c','commit.gpgsign=false','commit','-qm','fixture')
        self.sha=self.git('rev-parse','HEAD').strip()
    def tearDown(self):self.temp.cleanup()
    def git(self,*args):return subprocess.check_output(['/usr/bin/git','-C',str(self.source),*args],env=self.env,text=True,stderr=subprocess.DEVNULL)
    def verify(self):return native.verify_source_tree(self.source,expected_commit=self.sha)
    def test_clean_checkout_and_exact_per_process_safe_directory(self):
        original=subprocess.check_output;calls=[]
        def run(argv,**kwargs):calls.append(argv);return original(argv,**kwargs)
        with patch.object(native.subprocess,'check_output',side_effect=run):self.assertEqual(self.verify(),self.sha)
        self.assertTrue(calls)
        for argv in calls:self.assertIn('safe.directory='+str(self.source),argv);self.assertNotIn('safe.directory=*',argv)
    def test_index_flags_cannot_hide_changed_source(self):
        self.git('update-index','--assume-unchanged','module.py');(self.source/'module.py').write_text('VALUE = 99\n')
        with self.assertRaises(native.Blocked):self.verify()
    def test_ignored_import_shadow_rejected(self):
        (self.source/'shadow.ignored').write_text('untrusted')
        with self.assertRaises(native.Blocked):self.verify()
    def test_symlink_checkout_rejected(self):
        link=Path(self.temp.name)/'link';link.symlink_to(self.source,target_is_directory=True)
        with self.assertRaises(native.Blocked):native.verify_source_tree(link,expected_commit=self.sha)

if __name__=='__main__':unittest.main()
