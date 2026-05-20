/**
 * PDF.js worker initialization — must be imported once at app startup.
 * Vite handles the worker URL via the `?url` suffix.
 *
 * Import this file in main.tsx or App.tsx before any PDF rendering.
 */
import * as pdfjsLib from 'pdfjs-dist';

// Vite resolves this to the correct worker bundle URL at build time
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl as string;

export { pdfjsLib };
