# Requirements Document

## Introduction

The PPTX Ingestion Pipeline extends SlideBot's existing PDF-only upload flow to accept Microsoft PowerPoint (.pptx) files. The pipeline parses PPTX archives client-side in a Web Worker for immediate preview, queues server-side LibreOffice conversion for high-fidelity rendering, and normalizes extracted content into a Unified Scene Graph compatible with the existing rendering engine. The feature integrates with the current Deck/Slide/Room database models and Supabase Storage infrastructure.

## Glossary

- **Upload_Service**: The Express API endpoint and middleware responsible for receiving file uploads via multer and storing them in Supabase Storage
- **PPTX_Validator**: The component that inspects uploaded files to verify valid PPTX structure and reject malformed or malicious archives
- **Web_Worker_Parser**: The client-side Web Worker that extracts and parses PPTX archive contents using JSZip and fast-xml-parser without blocking the main thread
- **OOXML_Resolver**: The component that resolves Master Slide, Layout, and Theme inheritance hierarchies from OOXML XML relationships
- **Shape_Extractor**: The component that extracts individual shapes (text, images, tables, geometric shapes) from parsed slide XML
- **Scene_Graph_Normalizer**: The component that transforms extracted shapes into a Unified Scene Graph (PresentationDocument containing Slides with SlideElements) using a 1920×1080 virtual viewport coordinate system
- **Conversion_Queue**: The BullMQ queue that manages server-side LibreOffice conversion jobs
- **LibreOffice_Converter**: The sandboxed server-side process that converts PPTX files to PDF using LibreOffice headless for high-fidelity static rendering
- **Thumbnail_Generator**: The component that produces thumbnail images for each slide for use in slide navigation
- **Deck_Record**: The Prisma Deck model that stores presentation metadata including storage path, slide count, title, and author
- **Virtual_Viewport**: The normalized 1920×1080 coordinate space used for positioning all slide elements regardless of source file dimensions

## Requirements

### Requirement 1: PPTX File Upload

**User Story:** As a presenter, I want to upload PPTX files through the existing upload flow, so that I can use PowerPoint presentations in SlideBot without manual conversion.

#### Acceptance Criteria

