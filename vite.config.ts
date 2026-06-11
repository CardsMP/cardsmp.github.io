import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import { cp } from "node:fs/promises";
import fs from "node:fs";
import { config } from "./shared/src/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

type PreloadAsset = {
	href: string;
};

function collectPreloadAssets(): PreloadAsset[] {
	const assetRoots = [
		{
			dir: path.resolve(rootDir, "public/cards"),
			urlBase: "cards",
		},
		{
			dir: path.resolve(rootDir, "public/img"),
			urlBase: "img",
		},
	];
	const extraFiles = [
		{
			file: path.resolve(rootDir, "public/favicon.ico"),
			href: "/favicon.ico",
		},
	];
	const seen = new Set<string>();
	const assets: PreloadAsset[] = [];

	function getPreloadTarget(
		relativePath: string,
		urlBase: string,
	): PreloadAsset | null {
		const ext = path.extname(relativePath).toLowerCase();
		const href = `/${urlBase}/${relativePath}`;
		if (
			[
				".avif",
				".gif",
				".ico",
				".jpeg",
				".jpg",
				".png",
				".svg",
				".webp",
			].includes(ext)
		)
			return { href };
		return null;
	}

	function visitDirectory(directoryPath: string, rootPath: string): void {
		for (const entry of fs.readdirSync(directoryPath, {
			withFileTypes: true,
		})) {
			const fullPath = path.join(directoryPath, entry.name);
			if (entry.isDirectory()) {
				visitDirectory(fullPath, rootPath);
				continue;
			}

			const relativePath = path
				.relative(rootPath, fullPath)
				.split(path.sep)
				.join("/");
			const urlBase = path.basename(rootPath);
			const preloadTarget = getPreloadTarget(relativePath, urlBase);
			if (!preloadTarget || seen.has(preloadTarget.href)) continue;

			seen.add(preloadTarget.href);
			assets.push(preloadTarget);
		}
	}

	for (const assetRoot of assetRoots) {
		if (fs.existsSync(assetRoot.dir))
			visitDirectory(assetRoot.dir, assetRoot.dir);
	}

	for (const { file: filePath, href } of extraFiles) {
		if (!fs.existsSync(filePath)) continue;
		if (seen.has(href)) continue;
		seen.add(href);
		assets.push({ href });
	}

	return assets.sort((a, b) => a.href.localeCompare(b.href));
}

function copyStaticAssetDirs() {
	return {
		name: "copy-static-asset-dirs",
		async closeBundle() {
			const distPublicDir = path.resolve(rootDir, "dist/public");
			const assetDirs = ["cards", "img"];

			await Promise.all(
				assetDirs.map((dir) =>
					cp(path.resolve(rootDir, "public", dir), path.join(distPublicDir, dir), {
						recursive: true,
					}),
				),
			);
		},
	};
}

function injectPreloadLinks() {
	const assets = collectPreloadAssets();

	return {
		name: "inject-preload-links",
		transformIndexHtml(html: string) {
			if (!assets.length) return html;

			const links = assets
				.map(({ href }) => {
					return `<link rel="preload" href="${href}" as="image" />`;
				})
				.join("\n\t");

			return html.replace(
				"</head>",
				`\t${links}\n\t</head>`,
			);
		},
	};
}

export default defineConfig({
	appType: "spa",
	root: "public",
	publicDir: false,
	plugins: [copyStaticAssetDirs(), injectPreloadLinks()],

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
		port: config.clientPort,
		allowedHosts: true,
		fs: {
			allow: [rootDir],
		},
		proxy: {
			"/socket.io": {
				target: `http://localhost:${config.serverPort}`,
				ws: true,
				changeOrigin: true,
			},
		},
	},
	preview: {
		host: "0.0.0.0",
		port: config.clientPort,
		strictPort: true,
	},
});
