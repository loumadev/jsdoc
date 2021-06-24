const fs = require("fs");
const {default: PCRE} = require("@stephen-riley/pcre2-wasm");


const REGEX = {};

REGEX.js_comment = String.raw`(\/\*\*(?:(?!\*\/)[\s\S])+?\*\/)[\s]*?`;
REGEX.js_tag_description = String.raw`(?:\s*?([\s\S]+?)(?=\*\s*@|\*\/))?`;
REGEX.js_name = String.raw`[a-zA-Z_$][\w$]*`;
REGEX.js_type = regexBetween("{", "}");
REGEX.js_parameter_optional = regexBetween("[", "]");
REGEX.js_parameter_list = regexBetween("(", ")");

REGEX.class = String.raw`(?<jsdoc>${REGEX.js_comment})?class(?:\s+(?<name>${REGEX.js_name}))?(?:\s+extends\s+(?<extends>${REGEX.js_name}))?\s*\{`;
REGEX.class_constructor = String.raw`(?<jsdoc>${REGEX.js_comment})?constructor\s*${REGEX.js_parameter_list}\s*\{`;
REGEX.class_property = String.raw`(?<jsdoc>${REGEX.js_comment})(?:(?<isStatic>static)\s+|this\.)(?!${REGEX.js_name}\()(?<name>${REGEX.js_name})`;
REGEX.class_method = String.raw`(?<jsdoc>${REGEX.js_comment})(?:(?<isStatic>static)\s+)?(?:(?<isAsync>async)\s+)?(?:\s*(?<isGenerator>\*)\s*)?(?<name>${REGEX.js_name})\s*${REGEX.js_parameter_list}\s*\{`;

REGEX.jsdoc_description = String.raw`\/\*\*\s*?\*(?!\s*?@)(?<desc>${REGEX.js_tag_description})`;
REGEX.jsdoc_parameter = String.raw`@param(?:eter)?\s+(?<type>${REGEX.js_type})\s+(?:(?<optional>${REGEX.js_parameter_optional})|(?<name>${REGEX.js_name}))(?<desc>${REGEX.js_tag_description})`;
REGEX.jsdoc_type = String.raw`@type\s+(?<type>${REGEX.js_type})`;
REGEX.jsdoc_return = String.raw`@returns?\s+(?<type>${REGEX.js_type})(?<desc>${REGEX.js_tag_description})`;
REGEX.jsdoc_deprecated = String.raw`@deprecated\s+(?<desc>${REGEX.js_tag_description})`;
REGEX.jsdoc_padding = String.raw`(?<padding>\s*\*)\s*`;

REGEX.jsdoc_tag_access = String.raw`@(access\s+)?(?<access>package|private|protected|public)`;
REGEX.jsdoc_tag_abstract = String.raw`@(abstract|virtual)`;
REGEX.jsdoc_tag_async = String.raw`@async`;
REGEX.jsdoc_tag_author = String.raw`@author\s+(?<desc>${REGEX.js_tag_description})`;
REGEX.jsdoc_tag_copyright = String.raw`@copyright\s+(?<desc>${REGEX.js_tag_description})`;
REGEX.jsdoc_tag_generator = String.raw`@generator`;
REGEX.jsdoc_tag_hideconstructor = String.raw`@hideconstructor`;
REGEX.jsdoc_tag_ignore = String.raw`@ignore`;
REGEX.jsdoc_tag_license = String.raw`${REGEX.jsdoc_padding}@license\s+(?<desc>${REGEX.js_tag_description})`;
REGEX.jsdoc_tag_static = String.raw`@static`;
REGEX.jsdoc_tag_throws = String.raw`@(throws|exception)?\s+(?<type>${REGEX.js_type})?(?<desc>${REGEX.js_tag_description})`;
REGEX.jsdoc_tag_todo = String.raw`@todo\s+(?<desc>${REGEX.js_tag_description})`;
REGEX.jsdoc_tag_version = String.raw`@version\s+(?<desc>${REGEX.js_tag_description})`;
REGEX.jsdoc_tag_yields = String.raw`@yields?\s+(?<type>${REGEX.js_type})(?<desc>${REGEX.js_tag_description})`;

function regexBetween(opening = "(", closing = ")") {
	return String.raw`(${"\\"}${opening}(?:((["'${"`"}])(?:\\\g{-1}|[\s\S])*?\g{-1}|[^${closing}${opening}])+|(?-3))*+${"\\"}${closing})`;
}

//console.log(REGEX.jsdoc_return);


(async () => {
	await PCRE.init();

	console.log(`Compiling regexes...`);
	for(const name in REGEX) {
		REGEX[name] = new PCRE(REGEX[name]);
	}
	console.log(`Regexes compiled`);

	console.log(`Processing...`);
	main(file);
	console.log(`Done`);

	console.log(`Freeing regexes...`);
	for(const name in REGEX) {
		REGEX[name].destroy();
	}
	console.log(`Regexes freed`);
})();

