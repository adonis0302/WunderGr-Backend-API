import {
	parse,
	visit,
	print,
	Kind,
	NamedTypeNode,
	TypeDefinitionNode,
	FieldDefinitionNode,
	DirectiveDefinitionNode,
	ASTVisitor,
} from 'graphql';
import fs from 'node:fs';
import path from 'node:path';

import { doNotEditHeader, Template, TemplateOutputFile } from '../../index';
import { CodeGenerationConfig } from '../../../configure';
import { Logger } from '../../../logger';
import { formatTypeScript } from './index';
import { schemasTemplate, ormTemplate, emptyOrm } from './orm.template';

import Handlebars from 'handlebars';

import { codegen } from '@wundergraph/orm';

// @todo move to utils or import from existing dependency
const toTitleCase = (string: string) => string[0].toUpperCase() + string.substring(1).toLowerCase();

type Renamable = TypeDefinitionNode | FieldDefinitionNode | DirectiveDefinitionNode | NamedTypeNode;

// @todo replace with `Api.renameTypes*` facilities?
const rename =
	(prefix: string) =>
	(node: Renamable): Renamable => {
		if (node.name.value.startsWith(prefix)) {
			return {
				...node,
				name: { ...node.name, value: node.name.value.replace(prefix, '') },
			};
		} else {
			return node;
		}
	};

const Renamer: (prefix: string) => ASTVisitor = (prefix) => ({
	[Kind.INTERFACE_TYPE_DEFINITION]: rename(prefix),
	[Kind.UNION_TYPE_DEFINITION]: rename(prefix),
	[Kind.OBJECT_TYPE_DEFINITION]: rename(prefix),
	[Kind.INPUT_OBJECT_TYPE_DEFINITION]: rename(prefix),
	[Kind.ENUM_TYPE_DEFINITION]: rename(prefix),
	[Kind.SCALAR_TYPE_DEFINITION]: rename(prefix),
	[Kind.FIELD_DEFINITION]: rename(prefix),
	[Kind.DIRECTIVE_DEFINITION]: rename(prefix),
	[Kind.NAMED_TYPE]: rename(prefix),
});

// @note the ORM does not currently support joining across APIs
const JoinStripper: ASTVisitor = {
	[Kind.FIELD_DEFINITION]: (node) => {
		return node.name.value === '_join' ? null : node;
	},
};

export class ORM implements Template {
	static MODULE_DIR = 'orm';
	static SCHEMA_MODULES_PATH = `${ORM.MODULE_DIR}/schemas`;
	static BUILD_INFO_FILENAME = 'orm.build_info.json';

	generate(generationConfig: CodeGenerationConfig): Promise<TemplateOutputFile[]> {
		// record the checksum of the WunderGraph schema we last generated the ORM for
		const buildInfo = {
			schemaSha256: generationConfig.config.application.EngineConfiguration.schemaSha256,
			disabled: !generationConfig.config.experimental.orm,
		};

		if (!generationConfig.config.experimental.orm) {
			Logger.warn('To enable the ORM set `experimental.orm` to `true` in your `wundergraph.config.ts`.');
			return Promise.resolve([
				{
					path: `orm/${ORM.BUILD_INFO_FILENAME}`,
					content: JSON.stringify(buildInfo),
				},
				{
					path: 'orm/index.ts',
					content: formatTypeScript(emptyOrm),
					header: doNotEditHeader,
				},
			]);
		}

		// path to directory containing generated TypeScript
		const outputPath = path.join(generationConfig.wunderGraphDir, generationConfig.outPath, ORM.MODULE_DIR);
		const buildInfoPath = path.join(outputPath, ORM.BUILD_INFO_FILENAME);

		const currentSchemaSha256 = generationConfig.config.application.EngineConfiguration.schemaSha256;
		const existinBuildInfo = fs.existsSync(buildInfoPath) ? JSON.parse(fs.readFileSync(buildInfoPath, 'utf-8')) : null;
		const regenerate = existinBuildInfo?.disabled == true;
		const lastGeneratedWithSha256: string | null = existinBuildInfo?.schemaSha256 ?? null;

		// quik way to skip regenerating the orm when there's no API changes
		if (!regenerate && lastGeneratedWithSha256 && lastGeneratedWithSha256 === currentSchemaSha256) {
			Logger.info('Skipping ORM code generation.');
			return Promise.resolve([]);
		}

		// @todo support non-namespaced APIs in an implicit "default" namespace
		// @todo merge all non-namespaced API's into a single schema artifact
		// @todo may be best to generate only interface files

		// Collect namespaces that will be exposed through the ORM
		const namespaces = generationConfig.config.application.Apis.map((api) => ({
			id: api.Namespace,
			name: toTitleCase(api.Namespace!),
		}));

		// generate the schema for the ORM
		const schemas = generationConfig.config.application.Apis.map((api) => {
			const unNamespacedSchema = print(visit(visit(parse(api.Schema), Renamer(`${api.Namespace!}_`)), JoinStripper));
			return [api.Namespace!, codegen(unNamespacedSchema)];
		}).map(([namespace, schema]) => ({
			path: `orm/schemas/${namespace}.ts`,
			content: formatTypeScript(schema),
			header: doNotEditHeader,
		}));

		// generate the pre-configured ORM client
		const schemasIndex = Handlebars.compile(schemasTemplate)({ namespaces });
		const orm = Handlebars.compile(ormTemplate)({ namespaces });

		return Promise.resolve([
			...schemas,
			{
				path: 'orm/schemas/index.ts',
				content: formatTypeScript(schemasIndex),
				header: doNotEditHeader,
			},
			{
				path: 'orm/index.ts',
				content: formatTypeScript(orm),
				header: doNotEditHeader,
			},
			{
				path: `orm/${ORM.BUILD_INFO_FILENAME}`,
				content: JSON.stringify(buildInfo),
			},
		]);
	}
}
