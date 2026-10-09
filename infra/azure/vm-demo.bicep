targetScope = 'resourceGroup'
param allowAzureDeploy bool = false
param location string = 'canadacentral'
param dnsLabel string = 'agent-recorder-demo'
param resourceSuffix string = uniqueString(resourceGroup().id)
param sshPublicKey string
param administratorCidr string
@secure()
param databasePassword string
var suffix = resourceSuffix
var tags = { project: 'agent-flight-recorder', purpose: 'public-mock-demo' }

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = if (allowAzureDeploy) {
  name: 'afr-runtime'
  location: location
  tags: tags
}
resource address 'Microsoft.Network/publicIPAddresses@2024-05-01' = if (allowAzureDeploy) {
  name: 'afr-public-ip'
  location: location
  tags: tags
  sku: { name: 'Standard', tier: 'Regional' }
  properties: {
    publicIPAllocationMethod: 'Static'
    publicIPAddressVersion: 'IPv4'
    dnsSettings: { domainNameLabel: dnsLabel }
  }
}
resource security 'Microsoft.Network/networkSecurityGroups@2024-05-01' = if (allowAzureDeploy) {
  name: 'afr-network-security'
  location: location
  tags: tags
  properties: {
    securityRules: [
      { name: 'administrator-ssh', properties: { priority: 100, access: 'Allow', direction: 'Inbound', protocol: 'Tcp', sourceAddressPrefix: administratorCidr, sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '22' } }
      { name: 'public-https', properties: { priority: 110, access: 'Allow', direction: 'Inbound', protocol: 'Tcp', sourceAddressPrefix: 'Internet', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '443' } }
      { name: 'https-certificate-validation', properties: { priority: 120, access: 'Allow', direction: 'Inbound', protocol: 'Tcp', sourceAddressPrefix: 'Internet', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '80' } }
    ]
  }
}
resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = if (allowAzureDeploy) {
  name: 'afr-network'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.43.0.0/24'] }
    subnets: [{ name: 'demo', properties: { addressPrefix: '10.43.0.0/24', defaultOutboundAccess: false, networkSecurityGroup: { id: security!.id } } }]
  }
}
resource interface 'Microsoft.Network/networkInterfaces@2024-05-01' = if (allowAzureDeploy) {
  name: 'afr-network-interface'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [{ name: 'primary', properties: { privateIPAllocationMethod: 'Dynamic', subnet: { id: network!.properties.subnets[0].id }, publicIPAddress: { id: address!.id, properties: { deleteOption: 'Delete' } } } }]
  }
}
resource machine 'Microsoft.Compute/virtualMachines@2024-11-01' = if (allowAzureDeploy) {
  name: 'agent-recorder-demo'
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity!.id}': {} } }
  properties: {
    hardwareProfile: { vmSize: 'Standard_B2pts_v2' }
    storageProfile: {
      imageReference: { publisher: 'Canonical', offer: 'ubuntu-24_04-lts', sku: 'server-arm64', version: 'latest' }
      osDisk: { name: 'afr-system-p6', createOption: 'FromImage', diskSizeGB: 64, deleteOption: 'Delete', managedDisk: { storageAccountType: 'Premium_LRS' } }
    }
    osProfile: {
      computerName: 'agent-recorder-demo'
      adminUsername: 'afradmin'
      linuxConfiguration: { disablePasswordAuthentication: true, ssh: { publicKeys: [{ path: '/home/afradmin/.ssh/authorized_keys', keyData: sshPublicKey }] } }
      customData: base64(loadTextContent('./vm/cloud-init.yaml'))
    }
    networkProfile: { networkInterfaces: [{ id: interface!.id, properties: { primary: true, deleteOption: 'Delete' } }] }
    diagnosticsProfile: { bootDiagnostics: { enabled: false } }
  }
}
resource database 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = if (allowAzureDeploy) {
  name: 'afr-pg-${suffix}'
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    administratorLogin: 'afradmin'
    administratorLoginPassword: databasePassword
    version: '16'
    storage: { storageSizeGB: 32, autoGrow: 'Disabled' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
  }
}
resource appDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = if (allowAzureDeploy) {
  parent: database
  name: 'afr'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}
resource databaseFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = if (allowAzureDeploy) {
  parent: database
  name: 'demo-vm-only'
  properties: { startIpAddress: address!.properties.ipAddress, endIpAddress: address!.properties.ipAddress }
}
resource messaging 'Microsoft.ServiceBus/namespaces@2024-01-01' = if (allowAzureDeploy) {
  name: 'afr-bus-${suffix}'
  location: location
  tags: tags
  sku: { name: 'Basic', tier: 'Basic' }
  properties: { minimumTlsVersion: '1.2', disableLocalAuth: true }
}
resource queue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = if (allowAzureDeploy) {
  parent: messaging
  name: 'executions'
  properties: { lockDuration: 'PT1M', maxDeliveryCount: 10, deadLetteringOnMessageExpiration: true }
}
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = if (allowAzureDeploy) {
  name: 'afrblob${suffix}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: { accessTier: 'Hot', minimumTlsVersion: 'TLS1_2', supportsHttpsTrafficOnly: true, allowBlobPublicAccess: false, allowSharedKeyAccess: false }
}
resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = if (allowAzureDeploy) {
  parent: storage
  name: 'default'
}
resource artifacts 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = if (allowAzureDeploy) {
  parent: blobs
  name: 'execution-artifacts'
  properties: { publicAccess: 'None' }
}
resource busRoles 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for role in ['69a216fc-b8fb-44d8-bc22-1f3c2cd27a39', '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0']: if (allowAzureDeploy) {
  scope: queue
  name: guid(queue!.id, identity!.id, role)
  properties: { principalId: identity!.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', role) }
}]
resource blobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (allowAzureDeploy) {
  scope: artifacts
  name: guid(artifacts!.id, identity!.id, 'blob')
  properties: { principalId: identity!.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe') }
}
output publicHost string = allowAzureDeploy ? address!.properties.dnsSettings.fqdn : ''
output publicIp string = allowAzureDeploy ? address!.properties.ipAddress : ''
output databaseHost string = allowAzureDeploy ? database!.properties.fullyQualifiedDomainName : ''
output identityClientId string = allowAzureDeploy ? identity!.properties.clientId : ''
output serviceBusNamespace string = allowAzureDeploy ? '${messaging!.name}.servicebus.windows.net' : ''
output blobEndpoint string = allowAzureDeploy ? storage!.properties.primaryEndpoints.blob : ''
