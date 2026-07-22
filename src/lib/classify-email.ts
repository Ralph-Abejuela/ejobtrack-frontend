type ClassifyFn = (text: string) => Promise<{ label: string; score: number }[]>;

let _classify: ClassifyFn | null = null;
let _loading = false;
let _erred: string | null = null;

/** Get model load error message, if any. Null means model loaded or still loading. */
export function getModelError(): string | null {
	return _erred;
}

/** Labels that indicate a job-related email. */
const JOB_LABELS = new Set(["confirmation", "rejection", "interview", "offer"]);

async function load(): Promise<void> {
	if (_classify || _loading) return;
	_loading = true;
	try {
		const { pipeline } = await import("@xenova/transformers");
		const pipe = await pipeline(
			"text-classification",
			"mattohan/job-tracker-email-classifier",
		);
		_classify = pipe as unknown as ClassifyFn;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		_erred = msg;
		console.warn("[classify-email] model load failed:", msg);
	} finally {
		_loading = false;
	}
}

/**
 * Classify an email as job-related or not.
 *
 * Returns:
 *   - `true`  → model says job email
 *   - `false` → model says not a job email
 *   - `null`  → model not loaded yet (caller should fall back to keyword matching)
 */
export async function classifyEmail(
	subject: string,
	body: string,
): Promise<boolean | null> {
	// First call — trigger lazy load, fall back to keywords
	if (!_classify && !_loading && !_erred) {
		load();
		return null;
	}

	if (!_classify) return null; // Still loading or errored — fall back

	try {
		const text = `${subject}\n${body}`.slice(0, 512);
		const result = await _classify(text);
		return JOB_LABELS.has(result[0].label);
	} catch {
		return null; // Inference failed — fall back
	}
}
