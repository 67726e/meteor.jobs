Package.describe({
	name: '67726e:jobs',
	version: '3.0.0-beta-4',
	documentation: 'README.md',
	git: 'https://github.com/67726e/meteor.jobs',
	summary: 'Schedule jobs to run at a later time, including multi-server, super efficient',
});

Package.onUse(function(api) {
	api.versionsFrom(['3.0.1']);

	api.use([
		'check',
		'ecmascript',
		'mongo',
		'random',
		'typescript@3.0.0 || 4.0.0 || 5.0.0',
	], 'server');
	
	api.export([
		'Jobs',
	]);

	api.mainModule('src/index.ts', 'server');
});
