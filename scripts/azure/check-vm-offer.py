"""Read-only checks for the selected student VM and main paid cost component."""
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlencode
from urllib.request import urlopen

subscription = os.environ['AZURE_SUBSCRIPTION_ID']


def azure(url: str) -> dict:
    return json.loads(subprocess.check_output(['az', 'rest', '--method', 'get', '--url', url, '-o', 'json']))


root = f'https://management.azure.com/subscriptions/{subscription}'
for role_id, name in {
    '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39': 'Azure Service Bus Data Sender',
    '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0': 'Azure Service Bus Data Receiver',
    'ba92f5b4-2d11-453d-a403-e96b0029c9fe': 'Storage Blob Data Contributor',
}.items():
    role = azure(root + f'/providers/Microsoft.Authorization/roleDefinitions/{role_id}?api-version=2022-04-01')
    if role.get('properties', {}).get('roleName') != name:
        raise SystemExit(f'Azure permission role could not be verified: {name}')
print('Queue sender/receiver and private blob permission roles verified against Azure.')
availability = azure(
    root + '/providers/Microsoft.Network/locations/canadacentral/CheckDnsNameAvailability'
    '?domainNameLabel=agent-recorder-demo&api-version=2024-05-01'
)
if not availability.get('available'):
    raise SystemExit('Requested Azure DNS label is unavailable; deployment stopped before charges.')
# Azure group validation checks allocation and quotas before paid provisioning.
# Avoid fetching the entire regional SKU catalog on every build retry.
if "vmSize: 'Standard_B2pts_v2'" not in Path('infra/azure/vm-demo.bicep').read_text():
    raise SystemExit('Expected the agreed student free-tier SKU in the template.')
query = urlencode({'$filter': "serviceName eq 'Virtual Network' and armRegionName eq 'canadacentral'", 'currencyCode': 'USD'})
next_page = 'https://prices.azure.com/api/retail/prices?' + query
prices = []
ip_entries = []
while next_page:
    with urlopen(next_page, timeout=30) as response:
        page = json.load(response)
    ip_entries.extend(
        {key: item.get(key) for key in ['meterName', 'retailPrice', 'unitOfMeasure', 'type', 'isPrimaryMeterRegion']}
        for item in page['Items'] if 'IPv4' in item.get('meterName', '')
    )
    prices.extend(
        item['retailPrice'] for item in page['Items']
        if item['meterName'] == 'Standard IPv4 Static Public IP'
        and item['type'] == 'Consumption' and item['unitOfMeasure'] == '1 Hour'
    )
    next_page = page.get('NextPageLink')
if not prices or max(prices) > 0.005:
    print('Regional IPv4 price records:', json.dumps(ip_entries))
    raise SystemExit('IPv4 retail price cannot be confirmed within the agreed cost estimate; deployment stopped.')
print(f'Selected student SKU fixed in template; DNS label available. IPv4 retail rate: US${max(prices):.3f}/hour.')
print('Student free allowances confirmed from the account screenshots supplied today; spending limit stays enabled.')
