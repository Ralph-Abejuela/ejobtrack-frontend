import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth";
import Header from "@/components/Header";
import GmailAuthModal from "@/components/GmailAuthModal";
import { Toaster } from "@/components/ui/sonner";

function RootLayout() {
	return (
		<AuthProvider>
			<Header />
			<main className="mx-auto max-w-3xl px-4 py-6">
				<Outlet />
			</main>
			<GmailAuthModal />
			<Toaster closeButton />
		</AuthProvider>
	);
}

export const Route = createRootRoute({ component: RootLayout });
