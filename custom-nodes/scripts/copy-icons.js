/**
 * Copy node icons (.svg/.png) from src/ to dist/ after tsc compilation.
 *
 * n8n resolves `icon: 'file:ollama.svg'` relative to the compiled .node.js,
 * so the icon file must sit next to its .node.js in dist/. tsc alone only
 * emits .js/.d.ts — non-TypeScript assets need to be copied separately.
 */
const { cpSync, statSync } = require('node:fs');

cpSync('src/nodes', 'dist/nodes', {
	recursive: true,
	filter: (src) => {
		try {
			if (statSync(src).isDirectory()) return true;
		} catch {
			return false;
		}
		return /\.(svg|png)$/i.test(src);
	},
});

console.log('Copied icons: src/nodes → dist/nodes');
