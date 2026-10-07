import type { JsonValue } from './messaging.js'
import { InvalidContractError } from './errors.js'

export type ArtifactKind =
  'provider_output' | 'tool_result' | 'debug_snapshot' | 'replay_fixture' | 'report'

export interface ArtifactReference {
  readonly artifactId: string
  readonly executionId: string
  readonly kind: ArtifactKind
}

export interface PutArtifactInput {
  readonly executionId: string
  readonly kind: ArtifactKind
  readonly content: JsonValue
  readonly contentType: string
  readonly checksum?: string
}

export interface ArtifactMetadata extends ArtifactReference {
  readonly contentType: string
  readonly sizeBytes: number
  readonly checksum?: string
  readonly createdAt: string
}

export interface Artifact extends ArtifactMetadata {
  readonly content: JsonValue
}

/**
 * Artifact references are opaque domain values. Adapters must keep storage
 * private, enforce size/access limits, and log metadata rather than contents.
 */
export interface ArtifactStore {
  put(input: PutArtifactInput): Promise<ArtifactReference>
  get(reference: ArtifactReference): Promise<Artifact>
  delete(reference: ArtifactReference): Promise<void>
}

export function createArtifactReference(input: ArtifactReference): ArtifactReference {
  requireIdentifier(input.artifactId, 'artifactId')
  requireIdentifier(input.executionId, 'executionId')
  requireKind(input.kind)
  return Object.freeze({ ...input })
}

export function createArtifactMetadata(input: ArtifactMetadata): ArtifactMetadata {
  const reference = createArtifactReference(input)
  requireIdentifier(input.contentType, 'contentType')
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 0) {
    throw new InvalidContractError('sizeBytes must be a non-negative integer')
  }
  if (input.checksum !== undefined) {
    requireIdentifier(input.checksum, 'checksum')
  }
  requireTimestamp(input.createdAt, 'createdAt')
  return Object.freeze({ ...reference, ...input })
}

function requireIdentifier(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidContractError(`${field} must be a non-empty string`)
  }
}

function requireKind(value: string): asserts value is ArtifactKind {
  if (
    !['provider_output', 'tool_result', 'debug_snapshot', 'replay_fixture', 'report'].includes(
      value,
    )
  ) {
    throw new InvalidContractError('kind must be a supported artifact kind')
  }
}

function requireTimestamp(value: string, field: string): void {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || !value.includes('T')) {
    throw new InvalidContractError(`${field} must be a valid ISO-8601 timestamp`)
  }
}
