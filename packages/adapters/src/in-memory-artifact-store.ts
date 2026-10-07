import { createHash, randomUUID } from 'node:crypto'
import {
  createArtifactReference,
  createArtifactMetadata,
  isJsonValue,
  type ArtifactStore,
  type Artifact,
  type ArtifactReference,
  type PutArtifactInput,
  type ArtifactMetadata,
} from '@afr/domain'
import { AdapterError } from './errors.js'

export interface InMemoryArtifactOptions {
  readonly now?: () => Date
  readonly id?: () => string
  readonly maxSizeBytes?: number
}
export class InMemoryArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, Artifact>()
  private readonly now: () => Date
  private readonly id: () => string
  private readonly maxSizeBytes: number
  public constructor(options: InMemoryArtifactOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.id = options.id ?? randomUUID
    this.maxSizeBytes = options.maxSizeBytes ?? 1024 * 1024
    if (!Number.isSafeInteger(this.maxSizeBytes) || this.maxSizeBytes < 1)
      throw new AdapterError('INVALID', 'Invalid artifact size limit')
  }
  public async put(input: PutArtifactInput): Promise<ArtifactReference> {
    if (!isJsonValue(input.content))
      throw new AdapterError('INVALID', 'Artifact content must be JSON')
    const bytes = Buffer.from(JSON.stringify(input.content), 'utf8')
    if (bytes.length > this.maxSizeBytes)
      throw new AdapterError('TOO_LARGE', 'Artifact exceeds size limit')
    const checksum = createHash('sha256').update(bytes).digest('hex')
    if (input.checksum !== undefined && checksum !== input.checksum)
      throw new AdapterError('CHECKSUM_MISMATCH', 'Artifact checksum does not match')
    const reference = createArtifactReference({
      artifactId: this.id(),
      executionId: input.executionId,
      kind: input.kind,
    })
    if (this.artifacts.has(reference.artifactId))
      throw new AdapterError('INVALID', 'Artifact ID collision')
    const metadata = createArtifactMetadata({
      ...reference,
      contentType: input.contentType,
      sizeBytes: bytes.length,
      checksum,
      createdAt: this.now().toISOString(),
    })
    this.artifacts.set(reference.artifactId, {
      ...metadata,
      content: JSON.parse(bytes.toString('utf8')) as Artifact['content'],
    })
    return reference
  }
  public async get(reference: ArtifactReference): Promise<Artifact> {
    return structuredClone(this.lookup(reference))
  }
  public async metadata(reference: ArtifactReference): Promise<ArtifactMetadata> {
    const { content: _content, ...metadata } = this.lookup(reference)
    return structuredClone(metadata)
  }
  public async delete(reference: ArtifactReference): Promise<void> {
    this.lookup(reference)
    this.artifacts.delete(reference.artifactId)
  }
  private lookup(reference: ArtifactReference): Artifact {
    createArtifactReference(reference)
    const artifact = this.artifacts.get(reference.artifactId)
    if (
      artifact === undefined ||
      artifact.executionId !== reference.executionId ||
      artifact.kind !== reference.kind
    )
      throw new AdapterError('NOT_FOUND', 'Artifact was not found')
    return artifact
  }
}
