
import { check, Match } from 'meteor/check';
import { Mongo } from 'meteor/mongo';

import { JobCollection } from './collection';
import { Configuration } from './configuration';
import { Dominator } from './dominator';
import { Logger } from './logger';
import { Queue } from './queue';
import {
    Config,
    JobConfig,
    JobDocument,
    JobFunctionMap,
    JobState,
} from './types';



// TODO: Review Me!
// TODO: Test Me!
function getDateFromJobConfiguration(config: Partial<JobConfig>) {
    // https://github.com/msavin/SteveJobs..meteor.jobs.scheduler.queue.background.tasks/blob/031fdf5051b2f2581a47f64ab5b54ffbb6893cf8/package/server/imports/utilities/helpers/date.js
    check(config, Match.ObjectIncluding({
        date: Match.Maybe(Date),
        in: Match.Maybe(Object),
        on: Match.Maybe(Object),
    }));

    let currentDate = config.date || new Date();
    let newNumber: number;
    let fn: string;

    Object.keys(config).forEach(key1 => {
        if (["in", "on"].indexOf(key1) > -1) {
            // @ts-ignore
            Object.keys(config[key1]).forEach(key2 => {
                try {
                    // @ts-ignore
                    newNumber = Number(config[key1][key2]);
                    if (isNaN(newNumber)) {
                        console.warn('Jobs', `invalid type was input: {key1}.{key2}`, newNumber)
                    } else {
                        // convert month(s) => months (etc), and day(s) => date and year(s) => fullYear
                        fn = (key2 + "s").replace('ss', 's').replace('days','date').replace('years','fullYear').replace('months','month');
                        // convert months => Months
                        fn = fn.charAt(0).toUpperCase() + fn.slice(1);
                        // if key1=='in' currentDate.setMonth(newNumber + currentDate.getMonth())
                        // if key1=='on' currentDate.setMonth(newNumber)
                        // @ts-ignore
                        currentDate['set' + fn](newNumber + (key1 == 'in' ? currentDate['get' + fn]() : 0));
                    }
                } catch (error) {
                    Logger.warn('Jobs', `invalid argument was ignored: {key1}.{key2}`, newNumber, fn);
                    Logger.log(error);
                }
            });
        }
    });
    return currentDate;
}

const jobConfigurationProperties: Array<keyof JobConfig> = ['in', 'on', 'priority', 'date', 'callback', 'singular', 'unique', 'awaitAsync']

function isJobConfiguration(configuration: any) {
    if (configuration !== null && configuration !== undefined) {
        if (typeof configuration === 'object') {
            // TODO: Should we be checking types here too... ???
            // Ensure we have an object with at least one of the `jobConfigurationProperties` defined
            return jobConfigurationProperties.some((index) => typeof configuration[index] !== 'undefined');
        }
    }

    return false;
}



interface JobConfiguration {
    jobCollection: Mongo.Collection<JobDocument>,
}

class Jobs {
    // TODO: Refactor Away...
    public collection: Mongo.Collection<JobDocument>;
    // TODO: Refactor Away...
    // TODO: Rename `jobFunctionMap`
    public jobs: JobFunctionMap = {};

    constructor(
        private readonly configuration: JobConfiguration,
    ) {
        this.collection = this.configuration.jobCollection;
    }

