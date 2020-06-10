const through = require('through2'),
fs = require('fs').promises,
replaceAsync = require('string-replace-async'),
parseHtml = require('node-html-parser').parse,
{parse: parseXml, stringify: stringifyXml} = require('xml-parse'),
minifyXml = require('xml-minifier').minify;


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

		sourceSvg.removeAttribute(attr);
		const fileXml = parseXml(await file.readFile() + '');
		file.close();

		const fileSvg = fileXml.find(function findSvg(xml) {
			if (xml.tagName === 'svg')
				return true;
			return xml.childNodes.find(child => findSvg(child));
		});

		sourceSvg.rawAttrs.replace(/([a-zA-Z]+)(\=".+?"|\='.+?'|\=\S+)?/g, function(match, key) {
			const value = sourceSvg.getAttribute(key);
			fileSvg.attributes[key] = value;
			return match;
		});

		return minifyXml(stringifyXml([fileSvg]));
	});

	return through.obj(async function(file, enc, next) {
		if (file.isNull()) {
			next(null, file);
			return;
		}

		const contents = await main(file.contents.toString());
		file.contents = new Buffer(contents);

		this.push(file);
		next();
	});

}