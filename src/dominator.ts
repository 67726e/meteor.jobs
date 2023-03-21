
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';

import { ServerCollection } from './collection';
import { Configuration } from './configuration';
import { DOMINATOR_ID } from './constant';
import { Logger } from './logger';
import { DominatorDocument } from './types';
import { Queue } from './queue';
import { Timer } from './timer';



const isDate = (date: any) => {
    // Apparently the best way to check if a value is of type `Date`...
    //  Go figure...
    // See: https://stackoverflow.com/a/643827
    return Object.prototype.toString.call(date) === '[object Date]';
};

const isPingOld = (ping?: DominatorDocument) => {
    if (ping && ping.date && isDate(ping.date)) {
        ping.date.getTime()

        // TODO: Review Me!
        // `valueOf()` => "Returns the stored time value in milliseconds since midnight, January 1, 1970 UTC."
        // `getTime()` => "Gets the time value in milliseconds."
        return ping.date.valueOf() < (Date.now() - Configuration.get().maxWait);
    }

    return false;
};



interface DominatorConfiguration {
    serverCollection: Mongo.Collection<DominatorDocument>,
}

// TODO: Rename `Server` or something more clear as to the purpose?
class Dominator {
    private lastPing: null | DominatorDocument = null;
    // Provide a default, random Mongo-style ID
    private serverId: string = Random.id();

    constructor(
        private readonly configuration: DominatorConfiguration,
    ) {}

    public initialize() {
        // Note: The `this.serverId` assignment is a race-condition based on `Meteor.startup(() => Dominator.initialize())`
        // TODO: Refactor Me! - Handle RAIC-style assignment of `this.serverId` with later refactor
        const packageConfiguration = Configuration.get();

        this.serverId = (typeof packageConfiguration.setServerId === 'string' && packageConfiguration.setServerId) ||
            (typeof packageConfiguration.setServerId === 'function' && packageConfiguration.setServerId()) ||
            Random.id();

        this.configuration.serverCollection.find({_id: DOMINATOR_ID})
            .observe({
                changed: (newPing) => this.observe(newPing),
            });

        const lastPing = this.configuration.serverCollection.findOne();

        const isLastPingOld = isPingOld(lastPing);

        Logger.log('Jobs', 'startup', this.serverId, JSON.stringify(lastPing), `isOld=${isLastPingOld}`);

        // TODO: Verify Branching... messy here...
        // TODO: Test Me! Smells of a race-condition...
            // Test and or Document Proof of Safety...
        if (lastPing === undefined || lastPing === null) {
            // No Server is Master
            // Assume Control
            this.upgradeToMaster('no ping');
        } else if (lastPing.serverId === undefined || lastPing.serverId === null) {
            // No Server is Master
            // Assume Control
            this.upgradeToMaster('no ping');
        } else if (lastPing.serverId === this.serverId) {
            // This Server is Master
            // Resume Control
			this.upgradeToMaster('restarted');
        } else if (isLastPingOld) {
            // Another Server was Master...
            // Upgrade to Master
			this.upgradeToMaster('lastPingIsOld ' + JSON.stringify(lastPing));
        } else {
            // Another Server is Master...
            // Stand-By as Slave...
            // Observe for Upgrade to Master...
			this.observe(lastPing);
        }
    }

    private upgradeToMaster(reason: string) {
        Logger.log('Jobs', 'takeControl', reason)

        // Initial Ping...
        this.ping();

        // Recurring Ping...  
        Timer.startDominatorPingTimer(() => {
            this.ping();
        // TODO: Why `(Configuration.get().maxWait * 0.8)`
        //  Presumably, a sloppy attempt at ensuring completion prior-to `Configuration.get().maxWait`
        }, Configuration.get().maxWait * 0.8);

        Queue.start();
    }

    private downgradeToSlave() {
        Logger.log('Jobs', 'relinquishControl');

        Timer.stopDominatorPingTimer();
        
        Queue.stop();
    }