function main(path) {
	function escapeRegExp(string) {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	function addTag(src, tag, state = true) {
		if(tag instanceof Array) {
			if(tag[1] && typeof tag[1] === "string") {
				src.tags.push(...tag);
			} else {
				for(const [tag, state] of [...arguments].slice(1)) {
					if(state && tag && !src.tags.includes(tag)) src.tags.push(tag);
				}
			}
		}
		else if(state && tag && !src.tags.includes(tag)) src.tags.push(tag);

		return src;
	}

	function addTagsFromJSdoc(src, jsdoc) {
		//Tags
		addTag(src, "abstract", REGEX.jsdoc_tag_abstract.match(jsdoc));
		addTag(src, "async", REGEX.jsdoc_tag_async.match(jsdoc));
		addTag(src, "generator", REGEX.jsdoc_tag_generator.match(jsdoc));
		addTag(src, "hideconstructor", REGEX.jsdoc_tag_hideconstructor.match(jsdoc));
		addTag(src, "ignore", REGEX.jsdoc_tag_ignore.match(jsdoc));
		addTag(src, "static", REGEX.jsdoc_tag_static.match(jsdoc));

		const access = REGEX.jsdoc_tag_access.match(jsdoc);
		addTag(src, access?.["access"]?.match?.trim(), access);

		//Props
		{
			const match = REGEX.jsdoc_tag_author.match(jsdoc);
			const desc = match?.["desc"]?.match?.trim();

			if(match) {
				src["author"] = desc || null;
			}
		}
		{
			const match = REGEX.jsdoc_tag_copyright.match(jsdoc);
			const desc = match?.["desc"]?.match?.trim();

			if(match) {
				src["copyright"] = desc || null;
			}
		}
		{
			const match = REGEX.jsdoc_tag_license.match(jsdoc);

			if(match) {
				const padding = match?.["padding"]?.match;
				const desc = match?.["desc"]?.match?.replace(new RegExp(escapeRegExp(padding), "g"), "\n")?.trim();

				src["license"] = desc || null;
			}
		}
		{
			const match = REGEX.jsdoc_tag_version.match(jsdoc);
			const desc = match?.["desc"]?.match?.trim();

			if(match) {
				src["version"] = desc || null;
			}
		}
		{
			const match = REGEX.jsdoc_tag_yields.match(jsdoc);
			const type = match?.["type"]?.match?.slice(1, -1)?.replace(/\s{2,}/g, " ")?.trim();
			const desc = match?.["desc"]?.match?.trim();

			if(match) {
				src["yields"] = {
					type: type || null,
					desc: desc || null
				};
			}
		}
		{
			const match = REGEX.jsdoc_tag_throws.match(jsdoc);
			const type = match?.["type"]?.match?.slice(1, -1)?.replace(/\s{2,}/g, " ")?.trim();
			const desc = match?.["desc"]?.match?.trim();

			if(match) {
				src["throws"] = {
					type: type || null,
					desc: desc || null
				};
			}
		}
		{
			const todos = REGEX.jsdoc_tag_todo.matchAll(jsdoc).map(e => e?.["desc"]?.match?.trim() || null).filter(e => e);
			src["todo"] = todos;
		}

		return src;
	}

	function matchParameters(input) {
		return REGEX.jsdoc_parameter.matchAll(input).map(e => {
			const optional = e?.["optional"]?.match;
			let name = e?.["name"]?.match;
			let defaultValue = null;

			if(optional) {
				const match = optional.match(/\[(?<name>[\s\S]+?)(?:=(?<default>[\s\S]+))?\]/);
				name = match.groups["name"];
				defaultValue = match.groups["default"] || null;
			}

			const obj = {
				name: name,
				type: e?.["type"]?.match?.slice(1, -1)?.replace(/\s{2,}/g, " ")?.trim() || "any",
				desc: e?.["desc"]?.match?.trim() || null,
				defaultValue: defaultValue,
				tags: []
			};

			addTag(obj, "optional", optional);

			return obj;
		});
	}

	function matchConstructor(input) {
		const jsdoc = REGEX.class_constructor.match(input)?.["jsdoc"]?.match;

		const obj = {
			name: "constructor",
			desc: REGEX.jsdoc_description.match(jsdoc)?.["desc"]?.match?.trim() || null,
			deprecated: null,
			params: matchParameters(jsdoc),
			return: {
				type: "void",
				desc: null
			},
			tags: [],
			// isStatic: false,
			// isAsync: false,
			_jsdoc: jsdoc
		};

		addTag(obj, "static", false);
		addTag(obj, "async", false);

		return obj;
	}

	const content = fs.readFileSync(path).toString();
	const doc = {
		classes: [],
		types: []
	};

	const classes = REGEX.class.matchAll(content).map(e => ({
		name: e?.["name"]?.match,
		extends: e?.["extends"]?.match,
		properties: [],
		methods: [],
		tags: [],
		//isStatic: false,
		_body: null,
		_jsdoc: e?.["jsdoc"]?.match,
		_index: e[0].start - 1,
		_length: e[0].match.length
	}));


	for(const cls of classes) {
		const buffer = matchBlock(content, cls._index + cls._length);

		cls._body = buffer;
		//continue;
		//cls.isStatic = !/constructor\(.*?\)\s*{/.test(cls._body);
		cls.desc = REGEX.jsdoc_description.match(cls._jsdoc)?.["desc"]?.match?.trim() || null;

		cls.constr = matchConstructor(cls._body);
		cls.constr.return.type = cls.name;

		addTag(cls, "static", !/constructor\(.*?\)\s*{/.test(cls._body));

		cls.properties = REGEX.class_property.matchAll(cls._body).map(e => addTag({
			name: e?.["name"]?.match,
			type: "any",
			desc: null,
			deprecated: null,
			//isStatic: !!e?.["isStatic"]?.match || cls.isStatic,
			tags: [],
			_jsdoc: e?.["jsdoc"]?.match
		},
			["static", e?.["isStatic"]?.match || cls.isStatic]
		));
		cls.methods = REGEX.class_method.matchAll(cls._body).map(e => addTag({
			name: e?.["name"]?.match,
			desc: null,
			deprecated: null,
			params: [],
			tags: [],
			return: {
				type: "void",
				desc: null
			},
			//isStatic: !!e?.["isStatic"]?.match,
			//isAsync: !!e?.["isAsync"]?.match,
			_jsdoc: e?.["jsdoc"]?.match
		},
			["static", e?.["isStatic"]?.match],
			["async", e?.["isAsync"]?.match],
			["generator", e?.["isGenerator"]?.match]
		)).filter(e => !["constructor", "super"].includes(e.name));

		cls.properties.forEach(prop => {
			prop.type = REGEX.jsdoc_type.match(prop._jsdoc)?.["type"]?.match?.slice(1, -1)?.replace(/\s{2,}/g, " ")?.trim() || "any";
			prop.desc = REGEX.jsdoc_description.match(prop._jsdoc)?.["desc"]?.match?.trim() || null;
			prop.deprecated = REGEX.jsdoc_deprecated.match(prop._jsdoc)?.["desc"]?.match?.trim() || null;

			addTagsFromJSdoc(prop, prop._jsdoc);
		});
		cls.methods.forEach(met => {
			met.desc = REGEX.jsdoc_description.match(met._jsdoc)?.["desc"]?.match?.trim() || null;
			met.deprecated = REGEX.jsdoc_deprecated.match(met._jsdoc)?.["desc"]?.match?.trim() || null;

			met.params = matchParameters(met._jsdoc);

			// met.returns = REGEX.jsdoc_return.matchAll(met._jsdoc).map(e => ({
			// 	type: e?.["type"]?.match?.slice(1, -1)?.replace(/\s{2,}/g, " ")?.trim(),
			// 	desc: e?.["desc"]?.match?.trim() || null
			// }));
			var match = REGEX.jsdoc_return.match(met._jsdoc);
			met.return = {
				type: match?.["type"]?.match?.slice(1, -1)?.replace(/\s{2,}/g, " ")?.trim() || "void",
				desc: match?.["desc"]?.match?.trim() || null
			};

			addTagsFromJSdoc(met, met._jsdoc);
		});
	}

	fs.writeFileSync(__dirname + "/output.json", JSON.stringify(classes, null, "\t"));


	function formatType(type) {
		return type;
		//return classes.find(e => e.name == type) ? `[\`${type}\`](#${type})` : type;
	}
	function formatMethod(e) {
		return `${e.isStatic ? "static " : ""}${e.isAsync ? "async " : ""}${e.name}(${e.params.map(t => `${t.name}: ${formatType(t.type)}`).join(", ")}): ${formatType(e.return.type)}`;
	}
	function formatParameters(e) {
		return e.map(t => `\`${t.name}: ${formatType(t.type)}\` | ${t.desc || "_No description_"}`).join("\n");
	}



	var str = ``;

	for(const cls of classes) {
		str += `## Class \`${cls.name}\`
${cls.extends ? `Subclass of \`${formatType(cls.extends)}\`\n` : ""}
${cls.desc || "_This class does not contain any description_\n"}

### Constructor
${cls.constr.desc || ""}
\`\`\`typescript
${formatMethod(cls.constr)}
\`\`\`
${cls.constr.params.length ? `##### Parameters
Parameter | Description
--- | ---
${formatParameters(cls.constr.params)}
` : ""}


### Properties
Property | Description
--- | ---
${cls.properties.map(e => `\`${e.name}: ${formatType(e.type)}\` | ${e.desc || "_No description_"}`).join("\n") || "_This class does not contain any properties_\n"}


### Methods
${cls.methods.map(e => `#### ${cls.name}.${e.name}()
\`\`\`typescript
${formatMethod(e)}
\`\`\`


##### Parameters
${e.params.length ? `Parameter | Description
--- | ---
` + formatParameters(e.params) : "_This method does not require any parameters_\n"}
`).join("\n") || "_This class does not contain any methods_\n"}

---


`;
	}

	fs.writeFileSync(__dirname + "/output.md", str);
}

function matchBlock(string, index) {
	var buffer = "";
	var char = "";
	var layer = -1;

	while(char = string[index++]) {
		if(char == "{") layer++;
		if(char == "}") layer--;

		buffer += char;

		if(layer == -1) break;
	}

	return buffer;
}