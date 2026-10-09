"""Run against a healthy `docker compose up -d --build --wait` deployment."""
import json
import os
import subprocess
import tempfile
from pathlib import Path
import unittest
import urllib.request


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


class DockerDeploymentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = os.environ.get('HTTP_PORT', '8080')
        cls.host_port = os.environ.get('HOST_PORT', '8080')
        cls.network = os.environ.get('DOCKER_NETWORK', 'simple-bar-backend')
        container_id = run('docker', 'compose', 'ps', '-q', 'site').strip()
        cls.container = json.loads(run('docker', 'inspect', container_id))[0]

    def test_host_port_is_published_only_on_loopback(self):
        expected = {f'{self.port}/tcp': [{'HostIp': '127.0.0.1', 'HostPort': self.host_port}]}
        self.assertEqual(self.container['HostConfig']['PortBindings'], expected)
        published = {port: bindings for port, bindings in self.container['NetworkSettings']['Ports'].items() if bindings}
        self.assertEqual(published, expected)
        network = json.loads(run('docker', 'network', 'inspect', self.network))[0]
        self.assertEqual(network['Driver'], 'bridge')
        self.assertFalse(network['Internal'])
        self.assertEqual(set(self.container['NetworkSettings']['Networks']), {self.network})

    def test_site_and_external_config_are_accessible_from_host(self):
        # Bypass proxy environment variables: this request must reach the local Docker port.
        client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        base = f'http://127.0.0.1:{self.host_port}'
        with client.open(base + '/', timeout=5) as response:
            self.assertIn('Simple-Bar-Calculator', response.read().decode())
        with client.open(base + '/config.json', timeout=5) as response:
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            menu = json.load(response)
        self.assertEqual(menu, json.loads(self.fetch()))

    def test_process_runs_without_root_or_privileges(self):
        host = self.container['HostConfig']
        self.assertTrue(host['ReadonlyRootfs'])
        self.assertIn('ALL', host['CapDrop'])
        self.assertIn('no-new-privileges:true', host['SecurityOpt'])
        self.assertEqual(run('docker', 'compose', 'exec', '-T', 'site', 'id', '-u').strip(), '101')

    def fetch(self, path='/config.json'):
        return run('docker', 'compose', 'exec', '-T', 'site', 'wget', '-q', '-O', '-',
                   f'http://127.0.0.1:{self.port}{path}')

    def test_only_host_mount_is_read_only_menu_directory(self):
        mounts = [m for m in self.container['Mounts'] if m['Type'] == 'bind']
        self.assertEqual(len(mounts), 1)
        self.assertEqual(mounts[0]['Destination'], '/etc/simple-bar-config')
        self.assertFalse(mounts[0]['RW'])
        self.assertNotIn('seccomp=unconfined', self.container['HostConfig']['SecurityOpt'])

    def test_image_does_not_contain_menu_data(self):
        run('docker', 'run', '--rm', '--network', 'none', '--read-only',
            '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
            '--entrypoint', 'sh', 'simple-bar-calculator:local', '-c',
            'test ! -e /srv/site/config.json && test ! -e /etc/simple-bar-config/config.json')

    def test_root_and_menu_mount_reject_writes(self):
        for directory in ('/srv/site', '/etc/simple-bar-config'):
            result = subprocess.run(
                ['docker', 'compose', 'exec', '-T', 'site', 'sh', '-c',
                 'touch "$1/.write-probe" && { rm "$1/.write-probe"; exit 0; }',
                 'sh', directory], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0, directory)
            self.assertIn('Read-only file system', result.stderr)

    @unittest.skipUnless(os.environ.get('DOCKER_TEST_CONFIG_DIR'),
                         'Host mutation tests require a disposable DOCKER_TEST_CONFIG_DIR')
    def test_atomic_menu_updates_and_mount_isolation(self):
        directory = Path(os.environ['DOCKER_TEST_CONFIG_DIR']).resolve()
        mount = next(m for m in self.container['Mounts']
                     if m['Destination'] == '/etc/simple-bar-config')
        self.assertEqual(directory, Path(mount['Source']).resolve())
        menu = directory / 'config.json'
        original = menu.read_bytes()
        # Only opt-in disposable directories are modified; restore on all outcomes.
        with tempfile.TemporaryDirectory(dir=directory) as temporary:
            staging = Path(temporary) / 'menu.json'
            marker = Path(temporary) / 'private.txt'
            marker.write_text('not public')
            try:
                updated = json.loads(original)
                updated['beverages'][0]['name'] = 'CI updated menu'
                staging.write_text(json.dumps(updated))
                staging.chmod(0o644)
                staging.replace(menu)
                self.assertEqual(json.loads(self.fetch()), updated)
                client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                with client.open(f'http://127.0.0.1:{self.host_port}/config.json', timeout=5) as response:
                    self.assertEqual(json.load(response), updated)
                result = subprocess.run(
                    ['docker', 'compose', 'exec', '-T', 'site', 'wget', '-S', '-O',
                     '/dev/null', f'http://127.0.0.1:{self.port}/{marker.parent.name}/private.txt'],
                    capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('404', result.stderr)
                staging.symlink_to('/srv/site/index.html')
                staging.replace(menu)
                result = subprocess.run(
                    ['docker', 'compose', 'exec', '-T', 'site', 'wget', '-S', '-O',
                     '/dev/null', f'http://127.0.0.1:{self.port}/config.json'],
                    capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('403', result.stderr)
            finally:
                staging.unlink(missing_ok=True)
                staging.write_bytes(original)
                staging.chmod(0o644)
                staging.replace(menu)

    def test_nginx_config_and_access_from_another_container(self):
        run('docker', 'compose', 'exec', '-T', 'site', 'nginx', '-t', '-c', '/tmp/nginx.conf')
        html = run('docker', 'run', '--rm', '--network', self.network,
                   '--entrypoint', 'wget', 'simple-bar-calculator:local',
                   '-q', '-O', '-', f'http://simple-bar-calculator:{self.port}/')
        self.assertIn('Simple-Bar-Calculator', html)

    def test_attribution_assets_are_served(self):
        license_text = self.fetch('/license.txt')
        self.assertIn('Copyright (C) 2026 jjm.one', license_text)
        self.assertIn('GNU LESSER GENERAL PUBLIC LICENSE', license_text)
        self.assertIn('GNU GENERAL PUBLIC LICENSE', license_text)
        self.assertIn('<svg', self.fetch('/jjm-one-logo.svg'))

    def test_config_is_not_cached_and_security_headers_are_present(self):
        result = subprocess.run(
            ['docker', 'compose', 'exec', '-T', 'site', 'wget', '-S', '-O', '/dev/null',
             f'http://127.0.0.1:{self.port}/config.json'],
            check=True, capture_output=True, text=True
        )
        self.assertIn('Cache-Control: no-store', result.stderr)
        self.assertIn('X-Content-Type-Options: nosniff', result.stderr)
        self.assertIn('Content-Security-Policy:', result.stderr)
        self.assertNotIn('Strict-Transport-Security:', result.stderr)

    def test_post_requests_are_rejected(self):
        result = subprocess.run(
            ['docker', 'compose', 'exec', '-T', 'site', 'wget', '-S', '--post-data=x',
             '-O', '/dev/null', f'http://127.0.0.1:{self.port}/'],
            capture_output=True, text=True
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('405', result.stderr)

    def test_javascript_module_has_a_browser_compatible_type(self):
        result = subprocess.run(
            ['docker', 'compose', 'exec', '-T', 'site', 'wget', '-S', '-O', '/dev/null',
             f'http://127.0.0.1:{self.port}/lib/calc.mjs'],
            check=True, capture_output=True, text=True
        )
        self.assertRegex(result.stderr, r'Content-Type: (application|text)/javascript')


if __name__ == '__main__':
    unittest.main()
