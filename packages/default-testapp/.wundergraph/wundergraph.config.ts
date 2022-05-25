import {
	Application,
	authProviders,
	configureWunderGraphApplication,
	cors, EnvironmentVariable,
	introspect,
	templates,
} from '@wundergraph/sdk';
import server from './wundergraph.server';
import operations from './wundergraph.operations';

const spaceX = introspect.graphql({
	apiNamespace: 'spacex',
	url: "https://api.spacex.land/graphql/",
});

const jsp = introspect.openApi({
	source: {
		kind: "file",
		filePath: "../json_placeholder.json"
	},
	mTLS: {
		cert: new EnvironmentVariable("CERT"),
		key: new EnvironmentVariable("KEY"),
		insecureSkipVerify: false,
	}
});

const countries = introspect.graphql({
	apiNamespace: 'countries',
	url: 'https://countries.trevorblades.com/',
});

const db = introspect.postgresql({
	apiNamespace: 'db',
	databaseURL: 'postgresql://admin:admin@localhost:54322/example?schema=public',
});

const myApplication = new Application({
	name: 'app',
	apis: [spaceX, countries, db,jsp],
});

// configureWunderGraph emits the configuration
configureWunderGraphApplication({
	application: myApplication,
	server,
	operations,
	codeGenerators: [
		{
			templates: [
				// use all the typescript react templates to generate a client
				...templates.typescript.all,
				templates.typescript.operations,
				templates.typescript.linkBuilder,
			],
		},
	],
	cors: {
		...cors.allowAll,
		allowedOrigins:
			process.env.NODE_ENV === 'production'
				? [
						// change this before deploying to production to the actual domain where you're deploying your app
						'http://localhost:3000',
				  ]
				: ['http://localhost:3000'],
	},
	authentication: {
		cookieBased: {
			providers: [authProviders.demo()],
			authorizedRedirectUris: ['http://localhost:3000'],
		},
	},
	security: {
		enableGraphQLEndpoint: true,
	},
	dotGraphQLConfig: {
		hasDotWunderGraphDirectory: false,
	},
});
