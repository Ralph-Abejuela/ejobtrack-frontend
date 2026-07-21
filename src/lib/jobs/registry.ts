import type { JobPlatformParser } from "./types";
import { jobstreetParser } from "./jobstreet";
import { linkedinParser } from "./linkedin";

/** Registry of all platform parsers. Add new parsers here. */
const parsers: JobPlatformParser[] = [jobstreetParser, linkedinParser];

/** Map from email from-address to the matching parser. */
const fromMap = new Map<string, JobPlatformParser>();
for (const p of parsers) {
	for (const addr of p.fromAddresses) {
		fromMap.set(addr.toLowerCase(), p);
	}
}

/** Get all known job-related from-addresses (for Gmail API query). */
export function getJobFromAddresses(): string[] {
	const addrs: string[] = [];
	for (const p of parsers) {
		addrs.push(...p.fromAddresses);
	}
	return addrs;
}

/** Build a Gmail API q-string that matches all job senders. */
export function buildJobQuery(): string {
	return getJobFromAddresses()
		.map((a) => `from:${a}`)
		.join(" OR ");
}

/** Find parser by email from-address. */
export function findParser(from: string): JobPlatformParser | undefined {
	return fromMap.get(from.toLowerCase());
}

/** Run all parsers against an email. Returns first match or null. */
export function parseEmail(email: {
	from: string;
	subject: string;
	snippet: string;
	body: string;
	id: string;
	internalDate: string;
}) {
	const properEmail = email.from.match('<\.+@\.+>$')?.[0]?.slice(1,-1);
	if(!properEmail) return null;
	console.log(properEmail)
	const parser = findParser(properEmail);
	if (!parser) return null;
	return parser.parse(email);
}

export { parsers };