    public async clear(state?: '*' | JobState | JobState[], jobName?: string, ...parameters: any[]) {
        const query: Mongo.Query<JobDocument> = {};

        // Add `state` Predicate to `query`
        if (state === undefined || state === null) {
            // Add Default Predicate...
            query.state = { $in: ['failure', 'success'] };
        } else if (state === '*') {
            // Add "Select All" Predicate...
            query.state = { $exists: true };
        } else if (typeof state === 'string') {
            query.state = { $in: [state] };
        } else if (Array.isArray(state)) {
            query.state = { $in: state };
        } else {
            // TODO: Warn???
            // Add Default Predicate...
            query.state = { $in: ['failure', 'success'] };
        }

        if (typeof jobName === 'string') {
            query.name = jobName;
        } else {
            // TODO: Review Me!
            //  Type Definition Not Matching Original Code...
            //
            // } else if (typeof jobName === "object") {
            // 	query.name = {$in: jobName};
            // }
            //
            // TODO: Should be `jobName?: string | string[]` ???
        }

        if (typeof parameters[0] === 'function') {
            const callback: Function = parameters[0];

            // TODO: Refactor into `reduce` ???
            parameters.slice(1).forEach((parameter, index) => {
                query['arguments.' + index] = parameter;
            });

            const count = await this.configuration.jobCollection.removeAsync(query);

            // TODO: Why `null` ???
            //  Compare with `reschedule` callback...
            callback(null, count);

            return count;
        } else {
            // TODO: Refactor into `reduce` ???
            parameters.forEach((parameter, index) => {
                query['arguments.' + index] = parameter;
            });

            return await this.configuration.jobCollection.removeAsync(query);
        }
    }

    public configure(settings: Partial<Config>) {
        // TODO: Review Me!
		check(settings, {
			autoStart: Match.Maybe(Boolean),
			defaultCompletion: Match.Maybe(Match.Where((val => /^(success|remove)$/.test(val)))),
		    error: Match.Maybe(Match.OneOf(undefined, null, Boolean, Function)),
			log: Match.Maybe(Match.OneOf(undefined, null, Boolean, Function)),
			warn: Match.Maybe(Match.OneOf(undefined, null, Boolean, Function)),
			maxWait: Match.Maybe(Number),
			setServerId: Match.Maybe(Match.OneOf(String, Function)),
			startupDelay: Match.Maybe(Number),
		});

        Configuration.configure(settings);

        Logger.log('Jobs', 'Jobs.configure', Object.keys(settings));
    }

    public count(jobName: string, ...parameters: any[]) {
        check(jobName, String);
        // TODO: Verify `parameters` ???

		const query: Mongo.Query<JobDocument> = {
			name: jobName,
		};

        // TODO: Refactor into `reduce` ???
        parameters.forEach((parameter, index) => {
            query["arguments." + index] = parameter;
        });

        return this.configuration.jobCollection.find(query).count();    
    }

    public countPending(jobName: string, ...parameters: any[]) {
        check(jobName, String);
        // TODO: Verify `parameters` ???

		const query: Mongo.Query<JobDocument> = {
			name: jobName,
            state: 'pending',
		};

        // TODO: Refactor into `reduce` ???
        parameters.forEach((parameter, index) => {
            query["arguments." + index] = parameter;
        });
		
        return this.configuration.jobCollection.find(query).countAsync();
    }

    public async execute(jobId: string) {
        check(jobId, String);

        Logger.log('Jobs', 'Jobs.execute', jobId);

        const job = await this.configuration.jobCollection.findOneAsync(jobId);

        if (!job) {
			console.warn('Jobs', 'Jobs.execute', 'JOB NOT FOUND', jobId);

            return;
        }

        if (job.state != 'pending') {
			console.warn('Jobs', 'Jobs.execute', 'JOB IS NOT PENDING', job);
            return;
        }

        Queue.executeJob(job);
    }

	public async findOne(jobName: string, ...parameters: any[]) {
		check(jobName, String);
        // TODO: Verify `parameters` ???

		const query: Mongo.Query<JobDocument> = {
			name: jobName,
		};

        // TODO: Refactor into `reduce` ???
        parameters.forEach((parameter, index) => {
            query["arguments." + index] = parameter;
        });

        return await this.configuration.jobCollection.findOneAsync(query);
	}

    public register(jobFunctionMap: JobFunctionMap) {
        // TODO: Verify Type! - `check(..., Object)` is not sufficient!
        // check(newJobs, Object);

        this.jobs = Object.assign(
            {},
            this.jobs,
            jobFunctionMap,
        );

		// log('Jobs', 'Jobs.register', Object.keys(jobs).length, Object.keys(newJobs).join(', '));
    }

    public async remove(jobId: string) {
        check(jobId, String);

        var count = await this.configuration.jobCollection.removeAsync({ _id: jobId });

        Logger.log('Jobs', `    Jobs.remove ${jobId}`, count);

        return count > 0;
    }

