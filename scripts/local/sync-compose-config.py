#!/usr/bin/env python3
"""Embed canonical configs in Compose for Docker Desktop without bind mounts."""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[2]
compose = root / 'docker-compose.yml'
text = compose.read_text()
sources = {
    'SBCONFIG': 'infra/local/servicebus-config.json',
    'OTELCONFIG': 'infra/local/otel-collector-config.yaml',
    'PROMCONFIG': 'infra/local/prometheus.yml',
    'TEMPOCONFIG': 'infra/local/tempo.yaml',
    'DSCONFIG': 'infra/local/grafana/datasources/datasources.yaml',
    'DBCONFIG': 'infra/local/grafana/dashboards/dashboards.yaml',
    'DASHBOARD': 'infra/local/grafana/dashboards/operations.json',
}
for delimiter, filename in sources.items():
    source = (root / filename).read_text().rstrip().replace('$', '$$')
    embedded = '\n'.join(('        ' + line if line else '') for line in source.splitlines())
    pattern = rf"(<< '{delimiter}'\n).*?(        {delimiter})"
    text, count = re.subn(pattern, lambda m: m[1] + embedded + '\n' + m[2], text, flags=re.S)
    if count != 1:
        raise RuntimeError(f'Missing or repeated {delimiter} config block')
if '--check' in sys.argv:
    if text != compose.read_text():
        raise SystemExit('Compose config embeds are stale; run scripts/local/sync-compose-config.py')
else:
    compose.write_text(text)
