const path = require('path');

const candidates = [
    // Runtime CJS asset must be checked FIRST to avoid self-loading recursion
    path.resolve(process.cwd(), 'runtime-assets/deep-article-generator.runtime.cjs'),
    path.resolve(process.cwd(), 'skills-backend/runtime-assets/deep-article-generator.runtime.cjs'),
    // Compiled JS candidates (may self-reference in dev mode, use as fallback)
    path.resolve(process.cwd(), 'dist/src/services/topics/deep-article-generator.js'),
    path.resolve(process.cwd(), 'skills-backend/dist/src/services/topics/deep-article-generator.js'),
];

console.log('cwd:', process.cwd());
console.log('');
console.log('Testing candidates in order:');

for (const candidate of candidates) {
    try {
        console.log('Trying:', candidate);
        const mod = require(candidate);
        console.log('  SUCCESS');
        console.log('  Has generateNodeEnhancedArticle:', typeof mod.generateNodeEnhancedArticle === 'function');
        // If we got here, this is the module that would be loaded
        if (typeof mod.generateNodeEnhancedArticle === 'function') {
            console.log('  This is the correct runtime module!');
            break;
        }
    } catch (e) {
        console.log('  FAILED:', e.message.slice(0, 80));
    }
}
