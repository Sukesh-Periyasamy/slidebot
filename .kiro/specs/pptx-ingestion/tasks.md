# Implementation Plan: PPTX Ingestion Pipeline

## Overview

This plan implements the PPTX Ingestion Pipeline as a dual-path system: client-side Web Worker parsing for instant preview and server-side LibreOffice conversion for high-fidelity rendering. Tasks are ordered to build foundational types first, then server-side validation/upload, then client-side parsing, and finally wiring everything together.

## Tasks

- [x] 1. Define Scene Graph types and serialization in shared-types
  - [x] 1.1 Create Scene Graph type definitions
    - Create `packages/shared-types/src/scene-graph.ts` with all interfaces: `PresentationDocument`, `Slide`, `SlideElement`, `BaseElement`, `TextElement`, `ShapeElement`, `ImageElement`, `TableElement`, `PlaceholderElement`, `BackgroundElement`, `DocumentMetadata`, `Paragraph`, `TextRun`, `TableCell`, `CellMerge`
    - Export the discriminated union `SlideElement` type and all supporting types
    - Add the `ElementProperties` type union
    - _Requirements: 6.1, 6.5_

  - [x] 1.2 Implement Scene Graph serialization and deserialization
    - Implement `serialize(doc: PresentationDocument, pretty?: boolean): string` function that produces JSON with 2-space indentation when `pretty` is true
    - Implement `deserialize(json: string): PresentationDocument` function with validation
    - Ensure round-trip consistency: `deserialize(serialize(doc))` produces a deeply-equal document
    - Ensure idempotence: `serialize(deserialize(serialize(doc))) === serialize(doc)`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 1.3 Write property test for serialization round-trip (Property 11)
    - **Property 11: Serialization Round-Trip and Idempotence**
    - Generate arbitrary valid `PresentationDocument` objects using fast-check arbitraries
    - Assert `deserialize(serialize(doc))` deep-equals original doc
    - Assert `serialize(deserialize(serialize(doc)))` byte-equals `serialize(doc)`
    - **Validates: Requirements 6.4, 10.1, 10.2, 10.4**

  - [x] 1.4 Implement EMU to Virtual Viewport coordinate conversion
    - Create `normalize(shapes: ExtractedShape[], sourceWidth: number, sourceHeight: number): SlideElement[]` function
    - Implement the conversion formula: scale = min(1920/srcW, 1080/srcH), center with offsets
    - Round all output coordinates to 2 decimal places
    - _Requirements: 6.2, 6.6_

  - [ ]* 1.5 Write property test for coordinate conversion (Property 9)
    - **Property 9: EMU to Virtual Viewport Coordinate Conversion**
    - Generate arbitrary EMU coordinates and source dimensions
    - Assert output satisfies: 0 ≤ x ≤ 1920, 0 ≤ y ≤ 1080, width > 0, height > 0
    - Assert aspect ratio of converted element equals source element aspect ratio
    - **Validates: Requirements 6.2**

  - [ ]* 1.6 Write property test for coordinate precision (Property 12)
    - **Property 12: Coordinate Precision**
    - Generate arbitrary EMU values
    - Assert all output coordinate values have at most 2 decimal places
    - **Validates: Requirements 6.6**

  - [ ]* 1.7 Write property test for z-order preservation (Property 10)
    - **Property 10: Z-Order Preservation**
    - Generate arbitrary ordered sequences of shapes
    - Assert output SlideElements array preserves relative ordering from source
    - **Validates: Requirements 6.3**

  - [ ]* 1.8 Write property test for unsupported type placeholder (Property 13)
    - **Property 13: Unsupported Type Placeholder**
    - Generate shapes with unsupported type identifiers
    - Assert output contains placeholder elements with the unsupported type name and correct bounding box
    - **Validates: Requirements 6.5**

