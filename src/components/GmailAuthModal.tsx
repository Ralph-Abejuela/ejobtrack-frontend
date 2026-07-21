import { useAuth } from "@/lib/auth";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Mail, Loader2, LogOut, ShieldAlert } from "lucide-react";

/**
 * Blocking modal that forces the user to grant Gmail read-only access.
 * User must click "Authorize" — no auto-trigger (browsers block popups).
 * Non-dismissable — only "Authorize" or "Sign Out" buttons.
 */
export default function GmailAuthModal() {
	const { user, accessToken, requestingScope, requestGmailScope, signOut } =
		useAuth();

	const show = !!user && !accessToken;

	if (!show) return null;

	return (
		<AlertDialog open={show} onOpenChange={() => {}}>
			<AlertDialogContent size="default" className="max-w-sm sm:max-w-md">
				<AlertDialogMedia>
					<ShieldAlert className="size-8 text-amber-500" />
				</AlertDialogMedia>

				<AlertDialogHeader>
					<AlertDialogTitle>Gmail Access Required</AlertDialogTitle>
					<AlertDialogDescription>
						ejobtrack needs read-only access to your Gmail inbox to scan for job
						application updates from JobStreet and LinkedIn.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter>
					<div className="flex w-full flex-col gap-2">
						<AlertDialogAction
							onClick={requestGmailScope}
							disabled={requestingScope}
							className="w-full gap-2"
						>
							{requestingScope ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Mail className="size-4" />
							)}
							{requestingScope
								? "Waiting for consent…"
								: "Authorize Gmail Access"}
						</AlertDialogAction>
						<Button
							variant="outline"
							onClick={signOut}
							disabled={requestingScope}
							className="w-full gap-2 text-muted-foreground"
						>
							<LogOut className="size-4" />
							Sign Out
						</Button>
					</div>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
