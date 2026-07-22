import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Inbox, ListChecks, GitMerge, Brain, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
	component: HeroPage,
});

const features = [
	{
		icon: Inbox,
		title: "Auto-scan inbox",
		description:
			"Detects application emails from JobStreet, LinkedIn, Indeed and more",
	},
	{
		icon: ListChecks,
		title: "Status timeline",
		description:
			"Tracks every status change from applied through to offer or rejection",
	},
	{
		icon: GitMerge,
		title: "Duplicate handling",
		description: "Auto-detects duplicates with merge and undo support",
	},
	{
		icon: Brain,
		title: "On-device AI",
		description: "Runs a transformer ML model locally to classify emails",
	},
] as const;

function HeroPage() {
	const navigate = useNavigate();

	return (
		<div className="flex flex-1 flex-col w-full">
			<div className="relative mx-auto max-w-2xl px-4 py-16 text-center">
				<div className="flex flex-col items-center gap-8">
					{/* Hero text */}
					<div className="flex flex-col items-center gap-4">
						<h1 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
							Track your job applications from Gmail
						</h1>
						<p className="mx-auto max-w-xl text-lg text-muted-foreground">
							ejobtrack connects to your inbox and automatically builds a
							dashboard of every job application. No backend. No setup. Your
							data stays in your browser.
						</p>
					</div>

					{/* CTA */}
					<Button
						size="lg"
						onClick={() => navigate({ to: "/jobs" })}
						className="gap-2 text-base"
					>
						Get started
						<ArrowRight data-icon="inline-end" />
					</Button>

					<Separator className="max-w-xs" />

					{/* Feature cards */}
					<div className="grid w-full grid-cols-2 gap-4 text-left">
						{features.map((f) => {
							const Icon = f.icon;
							return (
								<Card
									key={f.title}
									className="group transition-shadow hover:shadow-md"
								>
									<CardHeader>
										<div className="flex items-center gap-3">
											<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
												<Icon className="size-5" />
											</div>
											<CardTitle className="text-sm font-semibold">
												{f.title}
											</CardTitle>
										</div>
										<CardDescription className="mt-2 text-xs">
											{f.description}
										</CardDescription>
									</CardHeader>
								</Card>
							);
						})}
					</div>

					{/* Footer */}
					<div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
						<Link
							to="/privacy"
							className="underline underline-offset-2 transition-colors hover:text-foreground"
						>
							Privacy
						</Link>
						<Link
							to="/terms"
							className="underline underline-offset-2 transition-colors hover:text-foreground"
						>
							Terms
						</Link>
						<a
							href="https://github.com/Ralph-Abejuela/ejobtrack"
							className="underline underline-offset-2 transition-colors hover:text-foreground"
						>
							GitHub
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
