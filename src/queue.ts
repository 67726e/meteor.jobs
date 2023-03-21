
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

import { JobCollection, ServerCollection } from './collection';
import { Configuration } from './configuration';
import { QUEUE_PAUSED, QUEUE_MILLISECOND_MAX_TIMEOUT } from './constant';
import { Dominator } from './dominator';
import { Jobs } from './job';
import { Logger } from './logger';
import { Timer } from './timer';
import type {
	DominatorDocument,
	JobDocument,
	JobState,
	JobThisType,
} from './types';



// TODO: Is this interface needed...
// export namespace Queues {
// 	var _awaitAsyncJobs = new Set<string>();
// };



interface QueueConfiguration {
	jobCollection: Mongo.Collection<JobDocument>,
	serverCollection: Mongo.Collection<DominatorDocument>,
}

class Queue {
	private executing: boolean = false;
	// TODO: Refactor out `typeof PAUSED`... don't use `pausedJobs` for in-band signalling
	private queryHandle: null | typeof QUEUE_PAUSED | Meteor.LiveQueryHandle = null;

	constructor(
		private readonly configuration: QueueConfiguration,
	) {}

	public restart() {
		// this is called by Jobs.start() and Jobs.stop() when the list of pausedJobs changes
		// only restart the queue if we're already watching it (maybe jobs were started/paused inside _executeJobs())

		// TODO: Review Me!
		if (this.queryHandle) {
			this.start();
		}
	}

	public start() {
		if (this.queryHandle) {
			if (this.queryHandle !== QUEUE_PAUSED) {
				// TODO: Refactor me... shouldn't overload functions like this
				// Clears any existing job timeout(s)...
				this.stop();
			}
		}

		const pausedJobs = Dominator.getLastPing()?.pausedJobs || [];

		Logger.log('Jobs', 'queue.start paused:', pausedJobs);

		// TODO: What if N jobs...
			// Don't assume a database is going to work as expected...
		if (pausedJobs[0] === '*') {
			// Update handle to paused state...
			this.queryHandle = QUEUE_PAUSED;
		} else {
			// Create long-living query to watch for incoming jobs...
			this.queryHandle = this.configuration.jobCollection.find({
				state: 'pending',
				name: { $nin: pausedJobs },
			}, {
				limit: 1,
				sort: { due: 1 },
				fields: { name: 1, due: 1 },
			}).observe({
				// These will create the next timeout for the next job...
				changed: (job) => this.observe('changed', job),
				added: (job) => this.observe('added', job),
			});
		}
	}

	public stop() {
		// TODO: Review Me! - Just check if this is the right class???
		if (this.queryHandle !== null && this.queryHandle !== QUEUE_PAUSED) {
			this.queryHandle.stop();
		}

		this.queryHandle = null;

		this.observe('stop', null);
	}

	private observe(type: string, nextJob: null | JobDocument) {
		// TODO: Clean Me!
		Logger.log('Jobs', 'queue.observer', type, nextJob, nextJob && ((nextJob.due.valueOf() - Date.now())/(60*60*1000)).toFixed(2)+'h');

		Timer.stopQueueExecutionTimer();

		if (this.executing === false) {
			if (nextJob) {
				// TODO: Handle / Document Calculation... what if `Date.now() > `nextJob.due`, etc.
				const delay = nextJob.due.valueOf() - Date.now();
	
				// Maximum 24 Hours Timeout - Otherwise, NodeJS Issues...
				// See: https://github.com/wildhart/meteor.jobs/issues/5
				const nextJobDelay = Math.min(QUEUE_MILLISECOND_MAX_TIMEOUT, delay);
	
				Timer.startQueueExecutionTimer(() => {
					Timer.stopQueueExecutionTimer();

					this.executeJobs();
				}, nextJobDelay);
			}	
		}
	}

	private findNextJob(executedJob: null | JobDocument, executedJobs: JobDocument[], pausedJobs: string[]) {
		return this.configuration.jobCollection.findOne({
			state: 'pending',
			due: { $lte: new Date(), },

			// TODO: Implement Me!
			// name: {$nin: doneJobs.concat(lastPing.pausedJobs, Array.from(_awaitAsyncJobs))}, // give other job types a chance...

			// Avoid race-condition wherein we continually execute the previous job...
			// TODO: Test Me! - Document Race-Condition Scenario / Test
			// TODO: Test Me! - Test `executedJob._id` & `not null`
			_id: { $ne: (executedJob) ? executedJob._id : 'not null' },
		}, {
			// TODO: Document Me!
			sort: {
				due: 1,
				priority: -1,
			}
		});
	}

