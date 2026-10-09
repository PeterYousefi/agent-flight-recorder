"""Create a local-only named-volume overlay for Docker Desktop file sharing."""
import base64
import json
import ipaddress
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
commands = ['mkdir -p /config/grafana/datasources /config/grafana/dashboards']
sources = {
    'tempo.yaml': 'infra/azure/vm/tempo.yaml',
    'otel.yaml': 'infra/azure/vm/otel.yaml',
    'prometheus.yaml': 'infra/azure/vm/prometheus.yaml',
    'grafana/datasources/datasources.yaml': 'infra/local/grafana/datasources/datasources.yaml',
    'grafana/dashboards/dashboards.yaml': 'infra/local/grafana/dashboards/dashboards.yaml',
    'grafana/operations.json': 'infra/local/grafana/dashboards/operations.json',
}
for destination, source in sources.items():
    content = (root / source).read_text().replace('/var/lib/grafana/dashboards', '/etc/afr/grafana')
    encoded = base64.b64encode(content.encode()).decode()
    commands.append(f"echo '{encoded}' | base64 -d > /config/{destination}")
commands.append('chmod -R a+rX /config')
init = {'image': 'alpine:3.21', 'volumes': ['vm_configs:/config'], 'command': ['sh', '-c', '\n'.join(commands)]}
text = 'services:\n  vm-config-init: ' + json.dumps(init) + '\n'
if len(sys.argv) > 1:
    address = str(ipaddress.IPv4Address(sys.argv[1]))
    text += f'  app:\n    extra_hosts: ["otel-collector:{address}"]\n'
services = {
    'tempo': {'command': ['-config.file=/etc/afr/tempo.yaml'], 'volumes': ['vm_configs:/etc/afr:ro', 'tempo_data:/var/tempo']},
    'otel-collector': {'command': ['--config=/etc/afr/otel.yaml'], 'volumes': ['vm_configs:/etc/afr:ro']},
    'prometheus': {'command': ['--config.file=/etc/afr/prometheus.yaml', '--storage.tsdb.retention.time=6h', '--storage.tsdb.retention.size=128MB', '--web.external-url=https://localhost/prometheus/', '--web.route-prefix=/'], 'volumes': ['vm_configs:/etc/afr:ro', 'prometheus_data:/prometheus']},
    'grafana': {'environment': {'GF_PATHS_PROVISIONING': '/etc/afr/grafana'}, 'volumes': ['vm_configs:/etc/afr:ro', 'grafana_data:/var/lib/grafana']},
}
for service, config in services.items():
    text += f'  {service}:\n'
    text += '    depends_on:\n      vm-config-init: { condition: service_completed_successfully }\n'
    for key, value in config.items():
        tag = ' !override' if key in ('command', 'volumes') else ''
        text += f'    {key}:{tag} {json.dumps(value)}\n'
text += 'volumes:\n  vm_configs:\n'
Path('/private/tmp/afr-vm-named-config.yaml').write_text(text)
