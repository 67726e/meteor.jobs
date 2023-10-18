
declare module 'meteor/simplesigner:jobs' {
	import { Mongo } from 'meteor/mongo';
	import { DominatorDocument, JobDocument } from './types';
	export declare const JobCollection: Mongo.Collection<JobDocument, JobDocument>;
	export declare const ServerCollection: Mongo.Collection<DominatorDocument, DominatorDocument>;
	import { Config } from './types';
	declare class Configuration {
	    private configuration;
	    constructor();
	    configure(configuration: Partial<Config>): void;
	    get(): Config;
	}
	declare const instance: Configuration;
	export { instance as Configuration };
	export declare const DOMINATOR_ID = "dominatorId";
	export declare const LOGGER_NOOP: () => void;
	export declare const QUEUE_PAUSED = "paused";
	export declare const QUEUE_MILLISECOND_MAX_TIMEOUT: number;
	import { Mongo } from 'meteor/mongo';
	import { DominatorDocument } from './types';
	interface DominatorConfiguration {
	    serverCollection: Mongo.Collection<DominatorDocument>;
	}
	declare class Dominator {
	    private readonly configuration;
	    private lastPing;
	    private serverId;
	    constructor(configuration: DominatorConfiguration);
	    initialize(): Promise<void>;
	    private upgradeToMaster;
	    private downgradeToSlave;
	    private observe;
	    private ping;
	    start(jobArgument?: string | string[]): void;
	    stop(jobArgument?: string | string[]): void;
	    getLastPing(): DominatorDocument;
	}
	declare const instance: Dominator;
	export { instance as Dominator };
	import { Jobs } from './job';
	export { Jobs };
	import { Mongo } from 'meteor/mongo';
	import { Config, JobConfig, JobDocument, JobFunctionMap, JobState } from './types';
	interface JobConfiguration {
	    jobCollection: Mongo.Collection<JobDocument>;
	}
	declare class JobsClass {
	    private readonly configuration;
	    collection: Mongo.Collection<JobDocument>;
	    jobs: JobFunctionMap;
	    constructor(configuration: JobConfiguration);
	    clear(state?: '*' | JobState | JobState[], jobName?: string, ...parameters: any[]): number;
	    configure(settings: Partial<Config>): void;
	    count(jobName: string, ...parameters: any[]): number;
	    countPending(jobName: string, ...parameters: any[]): Promise<number>;
	    execute(jobId: string): Promise<void>;
	    findOne(jobName: string, ...parameters: any[]): Promise<JobDocument>;
	    register(jobFunctionMap: JobFunctionMap): void;
	    remove(jobId: string): boolean;
	    replicate(jobId: string, configuration: Partial<JobConfig>): Promise<string>;
	    reschedule(jobId: string, configuration: Partial<JobConfig>): void;
	    run(jobName: string, ...parameters: any[]): Promise<false | JobDocument>;
	    start(jobArgument?: string | string[]): void;
	    stop(jobArgument?: string | string[]): void;
	}
	declare const Jobs: JobsClass;
	export { Jobs };
	import { Config } from './types';
	declare class Logger {
	    error: {
	        (...data: any[]): void;
	        (message?: any, ...optionalParams: any[]): void;
	    };
	    log: {
	        (...data: any[]): void;
	        (message?: any, ...optionalParams: any[]): void;
	    };
	    warn: {
	        (...data: any[]): void;
	        (message?: any, ...optionalParams: any[]): void;
	    };
	    configure(configuration: Partial<Config>): void;
	}
	declare const instance: Logger;
	export { instance as Logger };
	import { Mongo } from 'meteor/mongo';
	import type { DominatorDocument, JobDocument } from './types';
	interface QueueConfiguration {
	    jobCollection: Mongo.Collection<JobDocument>;
	    serverCollection: Mongo.Collection<DominatorDocument>;
	}
	declare class Queue {
	    private readonly configuration;
	    private executing;
	    private queryHandle;
	    constructor(configuration: QueueConfiguration);
	    restart(): void;
	    start(): void;
	    stop(): void;
	    private observe;
	    private findNextJob;
	    private executeJobs;
	    executeJob(job: JobDocument): void;
	    private updateJobState;
	}
	declare const instance: Queue;
	export { instance as Queue };
	declare class Timer {
	    private dominatorPingTimeout;
	    private dominatorUpgradeTimeout;
	    private queueExecutionTimeout;
	    constructor();
	    startDominatorPingTimer(callback: Function, delay: number): void;
	    stopDominatorPingTimer(): void;
	    startDominatorUpgradeTimer(callback: Function, delay: number): void;
	    stopDominatorUpgradeTimer(): void;
	    startQueueExecutionTimer(callback: Function, delay: number): void;
	    stopQueueExecutionTimer(): void;
	}
	declare const instance: Timer;
	export { instance as Timer };
	export interface Config {
	    startupDelay: number;
	    maxWait: number;
	    log: typeof console.log | boolean;
	    warn: typeof console.log | boolean;
	    error: typeof console.log | boolean;
	    autoStart: boolean;
	    setServerId?: string | Function;
	    defaultCompletion?: 'success' | 'remove';
	}
	export interface DominatorDocument {
	    _id?: string;
	    serverId?: string;
	    pausedJobs: string[];
	    date?: Date;
	}
	export interface JobConfig {
	    in: any;
	    on: any;
	    priority: number;
	    date: Date;
	    state: string;
	    awaitAsync: boolean;
	    unique: boolean;
	    singular: boolean;
	    callback?: Function;
	}
	export type JobState = "pending" | "success" | "failure" | "executing";
	export interface JobDocument {
	    _id: string;
	    name: string;
	    state: JobState;
	    arguments: any[];
	    due: Date;
	    priority: number;
	    created: Date;
	    awaitAsync?: boolean;
	}
	export interface JobThisType {
	    document: JobDocument;
	    replicate(config: Partial<JobConfig>): Promise<string | null>;
	    reschedule(config: Partial<JobConfig>): void;
	    remove(): boolean;
	    success(): void;
	    failure(): void;
	}
	export type JobFunction = (this: JobThisType, ...args: any[]) => void;
	export type JobFunctionMap = Record<string, JobFunction>;
	export type RegisterFunction = (jobFunctionMap: JobFunctionMap) => void;
}

