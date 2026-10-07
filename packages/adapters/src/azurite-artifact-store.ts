import { createHash, randomUUID } from 'node:crypto'
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'
import {
  createArtifactMetadata,
  createArtifactReference,
  isJsonValue,
  type ArtifactStore,
  type Artifact,
  type ArtifactReference,
  type ArtifactMetadata,
  type PutArtifactInput,
} from '@afr/domain'
import { AdapterError } from './errors.js'

export class AzuriteArtifactStore implements ArtifactStore {
  private readonly container: ContainerClient
  public constructor(
    connectionString: string,
    containerName = 'execution-artifacts',
    private readonly maxSizeBytes = 1048576,
  ) {
    if (!Number.isSafeInteger(maxSizeBytes) || maxSizeBytes < 1 || maxSizeBytes > 10485760)
      throw new AdapterError('INVALID', 'Invalid artifact size limit')
    const client = BlobServiceClient.fromConnectionString(connectionString, {
      retryOptions: { maxTries: 3, tryTimeoutInMs: 10000 },
    })
    const endpoint = new URL(client.url)
    if (
      endpoint.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', 'azurite'].includes(endpoint.hostname)
    )
      throw new AdapterError('INVALID', 'This runtime requires local Azurite')
    this.container = client.getContainerClient(containerName)
  }
  public async initialize(): Promise<void> {
    // No access option: the container is private. Existing public containers are
    // rejected rather than silently trusting prior configuration.
    await this.container.createIfNotExists()
    const properties = await this.container.getProperties()
    if (properties.blobPublicAccess !== undefined)
      throw new AdapterError('INVALID', 'Artifact container must be private')
  }
  public async healthCheck(): Promise<boolean> {
    try {
      const properties = await this.container.getProperties({
        abortSignal: AbortSignal.timeout(5000),
      })
      return properties.blobPublicAccess === undefined
    } catch {
      return false
    }
  }
  public async put(input: PutArtifactInput): Promise<ArtifactReference> {
    if (!isJsonValue(input.content) || input.contentType !== 'application/json')
      throw new AdapterError('INVALID', 'Artifact must contain JSON')
    const bytes = Buffer.from(JSON.stringify(input.content), 'utf8')
    if (bytes.length > this.maxSizeBytes)
      throw new AdapterError('TOO_LARGE', 'Artifact exceeds size limit')
    const checksum = createHash('sha256').update(bytes).digest('hex')
    if (input.checksum !== undefined && input.checksum !== checksum)
      throw new AdapterError('CHECKSUM_MISMATCH', 'Artifact checksum does not match')
    const reference = createArtifactReference({
      artifactId: randomUUID(),
      executionId: input.executionId,
      kind: input.kind,
    })
    const createdAt = new Date().toISOString()
    await this.container.getBlockBlobClient(reference.artifactId).uploadData(bytes, {
      conditions: { ifNoneMatch: '*' },
      blobHTTPHeaders: { blobContentType: input.contentType },
      metadata: {
        executionid: input.executionId,
        kind: input.kind,
        checksum,
        createdat: createdAt,
      },
    })
    return reference
  }
  public async metadata(reference: ArtifactReference): Promise<ArtifactMetadata> {
    this.validate(reference)
    try {
      const properties = await this.container.getBlobClient(reference.artifactId).getProperties()
      const metadata = properties.metadata
      if (metadata?.executionid !== reference.executionId || metadata.kind !== reference.kind)
        throw new AdapterError('NOT_FOUND', 'Artifact was not found')
      if (properties.contentLength === undefined || properties.contentLength > this.maxSizeBytes)
        throw new AdapterError('TOO_LARGE', 'Artifact exceeds size limit')
      return createArtifactMetadata({
        ...reference,
        contentType: properties.contentType ?? 'application/json',
        sizeBytes: properties.contentLength,
        checksum: metadata.checksum ?? '',
        createdAt: metadata.createdat ?? '',
      })
    } catch (error) {
      if (error instanceof AdapterError) throw error
      if (
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        error.statusCode === 404
      )
        throw new AdapterError('NOT_FOUND', 'Artifact was not found')
      throw new AdapterError('UNAVAILABLE', 'Artifact storage is unavailable')
    }
  }
  public async get(reference: ArtifactReference): Promise<Artifact> {
    const metadata = await this.metadata(reference)
    const bytes = await this.container
      .getBlobClient(reference.artifactId)
      .downloadToBuffer(0, metadata.sizeBytes, { abortSignal: AbortSignal.timeout(10000) })
    if (createHash('sha256').update(bytes).digest('hex') !== metadata.checksum)
      throw new AdapterError('CHECKSUM_MISMATCH', 'Artifact checksum does not match')
    const content: unknown = JSON.parse(bytes.toString('utf8'))
    if (!isJsonValue(content)) throw new AdapterError('INVALID', 'Artifact content is invalid')
    return { ...metadata, content }
  }
  public async delete(reference: ArtifactReference): Promise<void> {
    await this.metadata(reference)
    await this.container.getBlobClient(reference.artifactId).delete()
  }
  private validate(reference: ArtifactReference): void {
    createArtifactReference(reference)
    if (!/^[a-f0-9-]{36}$/i.test(reference.artifactId))
      throw new AdapterError('NOT_FOUND', 'Artifact was not found')
  }
}
