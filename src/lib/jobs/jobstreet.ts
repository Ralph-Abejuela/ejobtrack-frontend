import { JobPlatform, JobStatus, type JobPlatformParser } from "./types";

/**
 * Parser for JobStreet application emails (noreply@e.jobstreet.com).
 *
 * Email types detected:
 *   - Application submitted (confirmation)
 *   - Application viewed (employer viewed resume)
 *   - Application rejected / unsuccessful
 *   - Interview invitation
 *
 * Patterns used (subject, snippet, body):
 *   - Subject: "Your application was successfully submitted"
 *   - Subject: "{Company} has viewed your application for {Role}"
 *   - Subject: "Application update for {Role} at {Company}"
 *   - Subject: "the {Role} job with {Company} has closed"
 *   - Snippet/Body: "your application for {Role} was successfully submitted to {Company}"
 *   - Snippet/Body: "your application for {Role} advertised by {Company}"
 *   - Snippet/Body: "your application for {Role} is unlikely to progress"
 *   - Snippet/Body: "it appears your application for {Role}"
 *   - Snippet/Body: "{Company} has viewed your application for {Role}"
 *   - Snippet/Body: "{Company} viewed your application for {Role}"
 *   - Snippet/Body: "interest in the {Role} (position|job) at {Company}"
 *   - Snippet/Body: "position as {Role} at {Company}"
 */
