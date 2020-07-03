const through = require('through2'),
fs = require('fs').promises,
PluginError = require('plugin-error'),
replaceAsync = require('string-replace-async'),
parseHtml = require('node-html-parser').parse;


module.exports = function(options = {}) {

	options = Object.assign({
		root: process.cwd(),
		attributes: ['src']
	}, options);
	options.regex = new RegExp(`<svg.*?(${options.attributes.join('|')}).*?></svg>`, 'g');

	const main = async contents => replaceAsync(contents, options.regex, async function(match, attr) {
		const sourceSvg = parseHtml(match).childNodes[0],
		path = sourceSvg.getAttribute(attr).replace(/^\//, `${options.root}/`);

		const file = await fs.open(path)
		.catch(function() {
			throw new Error(`Cannot open file: ${path}`);
		});
		const fileXml = await file.readFile();
		file.close();

		const fileSvg = parseHtml((fileXml + '').replace(/<\?xml.*?\?>/)).childNodes[0];
		if (!fileSvg.setAttribute)
			throw new Error(`Invalid svg: ${path}`);

		sourceSvg.removeAttribute(attr);
		sourceSvg.rawAttrs.replace(/([a-zA-Z]+)(\=".+?"|\='.+?'|\=\S+)?/g, function(match, key) {
			const value = sourceSvg.getAttribute(key);
			fileSvg.setAttribute(key, value);
			return match;
		});

		return fileSvg;
	});

	return through.obj(async function(file, enc, next) {
		if (file.isNull()) {
			next(null, file);
			return;
		}

		try {
			const contents = await main(file.contents.toString());
			file.contents = new Buffer(contents);
		} catch (error) {
			next(new PluginError('gulp-svg-free', error));
			return;
		}

		this.push(file);
		next();
	});

}