// ─────────────────────────────────────────────────────────────────────────────
// MainThreadBridge — Manages communication between main thread and render worker
// ─────────────────────────────────────────────────────────────────────────────

import type {
  RenderCommand,
  SerializedAnnotation,
  WorkerResponse,
} from '../types/renderCommand.types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PendingHitTest {
  resolve: (annotationId: string | null) => void;
  reject: (error: Error) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Duration (ms) without a FRAME during active drawing before declaring worker unresponsive. */
const UNRESPONSIVE_TIMEOUT_MS = 5000;

/** Interval (ms) for checking worker responsiveness. */
const UNRESPONSIVE_CHECK_INTERVAL_MS = 1000;

// ─── Transferable Extraction ─────────────────────────────────────────────────

/**
 * Extract Transferable ArrayBuffers from a RenderCommand.
 * Finds Float64Array buffers in known command fields to enable zero-copy transfer.
 */
function extractTransferables(command: RenderCommand): Transferable[] {
  const transferables: Transferable[] = [];

  switch (command.type) {
    case 'LIVE_STROKE_UPDATE':
      if (command.points.byteLength > 0) {
        transferables.push(command.points.buffer);
      }
      break;
    case 'ACTIVE_STROKE_POINTS':
      if (command.points.byteLength > 0) {
        transferables.push(command.points.buffer);
      }
      break;
    case 'LASER_UPDATE':
      if (command.trail.byteLength > 0) {
        transferables.push(command.trail.buffer);
      }
      break;
    case 'ANNOTATION_UPDATE': {
      const data = command.annotation.data;
      if (data.tool === 'freehand' && data.points.byteLength > 0) {
        transferables.push(data.points.buffer);
      }
      break;
    }
    case 'LIVE_STROKE_COMMIT': {
      const commitData = command.annotation.data;
      if (commitData.tool === 'freehand' && commitData.points.byteLength > 0) {
        transferables.push(commitData.points.buffer);
      }
      break;
    }
    case 'SLIDE_CHANGE': {
      for (const annotation of command.annotations) {
        if (annotation.data.tool === 'freehand' && annotation.data.points.byteLength > 0) {
          transferables.push(annotation.data.points.buffer);
        }
      }
      break;
    }
    default:
      break;
  }

  return transferables;
}

// ─── MainThreadBridge Class ──────────────────────────────────────────────────

/**
 * MainThreadBridge manages the lifecycle of the render worker and provides
 * a typed interface for sending commands and receiving responses.
 *
 * Responsibilities:
 * - Feature-detect OffscreenCanvas and transfer canvas to worker
 * - Forward RenderCommands with Transferable extraction
 * - Composite received ImageBitmap frames onto the visible canvas
 * - Handle hit-test request/response correlation
 * - Detect unresponsive worker and fall back to Konva
 * - Graceful teardown with timeout-based force termination
 */
export class MainThreadBridge {
  private _isOffscreen = false;
  private worker: Worker | null = null;
  private pendingHitTests = new Map<string, PendingHitTest>();
  private hitTestCounter = 0;

  // ─── Frame Compositing ─────────────────────────────────────────────────
  private compositingCtx: CanvasRenderingContext2D | null = null;

  // ─── Unresponsive Detection ────────────────────────────────────────────
  private lastFrameTime = 0;
  private activeDrawing = false;
  private unresponsiveCheckInterval: ReturnType<typeof setInterval> | null = null;

  /** Whether OffscreenCanvas is active (vs fallback) */
  get isOffscreen(): boolean {
    return this._isOffscreen;
  }

  /**
   * Set the compositing canvas that will display rendered frames from the worker.
   * This must be a SEPARATE canvas from the one transferred to the worker.
   */
  setCompositingCanvas(canvas: HTMLCanvasElement): void {
    this.compositingCtx = canvas.getContext('2d');
    if (!this.compositingCtx) {
      console.warn('[MainThreadBridge] Failed to get 2D context for compositing canvas.');
    }
  }

  /**
   * Initialize the bridge: feature-detect OffscreenCanvas, transfer canvas
   * to the worker, and wait for the READY response.
   */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    // Feature-detect OffscreenCanvas support
    if (typeof canvas.transferControlToOffscreen !== 'function') {
      this._isOffscreen = false;
      console.warn(
        '[MainThreadBridge] OffscreenCanvas not supported. Falling back to main-thread rendering.'
      );
      return;
    }