export const jobstreetParser: JobPlatformParser = {
	platform: JobPlatform.JOBSTREET,
	fromAddresses: ["noreply@e.jobstreet.com"],
	ignorePatterns: [
		/is still accepting applications|don't forget to (?:submit|apply)|complete the application you have started|application started/i,
	],

	parse(email) {
		// ── Bulk activity summary ──
		if (/new activity in jobs you applied for/i.test(email.subject)) {
			return parseBulkActivity(email);
		}

		const { subject, snippet, body, bodyClean } = email;

		let jobTitle = "";
		let company = "";
		let status = JobStatus.APPLIED;

		const lowerSubject = subject.toLowerCase().replace(/\s+/g, " ");
		const lowerSnippet = snippet.toLowerCase().replace(/\s+/g, " ");
		// Merge bodyClean (sanitized HTML) into body for richer text scanning
		const richBody = bodyClean ? `${body} ${bodyClean}` : body;
		const lowerBody = richBody.toLowerCase().replace(/\s+/g, " ");

		// ── Status detection: check subject first ──

		// Viewed subject: "{Company} has viewed your application for {Role}"
		const viewedSubjectMatch = lowerSubject.match(
			/(.+?)\s+has viewed your application\s+(?:for\s+(.+?))?$/i,
		);
		if (viewedSubjectMatch) {
			company = viewedSubjectMatch[1].trim();
			jobTitle = (viewedSubjectMatch[2] ?? "").trim();
			status = JobStatus.VIEWED;
		}

		// Application update (could be rejection or interview) — check body later
		const updateSubjectMatch = lowerSubject.match(
			/application update (?:for\s+(.+?)\s+(?:at|with)\s+(.+?))?$/i,
		);
		if (updateSubjectMatch) {
			if (updateSubjectMatch[1]) jobTitle = updateSubjectMatch[1].trim();
			if (updateSubjectMatch[2]) company = updateSubjectMatch[2].trim();
			// Status determined from body
		}

		// Job closed/expired subject: "the {Role} job with {Company} has closed"
		const closedSubjectMatch = lowerSubject.match(
			/the (.+?) job with (.+?) has closed/i,
		);
		if (closedSubjectMatch) {
			if (!jobTitle) jobTitle = closedSubjectMatch[1].trim();
			if (!company) company = closedSubjectMatch[2].trim();
			status = JobStatus.REJECTED;
		}

		// ── Extract from snippet patterns ──

		if (!jobTitle || !company) {
			// "your application for {Role} was successfully submitted to {Company}"
			const appSnippet = lowerSnippet.match(
				/your application for (.+?) was successfully submitted to (.+?)(?:\s|$)/i,
			);
			if (appSnippet) {
				if (!jobTitle) jobTitle = appSnippet[1].trim();
				if (!company) company = appSnippet[2].trim();
			}

			// "it appears your application for {Role} advertised by {Company}"
			// "it appears your application for {Role} at {Company}"
			if (!jobTitle) {
				const appearsSnippet = lowerSnippet.match(
					/your (?:application for (.+?) (?:advertised by|at) (.+?))(?:\s|$)/i,
				);
				if (appearsSnippet) {
					if (!jobTitle) jobTitle = appearsSnippet[1].trim();
					if (!company) company = appearsSnippet[2].trim();
				}
			}

			// "{Company} has viewed your application for {Role}"
			if (!jobTitle) {
				const viewedSnippet = lowerSnippet.match(
					/(.+?)\s+has viewed your application for (.+?)(?:\s|$)/i,
				);
				if (viewedSnippet) {
					if (!company) company = viewedSnippet[1].trim();
					if (!jobTitle) jobTitle = viewedSnippet[2].trim();
				}
			}

			// "{Company} viewed your application for {Role}"
			if (!jobTitle) {
				const viewedSnippet2 = lowerSnippet.match(
					/(.+?)\s+viewed your application for (.+?)(?:\s|$)/i,
				);
				if (viewedSnippet2) {
					if (!company) company = viewedSnippet2[1].trim();
					if (!jobTitle) jobTitle = viewedSnippet2[2].trim();
				}
			}
		}

		// ── Extract from body patterns ──

		if (!jobTitle) {
			// "your application for {Role} was successfully submitted to {Company}"
			const appBodyMatch = lowerBody.match(
				/your application for (.+?) was successfully submitted to (.+?)(?:\.|\n|$)/i,
			);
			if (appBodyMatch) {
				jobTitle = appBodyMatch[1].trim();
				if (!company) company = appBodyMatch[2].trim();
			}
		}

		if (!jobTitle) {
			// "interest in the {Role} position at {Company}"
			const interestMatch = lowerBody.match(
				/interest in the (.+?)\s+(?:position|job|role)\s+(?:at|with)\s+(.+?)(?:\.|\n|$)/i,
			);
			if (interestMatch) {
				jobTitle = interestMatch[1].trim();
				if (!company) company = interestMatch[2].trim();
			}
		}

		if (!jobTitle) {
			// "for the {Role} job at {Company}"
			const forJobMatch = lowerBody.match(
				/for the (.+?)\s+(?:position|job|role)\s+(?:at|with)\s+(.+?)(?:\.|\n|$)/i,
			);
			if (forJobMatch) {
				jobTitle = forJobMatch[1].trim();
				if (!company) company = forJobMatch[2].trim();
			}
		}

		// "position as {Role} at {Company}"
		if (!jobTitle) {
			const posMatch = lowerBody.match(
				/position as (.+?)\s+(?:at|with)\s+(.+?)(?:\.|\n|$)/i,
			);
			if (posMatch) {
				jobTitle = posMatch[1].trim();
				if (!company) company = posMatch[2].trim();
			}
		}

		// "the {Role} job you applied for at {Company} has expired/closed"
		if (!jobTitle) {
			const closedBodyMatch = lowerBody.match(
				/the (.+?) job you applied for at (.+?) has (?:expired|closed)/i,
			);
			if (closedBodyMatch) {
				if (!jobTitle) jobTitle = closedBodyMatch[1].trim();
				if (!company) company = closedBodyMatch[2].trim();
				status = JobStatus.REJECTED;
			}
		}

		// "your application for {Role}" without company
		if (!jobTitle) {
			const appMatch = lowerBody.match(
				/your application for (.+?)(?:\.|\n|was|has|advertised)/i,
			);
			if (appMatch) {
				jobTitle = appMatch[1]
					.trim()
					.replace(/\s+at\s+.+$/i, "")
					.trim();
			}
		}

		if (!company) {
			// Try to extract company from "at {Company}" patterns in body
			const atMatch = lowerBody.match(
				/(?:at|advertised by|with)\s+([A-Z][A-Za-z0-9\s.'&,-]+?)(?:\.|\n|,|\s+has|\s+for|$)/,
			);
			if (atMatch) {
				company = atMatch[1].trim();
			}
		}

		// ── Status detection from body content ──

		if (status === JobStatus.APPLIED || !status) {
			// Rejection / Unsuccessful
			if (
				/unlikely to (?:progress|further|move forward)/i.test(
					lowerSubject + " " + lowerSnippet + " " + lowerBody,
				) ||
				/(?:looks|appears)\s+unlikely/i.test(
					lowerSubject + " " + lowerSnippet + " " + lowerBody,
				) ||
				/unsuccessful|unfortunately|not moving forward|not selected|regret to inform|has expired|has closed|no longer taking applications/i.test(
					lowerSubject + " " + lowerSnippet + " " + lowerBody,
				)
			) {
				status = JobStatus.REJECTED;
			}

			// Interview
			if (
				/interview|scheduled for interview|invited to interview|phone screen/i.test(
					lowerSubject + " " + lowerSnippet + " " + lowerBody,
				)
			) {
				status = JobStatus.INTERVIEW;
			}

			// Viewed (if not already detected)
			if (
				status === JobStatus.APPLIED &&
				(/has viewed your application|viewed your application for/i.test(
					lowerSubject + " " + lowerSnippet,
				) ||
					/your application was viewed/i.test(
						lowerSubject + " " + lowerSnippet,
					))
			) {
				status = JobStatus.VIEWED;
			}
		}

		if (!jobTitle) return null;

		return [
			{
				platform: JobPlatform.JOBSTREET,
				jobTitle,
				company: company || "Unknown Company",
				status,
				body: email.body,
				snippet: email.snippet,
				subject: email.subject,
				from: email.from,
				url: extractJobstreetUrl(email.body),
				date: new Date(Number(email.internalDate)).toISOString(),
				emailId: email.id,
			},
		];
	},
};

/**
 * Parse a mangled date like "14Jul" with the email's year.
 * If the constructed date is after the email date (e.g. Dec job with Jan email),
 * we guessed the wrong year — use the previous year instead.
 */
function parseMangledDate(mangled: string, emailInternalDate: string): string {
	const dayMatch = mangled.match(/^(\d{1,2})/);
	const monthMatch = mangled.match(/[A-Za-z]{3}/);
	if (!dayMatch || !monthMatch) {
		return new Date(Number(emailInternalDate)).toISOString();
	}

	const day = Number(dayMatch[1]);
	const monthAbbr = monthMatch[0];
	const monthStr =
		monthAbbr.charAt(0).toUpperCase() + monthAbbr.slice(1).toLowerCase();

	const emailDate = new Date(Number(emailInternalDate));
	const emailYear = emailDate.getFullYear();

	// Build date with the email's year
	let candidate = new Date(`${monthStr} ${day}, ${emailYear}`);

	// If candidate is in the future (relative to email), the job was applied
	// in the previous year (job applications are always in the past)
	if (candidate.getTime() > emailDate.getTime()) {
		candidate = new Date(`${monthStr} ${day}, ${emailYear - 1}`);
	}

	if (!isNaN(candidate.getTime())) {
		return candidate.toISOString();
	}

	return new Date(Number(emailInternalDate)).toISOString();
}

/** Extract job posting URL from JobStreet email body. */
function extractJobstreetUrl(body: string): string {
	const match = body.match(
		/(?:https?:\/\/)(?:[a-z]+\.)?jobstreet\.com\/[^\s]+/i,
	);
	if (match) return match[0];
	return "";
}

/**
 * Parse bulk activity summary email with multiple job entries.
 *
 * Body format:
 *   {JobTitle}
 *   {Company}
 *   (blank)
 *   {Status}     ("Reviewing applications" → VIEWED | "Job no longer advertised" → REJECTED)
 *   (blank)
 *   [{URL}]
 *   (blank)
 *   Applied on {date}    (date has spaces between every char e.g. "1 4 J u l" = "14 Jul")
 *
 * Each entry is followed by extra tracking URLs / "logo" before the next entry.
 */
function parseBulkActivity(email: {
	from: string;
	subject: string;
	snippet: string;
	body: string;
	id: string;
	internalDate: string;
}): ReturnType<JobPlatformParser["parse"]> {
	const results: ReturnType<JobPlatformParser["parse"]> = [];
	// Normalize CRLF → LF (Gmail API uses \r\n)
	const body = email.body.replace(/\r\n/g, "\n");

	// Find entries: {Title}\n{Company}\n\n(?:[{URL}]\n\n)?{Status}\n\n(?:[{URL}])?
	// Status before URL pattern: Title\nCompany\n\nReviewing\n\n[URL]
	// Status after URL pattern:  Title\nCompany\n\n[URL]\n\nJob no longer\n\n[URL]
	const entryRegex =
		/^([A-Za-z0-9][^\n]{1,100})\n([A-Za-z0-9][^\n]{1,100})\n\n(?:\[([^\]]*)\]\n\n)?(Reviewing applications|Job no longer advertised)\n\n(?:\[([^\]]*)\])?/gim;

	const reEntry = new RegExp(entryRegex.source, "gim");

	let match: RegExpExecArray | null;
	while ((match = reEntry.exec(body)) !== null) {
		const jobTitle = match[1].trim();
		const company = match[2].trim();
		const statusText = match[4].trim();

		let status: JobStatus;
		let url: string;
		if (/reviewing applications/i.test(statusText)) {
			status = JobStatus.VIEWED;
			// For "Reviewing applications": the URL right after status is an icon/tracking URL.
			// The real job posting URL is after the "Applied on" line.
			const slice = body.slice(match.index + match[0].length);
			const jobUrlMatch = slice.match(/Applied on[^\n]*\n\n\[([^\]]*)\]/i);
			url = jobUrlMatch ? jobUrlMatch[1].trim() : "";
		} else {
			status = JobStatus.REJECTED;
			// "Job no longer advertised": URL after status IS the job link.
			url = (match[5] ?? "").trim();
		}

		// Look for "Applied on {mangledDate}" after the matched block
		const slice = body.slice(match.index + match[0].length);
		const dateMatch = slice.match(/Applied on\s+([^\n]+)/i);
		const rawDate = dateMatch ? dateMatch[1].trim() : "";
		// De-space mangled dates like "1 4 J u l" → "14Jul"
		const cleanDate = rawDate.replace(/\s+/g, "");

		const finalDate = cleanDate
			? parseMangledDate(cleanDate, email.internalDate)
			: new Date(Number(email.internalDate)).toISOString();

		results.push({
			platform: JobPlatform.JOBSTREET,
			jobTitle,
			company,
			status,
			body: email.body,
			snippet: email.snippet,
			subject: email.subject,
			from: email.from,
			url,
			date: finalDate,
			emailId: email.id,
		});
	}

	return results.length > 0 ? results : null;
}
