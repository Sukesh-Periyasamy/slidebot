/**
 * PDF.js worker initialization — must be imported once at app startup.
 * Vite handles the worker URL via the `?url` suffix.
 *
 * Import this file in main.tsx or App.tsx before any PDF rendering.
 */
const mapPrototype = Map.prototype as Map<unknown, unknown> & {
	getOrInsertComputed?: <K, V>(this: Map<K, V>, key: K, computeFn: (key: K) => V) => V;
};

if (!mapPrototype.getOrInsertComputed) {
	Object.defineProperty(mapPrototype, 'getOrInsertComputed', {
		configurable: true,
		writable: true,
		value<K, V>(this: Map<K, V>, key: K, computeFn: (key: K) => V) {
			if (this.has(key)) {
				return this.get(key);
			}

			const value = computeFn(key);
			this.set(key, value);
			return value;
		},
	});
}

const mathWithSumPrecise = Math as Math & {
	sumPrecise?: (...values: unknown[]) => number;
};

if (!mathWithSumPrecise.sumPrecise) {
	Object.defineProperty(mathWithSumPrecise, 'sumPrecise', {
		configurable: true,
		writable: true,
		value: (...values: unknown[]) => {
			const items =
				values.length === 1 && values[0] != null && typeof (values[0] as object)[Symbol.iterator as keyof object] === 'function'
					? Array.from(values[0] as Iterable<unknown>)
					: values;

			return items.reduce<number>((sum, value) => sum + Number(value), 0);
		},
	});
}

import * as pdfjsLib from 'pdfjs-dist';

// Vite resolves this to the correct worker bundle URL at build time
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl as string;

export { pdfjsLib };
