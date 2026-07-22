import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
	base: process.env.GITHUB_ACTIONS ? "/ejobtrack/" : "/",
	plugins: [tanstackRouter(), react(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		chunkSizeWarningLimit: 1000,
		rollupOptions: {
			onwarn(warning, warn) {
				if (warning.code === "EVAL" && /onnxruntime-web/.test(warning.id ?? ""))
					return;
				warn(warning);
			},
		},
	},
});
