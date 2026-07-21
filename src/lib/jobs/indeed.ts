import { JobPlatform, JobStatus, type JobPlatformParser } from "./types";

/**
 * Parser for Indeed job application confirmation emails (indeedapply@indeed.com).
 *
 * Subject: "Indeed Application: {Job Title}"
 * BodyHtml contains job title in <h1><a> and company in <strong><a> after the h1.
 *
 * Status: Always APPLIED for these confirmation emails.
 */
export const indeedParser: JobPlatformParser = {
	platform: JobPlatform.INDEED,
	fromAddresses: ["indeedapply@indeed.com"],

	parse(email) {
		const { subject, bodyHtml, bodyClean } = email;

		// Confirm it's an Indeed application email via subject
		const indeedMatch = subject.match(/^Indeed Application:\s*(.+)/i);
		if (!indeedMatch) return null;

		const subjectTitle = indeedMatch[1].trim();

		// ── Extract job title ──
		// Prefer bodyHtml <h1><a>, fall back to subject
		let jobTitle = "";
		if (bodyHtml) {
			const h1Match = bodyHtml.match(
				/<h1[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h1>/i,
			);
			if (h1Match) {
				jobTitle = h1Match[1].replace(/<[^>]*>/g, "").trim();
			}
		}
		if (!jobTitle) jobTitle = subjectTitle;

		// ── Extract company ──
		// Company is in <strong><a>...</a></strong> that appears AFTER the <h1>
		let company = "";
		if (bodyHtml) {
			// Find everything after the first </h1>
			const afterH1 = bodyHtml.split("</h1>")[1];
			if (afterH1) {
				const strongMatch = afterH1.match(
					/<strong[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/strong>/i,
				);
				if (strongMatch) {
					company = strongMatch[1].replace(/<[^>]*>/g, "").trim();
				}
			}
		}

		if (!company) company = "Unknown Company";

		// ── Extract URL ──
		const url = extractIndeedUrl(bodyHtml ?? bodyClean ?? email.body);

		return [
			{
				platform: JobPlatform.INDEED,
				jobTitle,
				company,
				status: JobStatus.APPLIED,
				body: email.body,
				snippet: email.snippet,
				subject: email.subject,
				from: email.from,
				url,
				date: new Date(Number(email.internalDate)).toISOString(),
				emailId: email.id,
			},
		];
	},
};

/** Extract Indeed job posting URL from email body/HTML. */
function extractIndeedUrl(text: string): string {
	// 1. Prefer the `next` query param in the viewjob link (URL-encoded)
	const nextMatch = text.match(/[?&]next=(https?%3A%2F%2F[^&\s"']+)/i);
	if (nextMatch) {
		try {
			return decodeURIComponent(nextMatch[1]);
		} catch {
			// fall through
		}
	}

	// 2. Direct indeed.com/viewjob URL
	const directMatch = text.match(
		/(?:https?:\/\/)?(?:[a-z]+\.)?indeed\.com\/viewjob\?jk=\d+/i,
	);
	if (directMatch) {
		let url = directMatch[0];
		if (!url.startsWith("http")) url = "https://" + url;
		return url;
	}

	return "";
}
