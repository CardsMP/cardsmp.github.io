import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
	appType: "spa",
	root: "public",
	publicDir: false,

	resolve: {
		alias: {
			"@shared": path.resolve(process.cwd(), "shared/src"),
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
		proxy: {
			"/socket.io": {
				target: "http://localhost:8000",
				ws: true,
				changeOrigin: true,
			},
		},
	},
});
