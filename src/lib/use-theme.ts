import { useContext } from "react";
import { Ctx } from "./theme-provider";

export function useTheme() {
	const ctx = useContext(Ctx);
	if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
	return ctx;
}
