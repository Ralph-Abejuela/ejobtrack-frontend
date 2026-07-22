import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
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

/** Minimum similarity score (0–1) for fuzzy-matching company names as duplicates. */
export const COMPANY_SIMILARITY_THRESHOLD = 0.5;

/**
 * Sørensen–Dice coefficient for fuzzy matching.
 * Compares bigram overlap between two strings. Returns 0–1.
 */
export function stringSimilarity(a: string, b: string): number {
	if (a === b) return 1;
	if (a.length < 2 || b.length < 2) return 0;

	const bigrams = new Map<string, number>();
	for (let i = 0; i < a.length - 1; i++) {
		const bg = a.slice(i, i + 2);
		bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
	}

	let intersection = 0;
	for (let i = 0; i < b.length - 1; i++) {
		const bg = b.slice(i, i + 2);
		const count = bigrams.get(bg) ?? 0;
		if (count > 0) {
			bigrams.set(bg, count - 1);
			intersection++;
		}
	}

	return (2 * intersection) / (a.length + b.length - 2);
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
