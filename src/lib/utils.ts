import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Threshold for Dice coefficient company-name matching.
 * "company" vs "company global inc" → ~0.46.
 */
export const COMPANY_SIMILARITY_THRESHOLD = 0.35;

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Dice-Sørensen coefficient on bigrams.
 * 0 = no overlap, 1 = identical.
 * Good for fuzzy matching short strings like company names.
 */
export function stringSimilarity(a: string, b: string): number {
	const aNorm = a.toLowerCase().trim();
	const bNorm = b.toLowerCase().trim();

	if (aNorm === bNorm) return 1;
	if (aNorm.length < 2 || bNorm.length < 2) return 0;

	const bigrams = new Map<string, number>();
	for (let i = 0; i < aNorm.length - 1; i++) {
		const bg = aNorm.slice(i, i + 2);
		bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
	}

	let intersection = 0;
	for (let i = 0; i < bNorm.length - 1; i++) {
		const bg = bNorm.slice(i, i + 2);
		const count = bigrams.get(bg) ?? 0;
		if (count > 0) {
			bigrams.set(bg, count - 1);
			intersection++;
		}
	}

	const total = aNorm.length - 1 + (bNorm.length - 1);
	return (2 * intersection) / total;
}

export function formatDate(dateStr: string): string {
	if (!dateStr) return "";
	try {
		const date = new Date(dateStr);
		if (isNaN(date.getTime())) return dateStr;
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	} catch {
		return dateStr;
	}
}

export function formatTimeAgo(ms: number): string {
	const delta = Date.now() - ms;
	const mins = Math.floor(delta / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