    // Create the render worker
    const worker = new Worker(
      new URL('../workers/render.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Transfer canvas control to offscreen
    const offscreen = canvas.transferControlToOffscreen();

    // Wait for READY response from worker
    const readyPromise = new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        if (response.type === 'READY') {
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
          resolve();
        } else if (response.type === 'ERROR') {
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
          reject(new Error(response.message));
        }
      };

      const onError = (event: ErrorEvent) => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        reject(new Error(event.message || 'Worker failed to initialize'));
      };

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
    });

    // Send INIT command with the OffscreenCanvas as Transferable
    worker.postMessage({ type: 'INIT', canvas: offscreen }, [offscreen]);

    // Wait for worker to be ready
    await readyPromise;

    // Store worker reference and set up the persistent message handler
    this.worker = worker;
    this._isOffscreen = true;
    this.setupMessageHandler();
    this.startUnresponsiveCheck();
  }

  /**
   * Tear down the bridge: send TERMINATE, force-kill worker after 1s timeout,
   * and clean up all pending resources.
   */
  destroy(): void {
    this.stopUnresponsiveCheck();

    if (!this.worker) return;

    // Send TERMINATE command to allow graceful shutdown
    this.worker.postMessage({ type: 'TERMINATE' });

    const workerRef = this.worker;

    // Force-terminate after 1 second if worker hasn't closed
    setTimeout(() => {
      workerRef.terminate();
    }, 1000);

    // Reject all pending hit-test promises
    for (const [, pending] of this.pendingHitTests) {
      pending.reject(new Error('MainThreadBridge destroyed'));
    }
    this.pendingHitTests.clear();

    // Clean up state
    this.worker = null;
    this._isOffscreen = false;
    this.compositingCtx = null;
    this.activeDrawing = false;
  }

  /**
   * Send a render command to the worker with Transferable extraction
   * for Float64Array buffers.
   *
   * Also tracks active drawing state for unresponsive detection.
   */
  send(command: RenderCommand): void {
    if (!this.worker) return;

    // Track active drawing state for unresponsive detection
    this.trackActiveDrawingState(command);

    const transferables = extractTransferables(command);
    if (transferables.length > 0) {
      this.worker.postMessage(command, transferables);
    } else {
      this.worker.postMessage(command);
    }
  }

  /**
   * Request a hit-test at the given normalized coordinates.
   * Returns a promise that resolves with the annotation ID or null.
   */
  hitTest(x: number, y: number): Promise<string | null> {
    if (!this.worker) {
      return Promise.resolve(null);
    }

    const requestId = `ht-${++this.hitTestCounter}-${Date.now()}`;

    return new Promise<string | null>((resolve, reject) => {
      this.pendingHitTests.set(requestId, { resolve, reject });
      this.worker!.postMessage({ type: 'HIT_TEST', x, y, requestId });
    });
  }

  // ─── Convenience Methods for Store Subscription ──────────────────────────

  /**
   * Send a RESIZE command to the worker when the viewport dimensions change.
   */
  sendResize(width: number, height: number): void {
    this.send({ type: 'RESIZE', width, height });
  }

  /**
   * Send a SLIDE_CHANGE command to the worker when the active slide changes.
   * Includes the full annotation set for the new slide.
   */
  sendSlideChange(slideId: string, annotations: SerializedAnnotation[]): void {
    this.send({ type: 'SLIDE_CHANGE', slideId, annotations });
  }

  // ─── Private Methods ─────────────────────────────────────────────────────

  /**
   * Track whether active drawing is in progress based on sent commands.
   * Used for unresponsive detection — we only consider the worker unresponsive
   * if it fails to produce frames during active drawing.
   */
  private trackActiveDrawingState(command: RenderCommand): void {
    switch (command.type) {
      case 'ACTIVE_STROKE_START':
        this.activeDrawing = true;
        break;
      case 'ACTIVE_STROKE_COMMIT':
      case 'ACTIVE_STROKE_CANCEL':
        this.activeDrawing = false;
        break;
    }
  }

  /**
   * Start the periodic check for worker unresponsiveness.
   * If no FRAME is received for 5s during active drawing, terminate the worker
   * and fall back to Konva rendering.
   */
  private startUnresponsiveCheck(): void {
    this.lastFrameTime = Date.now();
    this.unresponsiveCheckInterval = setInterval(() => {
      if (
        this.activeDrawing &&
        this.worker &&
        Date.now() - this.lastFrameTime > UNRESPONSIVE_TIMEOUT_MS
      ) {
        console.error(
          '[MainThreadBridge] Worker unresponsive (no FRAME for 5s during active drawing). Terminating and falling back to Konva.'
        );
        this.terminateUnresponsiveWorker();
      }
    }, UNRESPONSIVE_CHECK_INTERVAL_MS);
  }

  /**
   * Stop the unresponsive check interval.
   */
  private stopUnresponsiveCheck(): void {
    if (this.unresponsiveCheckInterval !== null) {
      clearInterval(this.unresponsiveCheckInterval);
      this.unresponsiveCheckInterval = null;
    }
  }

  /**
   * Terminate an unresponsive worker and fall back to Konva rendering.
   */
  private terminateUnresponsiveWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this._isOffscreen = false;
    this.activeDrawing = false;
    this.stopUnresponsiveCheck();

    // Reject all pending hit-test promises
    for (const [, pending] of this.pendingHitTests) {
      pending.reject(new Error('Worker terminated due to unresponsiveness'));
    }
    this.pendingHitTests.clear();
  }

  /**
   * Set up the persistent message handler for worker responses.
   * Routes FRAME responses to compositing, HIT_RESULT to pending promises, and logs errors.
   */
  private setupMessageHandler(): void {
    if (!this.worker) return;

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;

      switch (response.type) {
        case 'HIT_RESULT': {
          const pending = this.pendingHitTests.get(response.requestId);
          if (pending) {
            this.pendingHitTests.delete(response.requestId);
            pending.resolve(response.annotationId);
          }
          break;
        }
        case 'FRAME':
          // Update last frame time for unresponsive detection
          this.lastFrameTime = Date.now();

          // Composite the frame onto the visible canvas
          if (this.compositingCtx) {
            this.compositingCtx.drawImage(response.bitmap, 0, 0);
          }

          // Release the ImageBitmap to free GPU/memory resources
          response.bitmap.close();
          break;
        case 'ERROR':
          console.error('[MainThreadBridge] Worker error:', response.message);
          break;
        case 'READY':
          // Should not receive READY after initialization, but ignore gracefully
          break;
      }
    };
  }
}