- [x] 2. Implement PPTX Validator on the server
  - [x] 2.1 Create PPTX Validator module
    - Create `apps/api/src/modules/decks/pptx-validator.ts`
    - Implement `validatePptx(buffer: Buffer, options: PptxValidatorOptions): Promise<PptxValidationResult>`
    - Validate ZIP structure using a streaming ZIP library (e.g., `yauzl` or `adm-zip`)
    - Check for required OOXML entries: `[Content_Types].xml`, `_rels/.rels`, `ppt/presentation.xml`
    - Verify at least one `ppt/slides/slide*.xml` entry exists
    - Implement path traversal detection (reject entries containing `../` or `..\`)
    - Implement decompression bomb detection (total > 500MB or single entry > 200MB)
    - Implement entry count limit (> 10,000 entries)
    - Implement 30-second timeout using AbortController or Promise.race
    - Return slide count on success
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 2.2 Write property test for structural validation (Property 1)
    - **Property 1: Structural Validation Correctness**
    - Generate ZIP archives with/without required OOXML entries
    - Assert acceptance iff all required entries present
    - **Validates: Requirements 2.1, 2.5**

  - [ ]* 2.3 Write property test for non-ZIP rejection (Property 2)
    - **Property 2: Non-ZIP Data Rejection**
    - Generate arbitrary byte sequences that are not valid ZIP archives
    - Assert validator rejects with appropriate error
    - **Validates: Requirements 2.2**

  - [ ]* 2.4 Write property test for path traversal detection (Property 3)
    - **Property 3: Path Traversal Detection**
    - Generate ZIP archives containing entries with path traversal sequences
    - Assert validator rejects with path traversal error
    - **Validates: Requirements 2.3**

  - [ ]* 2.5 Write property test for decompression bomb detection (Property 4)
    - **Property 4: Decompression Bomb Detection**
    - Generate ZIP archives with entries exceeding size limits
    - Assert validator rejects with decompression size limit error
    - **Validates: Requirements 2.4**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extend Deck model and upload endpoint for PPTX
  - [x] 4.1 Create Prisma migration for PPTX fields
    - Add new fields to the `Deck` model in `apps/api/prisma/schema.prisma`: `sourceType` (String, default "pdf"), `author` (String, optional), `pdfStoragePath` (String, optional), `conversionStatus` (String, default "none"), `sceneGraphJson` (String, optional), `thumbnailPrefix` (String, optional)
    - Generate and apply the migration
    - _Requirements: 1.6, 7.3, 7.5_

  - [x] 4.2 Implement PPTX metadata extraction
    - Create `apps/api/src/modules/decks/pptx-metadata.ts`
    - Implement extraction of title, author, subject from `docProps/core.xml` within the ZIP
    - Implement slide count by counting `ppt/slides/slide*.xml` entries
    - Implement fallback: use filename as title if property absent/empty, use user display name as author if property absent/empty
    - Handle malformed metadata gracefully (fallback to defaults with slideCount=1)
    - _Requirements: 1.6, 1.7, 9.1, 9.2, 9.3, 9.4_

  - [ ]* 4.3 Write property test for metadata extraction (Property 14)
    - **Property 14: Metadata Extraction from Core Properties**
    - Generate valid `docProps/core.xml` content with various title/author/subject values
    - Assert extracted values exactly match XML text content
    - **Validates: Requirements 9.1**

  - [ ]* 4.4 Write property test for slide count accuracy (Property 15)
    - **Property 15: Slide Count Accuracy**
    - Generate PPTX archives with N slide XML files
    - Assert reported slide count equals N
    - **Validates: Requirements 3.3, 9.4**

  - [x] 4.5 Update upload endpoint to accept PPTX files
    - Modify `apps/api/src/modules/decks/decks.router.ts` to accept PPTX MIME type and `.pptx` extension
    - Add multer file size limit of 100MB
    - Integrate PPTX Validator for structural validation before storage
    - On validation success: upload to Supabase Storage, extract metadata, create Deck record with `sourceType: 'pptx'`
    - On validation failure: return appropriate 400 error with descriptive message
    - Return 400 with size error if file exceeds 100MB
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 5. Implement Conversion Queue and LibreOffice Converter
  - [x] 5.1 Create conversion queue module
    - Create `apps/api/src/modules/decks/conversion-queue.ts`
    - Define BullMQ queue `pptx-conversion` using existing Redis connection
    - Implement job enqueue with `deckId`, `storagePath`, `ownerId`
    - Configure retry: 3 attempts, exponential backoff starting at 5s (5s, 10s, 20s)
    - Configure job timeout of 60 seconds
    - Emit completion/failure events with Deck ID and status
    - _Requirements: 7.1, 7.4, 7.5, 7.7_

  - [x] 5.2 Create LibreOffice converter worker
    - Create `apps/api/src/modules/decks/conversion-worker.ts`
    - Implement BullMQ worker that downloads PPTX from Supabase Storage
    - Execute LibreOffice headless conversion (`libreoffice --headless --convert-to pdf`) in a sandboxed child process with no network access and 60-second timeout
    - Upload resulting PDF to Supabase Storage
    - Update Deck record with `pdfStoragePath` and `conversionStatus: 'completed'`
    - On failure after all retries: update Deck record with `conversionStatus: 'failed'`
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 5.3 Implement thumbnail generator
    - Create `apps/api/src/modules/decks/thumbnail-generator.ts`
    - Implement `generateThumbnails(pdfBuffer, slideCount, options)` using a PDF-to-image library (e.g., `pdf-poppler` or `sharp` with pdf input)
    - Generate 320×180 PNG thumbnails for each slide
    - Upload thumbnails to Supabase Storage under the deck's storage prefix
    - Update Deck record with `thumbnailPrefix`
    - If a single slide thumbnail fails, continue processing remaining slides and log the failure
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 5.4 Wire conversion queue into upload flow
    - After successful PPTX upload and Deck record creation, enqueue a conversion job
    - Set Deck `conversionStatus` to `'pending'` when job is enqueued
    - Add Socket.IO event emission when conversion completes or fails so client can be notified
    - _Requirements: 7.1, 7.7_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement client-side OOXML Resolver
  - [x] 7.1 Create OOXML Resolver module
    - Create `apps/web/src/features/decks/lib/ooxml-resolver.ts`
    - Implement `resolveSlideContext(themeXml, masterXml, layoutXml): ResolvedSlideContext`
    - Parse theme XML to extract color scheme (map schemeClr names to #RRGGBB values)
    - Parse theme XML to extract major and minor font families
    - Resolve inheritance hierarchy: Theme → Slide Master → Slide Layout → Slide (most specific wins)
    - Apply inherited properties as defaults that slide-level properties override
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 7.2 Write property test for theme inheritance (Property 5)
    - **Property 5: Theme Inheritance Resolution**
    - Generate theme/master/layout/slide property combinations
    - Assert most specific level wins, higher levels cascade as defaults
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 7.3 Write property test for theme reference resolution (Property 6)
    - **Property 6: Theme Reference Resolution**
    - Generate theme definitions with color schemes and font references
    - Assert all schemeClr references resolve to correct RGB hex values
    - Assert all font references resolve to correct font family names
    - **Validates: Requirements 4.3, 4.4**

- [x] 8. Implement client-side Shape Extractor
  - [x] 8.1 Create Shape Extractor module
    - Create `apps/web/src/features/decks/lib/shape-extractor.ts`
    - Implement `extractShapes(slideXml, relationships, context): ExtractedShape[]`
    - Extract text elements: content, font properties, paragraph alignment, text color
    - Extract geometric shapes: shape type, fill color, outline properties, position
    - Extract embedded images: resolve binary data from relationships
    - Extract tables: row count, column count, cell content, cell merge information
    - Extract slide background: solid fills, gradient fills, background images
    - Resolve external relationships (images, hyperlinks) using the slide's `_rels` file
    - Preserve z-order from source XML ordering
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 8.2 Write property test for shape extraction completeness (Property 7)
    - **Property 7: Shape Extraction Completeness**
    - Generate slide XML with shapes of supported types
    - Assert each input shape produces an extracted shape with all required properties
    - **Validates: Requirements 5.1, 5.2, 5.4**

  - [ ]* 8.3 Write property test for relationship resolution (Property 8)
    - **Property 8: Relationship Resolution**
    - Generate shapes with relationship IDs and corresponding `_rels` mappings
    - Assert each rId resolves to the correct target path
    - **Validates: Requirements 5.6**

- [x] 9. Implement Web Worker Parser
  - [x] 9.1 Create Web Worker parser
    - Create `apps/web/src/features/decks/workers/pptx-parser.worker.ts`
    - Implement message handling for `PARSE` and `CANCEL` request types
    - Use JSZip to extract ZIP archive contents from the received ArrayBuffer
    - Use fast-xml-parser to parse all slide XML files in `ppt/slides/` directory
    - Integrate OOXML Resolver for theme/master/layout resolution
    - Integrate Shape Extractor for each slide
    - Integrate Scene Graph Normalizer to produce final `PresentationDocument`
    - Extract metadata from `docProps/core.xml`
    - Post progress messages at each stage transition (zip-extraction, xml-parsing, scene-graph-construction) with integer percentage 0-100
    - Post `COMPLETE` message with the `PresentationDocument` via structured clone
    - Post `ERROR` message on failure with stage and failure description, discard partial results
    - Implement 30-second timeout: abort and post timeout error if exceeded
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 9.2 Write property test for progress message validity (Property 16)
    - **Property 16: Progress Message Validity**
    - Generate parsing operations and capture emitted progress messages
    - Assert all messages have valid stage identifiers and percentage in [0, 100] as integers
    - **Validates: Requirements 3.4**

- [x] 10. Wire client-side upload flow
  - [x] 10.1 Update upload hook to support PPTX
    - Modify `apps/web/src/features/decks/hooks/useDeckUpload.ts` to accept `.pptx` files in addition to PDF
    - When a PPTX file is selected: instantiate the Web Worker, send the file via postMessage, handle progress/complete/error responses
    - On `COMPLETE`: store the Scene Graph in local state for immediate preview rendering
    - On `ERROR`: display error toast to user
    - Simultaneously upload the file to the API endpoint (existing multipart upload flow)
    - _Requirements: 1.1, 1.2, 3.1, 3.7_

  - [x] 10.2 Add Socket.IO listener for conversion status
    - Listen for conversion completion/failure events from the server
    - On conversion complete: update deck store with PDF path and thumbnail paths
    - On conversion failure: show notification that high-fidelity rendering is unavailable, Scene Graph remains primary source
    - _Requirements: 7.5, 7.7_

  - [x] 10.3 Update deck store and API types
    - Update `apps/web/src/features/decks/types/deck.ts` with new fields: `sourceType`, `author`, `pdfStoragePath`, `conversionStatus`, `thumbnailPrefix`
    - Update deck store to handle Scene Graph state for PPTX decks
    - Update `apps/web/src/features/decks/api/decksApi.ts` to handle new response fields
    - _Requirements: 1.6, 7.3, 7.5_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TypeScript throughout, vitest for testing, and fast-check (v4.8.0) for property-based tests
- BullMQ and Redis are already configured in the API server
- JSZip and fast-xml-parser need to be added as dependencies to `@slidebot/web`
- A ZIP library (e.g., `adm-zip` or `yauzl`) needs to be added to `@slidebot/api` for server-side validation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "2.2", "2.3", "2.4", "2.5", "4.1"] },
    { "id": 2, "tasks": ["1.3", "1.5", "1.6", "1.7", "1.8", "4.2"] },
    { "id": 3, "tasks": ["4.3", "4.4", "4.5", "7.1"] },
    { "id": 4, "tasks": ["5.1", "7.2", "7.3", "8.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "8.2", "8.3"] },
    { "id": 6, "tasks": ["5.4", "9.1"] },
    { "id": 7, "tasks": ["9.2", "10.1"] },
    { "id": 8, "tasks": ["10.2", "10.3"] }
  ]
}
```
