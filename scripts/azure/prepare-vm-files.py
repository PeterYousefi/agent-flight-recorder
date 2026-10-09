"""Private deployment parameters; never print or commit generated credentials."""
from datetime import date
import ipaddress
import json
import os
from pathlib import Path
import secrets
import sys
from urllib.request import urlopen


def save(path: str, content: str) -> None:
    target = Path(path)
    target.touch(mode=0o600, exist_ok=True)
    target.chmod(0o600)
    target.write_text(content)


if sys.argv[1] == 'parameters':
    address = str(ipaddress.IPv4Address(urlopen('https://api.ipify.org', timeout=15).read().decode().strip()))
    values = {
        'allowAzureDeploy': True,
        'dnsLabel': 'agent-recorder-demo',
        'resourceSuffix': secrets.token_hex(6),
        'sshPublicKey': Path('.env.azure-ssh-key.pub').read_text().strip(),
        'administratorCidr': address + '/32',
        'databasePassword': secrets.token_hex(32),
    }
    save('.env.azure-vm.parameters.json', json.dumps({'parameters': {key: {'value': value} for key, value in values.items()}}))
    start = date.today().replace(day=1)
    budget = {
        'alertEmail': os.environ['BUDGET_ALERT_EMAIL'],
        'projectResourceGroup': os.environ['DEPLOY_GROUP'],
        'managedResourceGroup': os.environ['DEPLOY_GROUP'],
        'startDate': start.isoformat(),
        'endDate': start.replace(year=start.year + 1).isoformat(),
    }
    save('.env.azure-vm-budget.json', json.dumps({'parameters': {key: {'value': value} for key, value in budget.items()}}))
elif sys.argv[1] == 'runtime':
    outputs = json.loads(Path('.env.azure-vm.outputs.json').read_text())
    password = json.loads(Path('.env.azure-vm.parameters.json').read_text())['parameters']['databasePassword']['value']
    values = {
        'DEMO_HOST': outputs['publicHost']['value'],
        'DATABASE_URL': f"postgresql://afradmin:{password}@{outputs['databaseHost']['value']}:5432/afr?sslmode=require&sslaccept=strict&connection_limit=3",
        'AZURE_CLIENT_ID': outputs['identityClientId']['value'],
        'AZURE_SERVICE_BUS_NAMESPACE': outputs['serviceBusNamespace']['value'],
        'AZURE_BLOB_ENDPOINT': outputs['blobEndpoint']['value'],
        'GRAFANA_ADMIN_PASSWORD': secrets.token_hex(32),
    }
    save('.env.azure-vm-runtime', '\n'.join(f'{key}={value}' for key, value in values.items()) + '\n')
else:
    raise SystemExit('Expected parameters or runtime')
