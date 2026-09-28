import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const frontendRoot = fileURLToPath(new URL("./frontend", import.meta.url));

export default defineConfig({
	root: frontendRoot,
	plugins: [react()],
	server: {
		host: "127.0.0.1",
		port: 5173,
		proxy: {
			"/api": "http://127.0.0.1:3001",
		},
	},
	build: {
		outDir: "../dist/frontend",
		emptyOutDir: true,
	},
});