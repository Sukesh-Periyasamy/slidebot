-- AlterTable: Add PPTX ingestion fields to decks table
ALTER TABLE "decks" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'pdf';
ALTER TABLE "decks" ADD COLUMN "author" TEXT;
ALTER TABLE "decks" ADD COLUMN "pdf_storage_path" TEXT;
ALTER TABLE "decks" ADD COLUMN "conversion_status" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "decks" ADD COLUMN "scene_graph_json" TEXT;
ALTER TABLE "decks" ADD COLUMN "thumbnail_prefix" TEXT;
