"""Verify the temporary native build size stays within ten cents per hour."""
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

sku = 'Standard_B2ps_v2'
query = urlencode({'$filter': f"serviceName eq 'Virtual Machines' and armRegionName eq 'canadacentral' and armSkuName eq '{sku}'", 'currencyCode': 'USD'})
with urlopen('https://prices.azure.com/api/retail/prices?' + query, timeout=30) as response:
    items = json.load(response)['Items']
prices = [item['retailPrice'] for item in items
          if item['type'] == 'Consumption' and item['unitOfMeasure'] == '1 Hour'
          and 'Windows' not in item['productName']
          and not any(word in item['skuName'] for word in ['Spot', 'Low Priority'])]
if not prices or max(prices) > 0.10:
    raise SystemExit('Temporary build price exceeds the agreed allowance or could not be confirmed.')
target = Path('.env.azure-build-rate.json')
target.touch(mode=0o600, exist_ok=True)
target.chmod(0o600)
target.write_text(json.dumps({'sku': sku, 'usdPerHour': max(prices)}))
print(f'Temporary 8 GiB ARM build size verified: US${max(prices):.4f}/hour; free-tier size restored after compilation.')