    private observe(newPing: DominatorDocument) {
		Logger.log('Jobs', 'dominator.observer', newPing);

        if (this.lastPing) {
            if (this.lastPing.serverId === this.serverId) {
                // TODO: Implement Me! - Can we shorten to just `newPing.serverId !== this.configuration.serverId`
                if (newPing.serverId !== this.serverId) {
                    this.downgradeToSlave();
                }
            }
        }

        const lastPausedJobs = (this.lastPing?.pausedJobs) || [];
        const newPausedJobs = (newPing.pausedJobs) || [];

        // TODO: Why here?...
        this.lastPing = newPing;

        if (lastPausedJobs.join() !== newPausedJobs.join()) {
            Queue.restart();
        }

        Timer.stopDominatorUpgradeTimer();

        if (this.lastPing.serverId !== this.serverId) {
            // Check if we need to take control in the future...
            Timer.startDominatorUpgradeTimer(() => {
                // This timeout wasn't cleared... so take control(?)
                // TODO: Document Me! - This logic is (probably) fine?
                //  Document how and when this would be cleared...
                this.upgradeToMaster(`lastPingIsOld ${JSON.stringify(this.lastPing)}`);
            }, Configuration.get().maxWait);
        }
    }

    private ping() {
        const newPing = {
            date: new Date(),
            // TODO: Clean Me!
			pausedJobs: this.lastPing ? (this.lastPing.pausedJobs || []) : (Configuration.get().autoStart ? [] : ['*']),
            serverId: this.serverId,
        };

        // TODO: Why `!this.lastPing`
        //  Wouldn't we always update `this.lastPing = newPing`?
        if (!this.lastPing) {
            this.lastPing = newPing;
        }

        this.configuration.serverCollection.upsert({ _id: DOMINATOR_ID }, newPing);

        Logger.log('Jobs', 'ping', newPing.date, 'paused:', newPing.pausedJobs);
    }

    public start(jobArgument?: string | string[]) {
        let upsertQuery: Mongo.Modifier<DominatorDocument> = {};

        if (jobArgument === null || jobArgument === undefined) {
            // Clear `pausedJobs` Array
            upsertQuery = { $set: { pausedJobs: [] } };
        } else if (jobArgument === '*') {
            // Clear `pausedJobs` Array
            upsertQuery = { $set: { pausedJobs: [] } };
        } else if (typeof jobArgument === 'string') {
            upsertQuery = { $pullAll: { pausedJobs: [jobArgument] } };
        } else if (Array.isArray(jobArgument)) {
            // TODO: Refine Type? Caller Can Bypass Type Checks...
            upsertQuery = { $pullAll: { pausedJobs: jobArgument } };
        } else {
            // TODO: Implement Me!
        }

        this.configuration.serverCollection.upsert({ _id: DOMINATOR_ID }, upsertQuery);

        Logger.log('Jobs', 'startJobs', jobArgument, upsertQuery);
    }

    public stop(jobArgument?: string | string[]) {
        let upsertQuery: Mongo.Modifier<DominatorDocument> = {};

        if (jobArgument === null || jobArgument === undefined) {
            upsertQuery = { $set: { pausedJobs: ['*'] } };
        } else if (jobArgument === '*') {
            upsertQuery = { $set: { pausedJobs: ['*'] } };
        } else if (typeof jobArgument === 'string') {
            upsertQuery = { $addToSet: { pausedJobs: { $each: [jobArgument] } } };
        } else if (Array.isArray(jobArgument)) {
            // TODO: Refine Type? Caller Can Bypass Type Checks...
            upsertQuery = { $addToSet: { pausedJobs: { $each: jobArgument } } };
        } else {
            // TODO: Implement Me!
        }

        this.configuration.serverCollection.upsert({ _id: DOMINATOR_ID }, upsertQuery);

		Logger.log('Jobs', 'stopJobs', jobArgument, upsertQuery);
    }

    public getLastPing() {
        // TODO: Make a clone or...?
        return this.lastPing;
    }
}



const instance = new Dominator({
    serverCollection: ServerCollection,
});

export { instance as Dominator };
