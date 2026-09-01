/**
 * The small part of the WebMCP Community Group surface that WattKeep uses.
 *
 * WebMCP is feature detected at runtime, so this declaration intentionally
 * does not make `Document.modelContext` mandatory.
 */

export interface ModelContextToolAnnotations {
  readonly readOnlyHint: boolean
  readonly untrustedContentHint: boolean
}

export interface ModelContextToolExecutionContext {
  readonly signal: AbortSignal
}

export interface ModelContextTool {
  readonly name: string
  readonly title?: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
  readonly annotations: ModelContextToolAnnotations
  readonly execute: (
    input: unknown,
    context: ModelContextToolExecutionContext,
  ) => Promise<unknown>
}

export interface ModelContextRegisterOptions {
  readonly signal: AbortSignal
}

export interface ModelContext {
  readonly registerTool: (
    tool: ModelContextTool,
    options: ModelContextRegisterOptions,
  ) => Promise<undefined>
}

declare global {
  interface Document {
    readonly modelContext?: ModelContext
  }
}
