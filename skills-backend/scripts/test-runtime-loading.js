const path = require('path');

const candidates = [
  path.resolve(process.cwd(), 'dist/src/services/topics/deep-article-generator.js'),
  path.resolve(process.cwd(), 'skills-backend/dist/src/services/topics/deep-article-generator.js'),
  path.resolve(__dirname, '../../../../dist/src/services/topics/deep-article-generator.js'),
  path.resolve(__dirname, '../../../dist/src/services/topics/deep-article-generator.js'),
  path.resolve(process.cwd(), 'runtime-assets/deep-article-generator.runtime.cjs'),
  path.resolve(process.cwd(), 'skills-backend/runtime-assets/deep-article-generator.runtime.cjs'),
];

console.log('Testing runtime module loading...');
console.log('cwd:', process.cwd());
console.log('');

let loadedModule = null;
for (const candidate of candidates) {
  try {
    console.log('Trying:', candidate);
    loadedModule = require(candidate);
    console.log('  SUCCESS');
    console.log('  Exports:', Object.keys(loadedModule));
    break;
  } catch (e) {
    console.log('  FAILED:', e.message);
  }
}

if (loadedModule) {
  console.log('\nModule loaded successfully');
  if (typeof loadedModule.generateNodeEnhancedArticle === 'function') {
    console.log('generateNodeEnhancedArticle: AVAILABLE');
  } else {
    console.log('generateNodeEnhancedArticle: MISSING');
  }
} else {
  console.log('\nNo runtime module could be loaded');
}
