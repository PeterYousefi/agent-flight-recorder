targetScope = 'subscription'
param alertEmail string
param projectResourceGroup string
param managedResourceGroup string
param startDate string
param endDate string
resource budget 'Microsoft.Consumption/budgets@2024-08-01' = {
  name: 'afr-five-dollar-alert'
  properties: {
    category: 'Cost'
    amount: 5
    timeGrain: 'Monthly'
    timePeriod: { startDate: startDate, endDate: endDate }
    filter: { dimensions: { name: 'ResourceGroupName', operator: 'In', values: projectResourceGroup == managedResourceGroup ? [projectResourceGroup] : [projectResourceGroup, managedResourceGroup] } }
    notifications: {
      eightyPercent: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 80, thresholdType: 'Actual', contactEmails: [alertEmail] }
      fiveDollars: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 100, thresholdType: 'Actual', contactEmails: [alertEmail] }
    }
  }
}