	private executeJobs() {
		// TODO: Review for race-condition
			// Fix or Document Safety...
		if (this.executing) {
			console.warn('already executing!');

			return;
		}

		this.executing = true;

		Logger.log('Jobs', 'executeJobs', 'paused:', Dominator.getLastPing()?.pausedJobs);

		// TODO: Review Me!
		// ignore job queue changes while executing jobs. Will restart observer with .start() at end
		this.stop();

		// TODO: Refactor me...
		const isPaused = () => {
			const pausedJobs = Dominator.getLastPing()?.pausedJobs || [];

			return pausedJobs.indexOf('*') >= 0;
		}

		try {
			let executedJobs: JobDocument[] = [];

			do {
				let executedJob: null | JobDocument = null;

				do {
					// TODO: IMPLEMENT ME! - pass to configuration...
					// always use the live version of dominator.lastPing.pausedJobs in case jobs are paused/restarted while executing
					const lastPing = this.configuration.serverCollection.findOne({}, { fields: { pausedJobs: 1 } });
					const pausedJobs = lastPing?.pausedJobs || [];

					const job: undefined | JobDocument = this.findNextJob(executedJob, executedJobs, pausedJobs);

					if (job) {
						executedJob = job;
						executedJobs = [ ...executedJobs, job, ];

						this.executeJob(job);
					} else {
						executedJob = null;
						executedJobs = [];

						// TODO: Implement Me! - Logger?
					}
				// Continue executing if we are not in a paused state
				// Continue executing if we are not out of jobs (found a job on current iteration...)
				} while (!isPaused() && executedJob != null);
			// Continue executing if we are not in a paused state
			// Continue executing if we are not out of jobs (found N > 0 jobs on current iteration...)
			} while (!isPaused() && executedJobs.length > 0);
		} catch (error) {
			console.warn('Jobs', 'executeJobs ERROR');
			console.warn(error);	
		}
		
		// Update no longer executing jobs, restart timer via `this.start()`...
		this.executing = false;

		this.start();
	}

	public executeJob(job: JobDocument) {
		Logger.log('Jobs', `  ${job.name}`);

		if (typeof Jobs.jobs[job.name] !== 'function') {
			console.warn('Jobs', 'job does not exist:', job.name);

			this.updateJobState(job._id, 'failure');

			return;
		}

		// TODO: Refactor into own type...?
		let contextOutcome: null | 'remove' | 'reschedule' | JobState = null;

		// TODO: Fix Me!
		const currentContext = this;

		const context: JobThisType = {
			document: job,
			failure: function() {
				contextOutcome = 'failure';

				return currentContext.updateJobState(job._id, contextOutcome);
			},
			remove: function() {
				contextOutcome = 'remove';

				return Jobs.remove(job._id);
			},
			replicate: function(configuration) {
				return Jobs.replicate(job._id, configuration);
			},
			reschedule: function(configuration) {
				contextOutcome = 'reschedule';

				Jobs.reschedule(job._id, configuration);
			},
			success: function() {
				contextOutcome = 'success';

				return currentContext.updateJobState(job._id, contextOutcome);
			},
		};

		// Handle Job Completion / State Transition
		//	If `contextOutcome` is set by job, use value...
		//	Else, `defaultCompletion` is set by default or developer...
		const complete = function() {
			if (contextOutcome === null) {
				// TODO: Refactor Values into `enum`
				if (Configuration.get().defaultCompletion === 'success') {
					currentContext.updateJobState(job._id, 'success');
				} else if (Configuration.get().defaultCompletion === 'remove') {
					// TODO: Implement Me!
					//	Jobs.remove(job._id)
				} else {
					// TODO: Should this be an `console.erro` rather than a warn???
					console.warn('Jobs', "Job was not resolved with success, failure, reschedule or remove. Consider using the 'defaultCompletion' option.", job);

					currentContext.updateJobState(job._id, 'failure');
				}
			}
		};

		try {
			this.updateJobState(job._id, 'executing');

			const result: any = Jobs.jobs[job.name].apply(context, job.arguments);

			if (typeof result?.then === 'function') {
				// TODO: Handle Async...

				// if (job.awaitAsync) {
				// 	_awaitAsyncJobs.add(job.name);
				// }
				// @ts-ignore

				try {
					result
						.then(() => {
							Logger.log('Jobs', `    Done async job ${job.name}`, `result: ${contextOutcome}`);

							// TODO: Implement Me!
							// _awaitAsyncJobs.delete(job.name);

							complete();
						});
				} catch (error) {
					// TODO: Review Me... `${job}` => [object Object] ???
					console.warn('Jobs', `    Error in async job ${job}`);
					console.warn(error);

					// TODO: Implement Me!
					// _awaitAsyncJobs.delete(job.name);

					if (contextOutcome !== 'reschedule') {
						context.failure();
					}
				}
			} else {
				Logger.log('Jobs', `    Done job ${job.name}`, `result: ${contextOutcome}`);

				// Synchronous Job - Update Now...
				complete();
			}
		} catch (error) {
			console.warn('Jobs', 'Error in job', job);

			console.warn(error);

			// TODO: Wrap in own `try / catch`
			if (contextOutcome != 'reschedule') {
				context.failure();
			}
		}
	}

	private updateJobState(jobId: string, state: JobState) {
		const count = this.configuration.jobCollection.update({ _id: jobId }, { $set: { state, }});

		Logger.log('Jobs', 'setJobState', jobId, state, count);
	}
}



const instance = new Queue({
	serverCollection: ServerCollection,
	jobCollection: JobCollection,
});

export { instance as Queue };
