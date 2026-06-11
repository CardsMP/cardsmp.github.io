import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	appType: "spa",
	root: "public",
	publicDir: false,

	resolve: {
		alias: {
			"@shared": path.resolve(rootDir, "shared/src"),
		},
	},

	build: {
		outDir: "../dist/public",
		emptyOutDir: true,
	},

	server: {
		host: "0.0.0.0",
		port: 3000,
		allowedHosts: true,
		fs: {
			allow: [rootDir],
		},
		proxy: {
			"/socket.io": {
				target: "http://localhost:8000",
				ws: true,
				changeOrigin: true,
			},
		},
	},
});
