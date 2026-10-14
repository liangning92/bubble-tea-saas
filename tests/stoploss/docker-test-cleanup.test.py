import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cleanup', Path(__file__).parents[2] / 'scripts/with-docker-test.py')
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)
RUN = 'bt-test-0123456789ab'


class CleanupSafety(unittest.TestCase):
    def run_cleanup(self, containers, volumes=(), networks=(), images=()):
        calls = []

        def docker(*args):
            calls.append(args)
            if args[:2] == ('ps', '-aq'):
                return ' '.join(c['Id'] for c in containers)
            if len(args) > 1 and args[1] == 'inspect':
                objects = {'container': containers, 'volume': volumes, 'network': networks, 'image': images}[args[0]]
                return json.dumps([o for o in objects if o.get('Id', o.get('Name')) in args[2:]])
            if len(args) > 1 and args[1] == 'ls':
                objects = {'volume': volumes, 'network': networks, 'image': images}[args[0]]
                return ' '.join(o.get('Id', o.get('Name')) for o in objects)
            return ''

        with patch.object(cleanup, 'docker', docker), patch.object(cleanup.subprocess, 'run') as builder:
            builder.return_value.returncode = 1
            cleanup.cleanup(RUN)
        return calls

    def container(self, name, label=RUN, image='image1'):
        return {'Name': '/' + name, 'Id': name, 'Image': image, 'Mounts': [],
                'Config': {'Labels': {cleanup.LABEL: label} if label else None}}

    def test_only_current_batch_is_removed(self):
        calls = self.run_cleanup([self.container(RUN + '-check'),
                                  self.container('other-test', 'other'),
                                  self.container('bubble-tea-api', None)])
        removed = [c[-1] for c in calls if c[:2] == ('container', 'rm')]
        self.assertEqual(removed, [RUN + '-check'])

    def test_production_name_with_wrong_label_is_refused(self):
        with self.assertRaisesRegex(RuntimeError, 'refused container bubble-tea-api'):
            self.run_cleanup([self.container('bubble-tea-api')])

    def test_owned_volumes_and_networks_only(self):
        volume = {'Name': RUN + '-data', 'Labels': {cleanup.LABEL: RUN}}
        network = {'Name': RUN + '-net', 'Labels': {cleanup.LABEL: RUN}}
        calls = self.run_cleanup([], [volume], [network])
        self.assertIn(('volume', 'rm', volume['Name']), calls)
        self.assertIn(('network', 'rm', network['Name']), calls)

    def test_bad_name_cannot_delete_formal_volume(self):
        with self.assertRaisesRegex(RuntimeError, 'refused volume'):
            self.run_cleanup([], [{'Name': 'bubble-tea-saas_postgres_data', 'Labels': {cleanup.LABEL: RUN}}])

    def test_referenced_image_is_preserved(self):
        image = {'Id': 'image1', 'RepoTags': [RUN + ':check'], 'Config': {'Labels': {cleanup.LABEL: RUN}}}
        calls = self.run_cleanup([self.container('other-test', 'other')], images=[image])
        self.assertFalse(any(c[:2] == ('image', 'rm') for c in calls))

    def test_unshared_labelled_image_is_removed(self):
        image = {'Id': 'image2', 'RepoTags': [RUN + ':check'], 'Config': {'Labels': {cleanup.LABEL: RUN}}}
        calls = self.run_cleanup([], images=[image])
        self.assertIn(('image', 'rm', RUN + ':check'), calls)

    def test_shared_tag_is_refused(self):
        image = {'Id': 'image2', 'RepoTags': [RUN + ':check', 'production:latest'], 'Config': {'Labels': {cleanup.LABEL: RUN}}}
        with self.assertRaisesRegex(RuntimeError, 'refused shared image'):
            self.run_cleanup([], images=[image])


if __name__ == '__main__':
    unittest.main()