1. WHEN a user uploads a file with MIME type `application/vnd.openxmlformats-officedocument.presentationml.presentation`, THE Upload_Service SHALL accept the file and store it in Supabase Storage
2. WHEN a user uploads a file with extension `.pptx`, THE Upload_Service SHALL accept the file regardless of the reported MIME type, provided the file passes structural validation (the file is a valid ZIP archive containing a `[Content_Types].xml` entry and at least one slide part matching `ppt/slides/slide*.xml`)
3. THE Upload_Service SHALL support PPTX files up to 100MB in size (inclusive)
4. IF a file exceeds 100MB, THEN THE Upload_Service SHALL reject the upload with an error message indicating the maximum allowed file size of 100MB
5. IF an uploaded `.pptx` file fails structural validation, THEN THE Upload_Service SHALL reject the upload with an error message indicating the file is not a valid PPTX document
6. WHEN a PPTX upload completes successfully, THE Upload_Service SHALL create a Deck_Record with the storage path, the slide count (total number of `ppt/slides/slide*.xml` entries), the title extracted from core properties (defaulting to the original filename if the title property is absent or empty), and the author extracted from core properties (defaulting to the uploading user's display name if the author property is absent or empty)
7. IF metadata extraction fails due to a malformed or unreadable PPTX internal structure after structural validation passes, THEN THE Upload_Service SHALL create the Deck_Record using the original filename as the title, the uploading user's display name as the author, and a slide count of 1

### Requirement 2: PPTX Structure Validation

**User Story:** As a system administrator, I want uploaded PPTX files to be validated for structural integrity, so that malicious or corrupted files do not enter the processing pipeline.

#### Acceptance Criteria

1. WHEN a file is uploaded as PPTX, THE PPTX_Validator SHALL verify the file is a valid ZIP archive containing the required OOXML directory structure (`[Content_Types].xml`, `_rels/.rels`, `ppt/presentation.xml`) and, upon successful validation, pass the file to the next pipeline stage
2. WHEN a file fails ZIP extraction, THE PPTX_Validator SHALL reject the file with an error indicating the file is not a valid PPTX archive
3. WHEN a file contains ZIP entries with path traversal sequences (e.g., `../`), THE PPTX_Validator SHALL reject the file with an error indicating a path traversal violation was detected
4. WHEN a file contains ZIP entries that would decompress to a total size exceeding 500MB or any single ZIP entry declares an uncompressed size exceeding 200MB, THE PPTX_Validator SHALL reject the file with an error indicating a decompression size limit was exceeded
5. IF a file passes ZIP validation but lacks required OOXML structure, THEN THE PPTX_Validator SHALL reject the file with an error indicating missing presentation structure
6. WHEN a file contains more than 10,000 ZIP entries, THE PPTX_Validator SHALL reject the file with an error indicating the archive entry count exceeds the allowed limit
7. IF the PPTX_Validator does not complete all validation checks within 30 seconds, THEN THE PPTX_Validator SHALL abort validation and reject the file with an error indicating a validation timeout

### Requirement 3: Client-Side PPTX Parsing in Web Worker

**User Story:** As a presenter, I want my PPTX file to be parsed immediately in the browser for a quick preview, so that I do not have to wait for server-side processing to start presenting.

#### Acceptance Criteria

1. THE Web_Worker_Parser SHALL execute all PPTX extraction and XML parsing operations in a dedicated Web Worker thread
2. WHEN a PPTX file is received via postMessage, THE Web_Worker_Parser SHALL extract the ZIP archive contents using JSZip and complete all parsing within 30 seconds
3. WHEN ZIP contents are extracted, THE Web_Worker_Parser SHALL parse all slide XML files located in the `ppt/slides/` directory using fast-xml-parser
4. WHILE the Web_Worker_Parser is processing, THE Web_Worker_Parser SHALL post progress messages to the main thread at minimum once per stage transition, indicating the current stage (ZIP extraction, XML parsing, scene graph construction) and percentage complete as an integer from 0 to 100
5. IF the Web_Worker_Parser encounters a parsing error, THEN THE Web_Worker_Parser SHALL post an error message to the main thread identifying the failed stage and the nature of the failure, and SHALL discard any partial parsing results
6. IF the Web_Worker_Parser does not complete within 30 seconds, THEN THE Web_Worker_Parser SHALL abort processing and post an error message to the main thread indicating a timeout occurred
7. WHEN parsing completes successfully, THE Web_Worker_Parser SHALL transfer the resulting Scene Graph conforming to the PresentationDocument structure to the main thread via structured clone

### Requirement 4: OOXML Theme and Layout Resolution

**User Story:** As a presenter, I want my slides to retain their original theme colors, fonts, and layout positioning, so that the presentation looks consistent with what I designed in PowerPoint.

#### Acceptance Criteria

1. WHEN parsing a PPTX file, THE OOXML_Resolver SHALL resolve the theme hierarchy: Theme → Slide Master → Slide Layout → Slide
2. WHEN a slide element inherits properties from a Slide Master or Layout, THE OOXML_Resolver SHALL apply the inherited properties as defaults that the slide-level properties override
3. WHEN a theme defines a color scheme, THE OOXML_Resolver SHALL resolve all theme color references (e.g., `schemeClr`) to concrete RGB values
4. WHEN a theme defines font families (major and minor), THE OOXML_Resolver SHALL resolve all theme font references to concrete font names

### Requirement 5: Shape Extraction

**User Story:** As a presenter, I want all visual elements from my slides to be extracted, so that text, images, shapes, and tables appear in the SlideBot viewer.

#### Acceptance Criteria

1. WHEN processing a slide, THE Shape_Extractor SHALL extract text elements including content, font properties, paragraph alignment, and text color
2. WHEN processing a slide, THE Shape_Extractor SHALL extract geometric shapes including shape type, fill color, outline properties, and position
3. WHEN processing a slide, THE Shape_Extractor SHALL extract embedded images and resolve their binary data from the PPTX archive relationships
4. WHEN processing a slide, THE Shape_Extractor SHALL extract tables including row count, column count, cell content, and cell merge information
5. WHEN processing a slide, THE Shape_Extractor SHALL extract slide background properties including solid fills, gradient fills, and background images
6. WHEN a shape references an external relationship (image, hyperlink), THE Shape_Extractor SHALL resolve the relationship using the slide's `_rels` file

### Requirement 6: Scene Graph Normalization

**User Story:** As a developer, I want extracted PPTX content normalized into a Unified Scene Graph, so that the existing rendering engine can consume it without format-specific logic.

#### Acceptance Criteria

1. THE Scene_Graph_Normalizer SHALL produce a PresentationDocument containing an ordered array of Slides, each containing an ordered array of SlideElements, where each SlideElement includes at minimum: a type identifier, x position, y position, width, and height in Virtual_Viewport coordinates
2. WHEN normalizing coordinates, THE Scene_Graph_Normalizer SHALL convert EMU (English Metric Units) positions and dimensions to the 1920×1080 Virtual_Viewport coordinate space by scaling the source slide dimensions proportionally to fit within 1920×1080 while preserving the source aspect ratio and centering the content within the viewport
3. THE Scene_Graph_Normalizer SHALL preserve the z-order of elements as defined in the source slide XML, where the first element in the SlideElements array has the lowest z-index (rendered first, behind subsequent elements)
4. THE Scene_Graph_Normalizer SHALL produce PresentationDocuments where serializing to JSON then deserializing produces a deeply-equal PresentationDocument with identical property values, types, and array ordering
5. IF a slide element type is not one of the supported types (text, geometric shape, image, table, background), THEN THE Scene_Graph_Normalizer SHALL emit a placeholder element containing the unsupported type name as a string and the element's bounding box in Virtual_Viewport coordinates
6. WHEN normalizing coordinates, THE Scene_Graph_Normalizer SHALL represent all Virtual_Viewport coordinate values as floating-point numbers rounded to a precision of 2 decimal places

### Requirement 7: Server-Side LibreOffice Conversion

**User Story:** As a presenter, I want a high-fidelity PDF version of my PPTX generated server-side, so that complex slides render with full visual accuracy.

#### Acceptance Criteria

1. WHEN a PPTX file is uploaded, THE Conversion_Queue SHALL enqueue a conversion job with the file's storage path and associated Deck ID
2. WHEN a conversion job is dequeued, THE LibreOffice_Converter SHALL convert the PPTX file to PDF using a sandboxed LibreOffice headless instance
3. WHEN conversion completes successfully, THE LibreOffice_Converter SHALL upload the resulting PDF to Supabase Storage and update the Deck_Record with the PDF storage path
4. IF LibreOffice conversion fails or the 60-second timeout is exceeded, THEN THE Conversion_Queue SHALL retry the job up to 3 times with exponential backoff starting at 5 seconds and doubling on each subsequent attempt
5. IF all retry attempts fail, THEN THE Conversion_Queue SHALL mark the job as failed, update the Deck_Record with a failed conversion status, and the client-side parsed Scene Graph SHALL remain the primary rendering source
6. WHILE a conversion job is running, THE LibreOffice_Converter SHALL execute in an isolated process with no network access and a 60-second timeout
7. WHEN conversion completes successfully or all retry attempts fail, THE Conversion_Queue SHALL emit an event containing the Deck ID and the resulting status so that the client can be notified of the outcome

### Requirement 8: Thumbnail Generation

**User Story:** As a presenter, I want thumbnail images for each slide, so that I can quickly navigate between slides using visual previews.

#### Acceptance Criteria

1. WHEN server-side PDF conversion completes, THE Thumbnail_Generator SHALL produce a PNG thumbnail for each slide at 320×180 pixel resolution
2. WHEN thumbnails are generated, THE Thumbnail_Generator SHALL upload each thumbnail to Supabase Storage under the deck's storage prefix
3. WHEN all thumbnails for a deck are generated, THE Thumbnail_Generator SHALL update the Deck_Record with the thumbnail storage paths
4. IF thumbnail generation fails for a specific slide, THEN THE Thumbnail_Generator SHALL continue processing remaining slides and log the failure

### Requirement 9: Deck Metadata Extraction

**User Story:** As a presenter, I want my presentation's title, author, and slide count stored automatically, so that I can identify my decks without opening them.

#### Acceptance Criteria

1. WHEN parsing a PPTX file, THE Web_Worker_Parser SHALL extract document properties (title, author, subject) from the `docProps/core.xml` file
2. WHEN metadata extraction completes, THE Upload_Service SHALL store the extracted title and author in the Deck_Record
3. IF the PPTX file does not contain a title in document properties, THEN THE Upload_Service SHALL use the original filename (without extension) as the deck name
4. THE Upload_Service SHALL store the accurate slide count derived from the number of slide XML files in the `ppt/slides/` directory

### Requirement 10: Scene Graph Serialization and Pretty Printing

**User Story:** As a developer, I want the Scene Graph to be serializable to and from JSON, so that it can be stored, transmitted, and debugged reliably.

#### Acceptance Criteria

1. THE Scene_Graph_Normalizer SHALL serialize PresentationDocument objects to JSON format
2. THE Scene_Graph_Normalizer SHALL deserialize valid JSON back into PresentationDocument objects
3. THE Scene_Graph_Normalizer SHALL format serialized JSON with consistent indentation for human readability when debug mode is enabled
4. FOR ALL valid PresentationDocument objects, parsing the serialized JSON then re-serializing SHALL produce byte-identical output (round-trip property)
