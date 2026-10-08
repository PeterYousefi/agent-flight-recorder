targetScope = 'resourceGroup'

@description('Architectural reference only. Disabled by default; current applications require local emulators.')
param allowAzureDeploy bool = false
param location string = resourceGroup().location
@maxLength(10)
param prefix string = 'afr'
@description('Future cloud-capable API image; no deployable cloud image is supplied.')
param apiImage string
@description('Future cloud-capable worker image; no deployable cloud image is supplied.')
param workerImage string

var suffix = uniqueString(resourceGroup().id)
var commonTags = { project: 'agent-flight-recorder', status: 'reference-only' }

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = if (allowAzureDeploy) {
  name: '${prefix}-environment'
  location: location
  tags: commonTags
  properties: { appLogsConfiguration: { destination: 'none' } }
}
resource apps 'Microsoft.App/containerApps@2024-03-01' = [for service in [{ name: 'api', image: apiImage }, { name: 'worker', image: workerImage }]: if (allowAzureDeploy) {
  name: '${prefix}-${service.name}'
  location: location
  tags: commonTags
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: environment!.id
    configuration: { activeRevisionsMode: 'Single' }
    template: {
      containers: [{ name: service.name, image: service.image, resources: { cpu: json('0.25'), memory: '0.5Gi' } }]
      scale: { minReplicas: 0, maxReplicas: 1 }
    }
  }
}]
resource messaging 'Microsoft.ServiceBus/namespaces@2024-01-01' = if (allowAzureDeploy) {
  name: '${prefix}-bus-${suffix}'
  location: location
  tags: commonTags
  sku: { name: 'Standard', tier: 'Standard' }
  properties: { minimumTlsVersion: '1.2', disableLocalAuth: true }
}
resource queue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = if (allowAzureDeploy) {
  parent: messaging
  name: 'executions'
  properties: { lockDuration: 'PT1M', maxDeliveryCount: 10, deadLetteringOnMessageExpiration: true }
}
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = if (allowAzureDeploy) {
  name: '${prefix}${suffix}'
  location: location
  tags: commonTags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: { minimumTlsVersion: 'TLS1_2', supportsHttpsTrafficOnly: true, allowBlobPublicAccess: false, allowSharedKeyAccess: false }
}
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = if (allowAzureDeploy) {
  parent: storage
  name: 'default'
}
resource artifacts 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = if (allowAzureDeploy) {
  parent: blobService
  name: 'execution-artifacts'
  properties: { publicAccess: 'None' }
}
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = if (allowAzureDeploy) {
  name: '${prefix}-kv-${suffix}'
  location: location
  tags: commonTags
  properties: { tenantId: tenant().tenantId, sku: { family: 'A', name: 'standard' }, enableRbacAuthorization: true, enableSoftDelete: true, softDeleteRetentionInDays: 7, enablePurgeProtection: true, accessPolicies: [] }
}
output deploymentEnabled bool = allowAzureDeploy
output limitations string = 'Reference only: add authentication, cloud adapters, image packaging, PostgreSQL networking, scoped identity roles, Key Vault secret references, telemetry and budgets before any deployment.'