    public async replicate(jobId: string, configuration: Partial<JobConfig>) {
        check(jobId, String);
        // TODO: Verify `configuration`

        const job = await this.configuration.jobCollection.findOneAsync(jobId);

        if (!job) {
            console.warn('Jobs', '    Jobs.replicate', 'JOB NOT FOUND', jobId);

            return null;
        }

        // Create Replicated Job Object, Overriding `due` and `state`...
        const replicatedJob: Mongo.OptionalId<JobDocument> = {
            ...job,
            due: getDateFromJobConfiguration(configuration),
            state: 'pending',
        };

        // Delete Primary Key / Allow for Fresh Key...
        delete replicatedJob._id;

        // Create Job Document in Mongo...
        const replicatedJobId = await this.configuration.jobCollection.insertAsync(replicatedJob);

        Logger.log('Jobs', '    Jobs.replicate', jobId, configuration);

        return replicatedJobId;
    }

    public async reschedule(jobId: string, configuration: Partial<JobConfig>) {
        check(jobId, String);
        // TODO: Verify `configuration` 

        const update: Partial<JobDocument> = {
            due: getDateFromJobConfiguration(configuration),
            state: 'pending',
        };

        if (configuration.priority)
            update.priority = configuration.priority;

        const count = await this.configuration.jobCollection.updateAsync({ _id: jobId }, { $set: update });

        Logger.log('Jobs', '    Jobs.reschedule', jobId, configuration, update.due, count);

        // TODO: Probably stuck with this API for backwards compatability... but why both ???
        //  Could just `return count` and skip the whole callback?
        // Invoke Optional `callback` with success boolean, update count
        if (typeof configuration.callback === 'function')
            configuration.callback(count === 0, count);
    }

    public async run(jobName: string, ...parameters: any[]) {
        check(jobName, String);
        // TODO: Verify `parameters` ???

		Logger.log('Jobs', 'Jobs.run', jobName, parameters.length && parameters[0]);

        let configuration: null | Partial<JobConfig> = parameters[0] as Partial<JobConfig> || null;

        if (configuration === null || !isJobConfiguration(configuration)) {
            configuration = null;
            // TODO: Why TF `push(...)`
        }

        let error: null | boolean | string = null;

        // If a job is `unique`, only one can exist with the same name and arguments
        if (configuration?.unique) {
            if (this.count(jobName, parameters[1].slice()) > 0) {
                error = 'Unique job already exists';
            }
        }

        // If a job is `singular`, only one can execute concurrently with the name name and arguments
        // TODO: This should probably not be a thing... 
        //  One should be able to queue N jobs with a one-at-a-time execution limit
        if (configuration?.singular) {
            if (await this.countPending(jobName, parameters[1]?.slice()) > 0) {
                error = 'Singular job already exists';
            }
        }

        if (error) {
            Logger.log('Jobs', `  ${error}`);

            if (typeof configuration?.callback === 'function') {
                configuration.callback(error, null);
            }

            return false;
        }

        const job: Mongo.OptionalId<JobDocument> = {
            name: jobName,
            state: 'pending',
            created: new Date(),
            priority: configuration?.priority || 0,
            awaitAsync: configuration?.awaitAsync || undefined,
            due: (configuration) ? getDateFromJobConfiguration(configuration) : new Date(),
            arguments: (configuration) ? parameters[1]?.slice() : parameters,
        };

        const jobId = await this.configuration.jobCollection.insertAsync(job);

        if (jobId) {
            job._id = jobId;
        } else {
            error = true;
        }

        if (typeof configuration?.callback === 'function') {
            configuration.callback(error, jobId && job);
        }

        return (error) ? false : job as JobDocument;
    }

    public start(jobArgument?: string | string[]) {
        Dominator.start(jobArgument);
    }

    public stop(jobArgument?: string | string[]) {
        Dominator.stop(jobArgument);
    }
}

const instance = new Jobs({
    jobCollection: JobCollection,
});

export { instance as Jobs };
