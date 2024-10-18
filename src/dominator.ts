
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

    public async initialize() {
        // Note: The `this.serverId` assignment is a race-condition based on `Meteor.startup(() => Dominator.initialize())`
        // TODO: Refactor Me! - Handle RAIC-style assignment of `this.serverId` with later refactor
        const packageConfiguration = Configuration.get();

        this.serverId = (typeof packageConfiguration.setServerId === 'string' && packageConfiguration.setServerId) ||
            (typeof packageConfiguration.setServerId === 'function' && packageConfiguration.setServerId()) ||
            Random.id();

        await this.configuration.serverCollection.find({_id: DOMINATOR_ID})
            .observe({
                changed: (newPing) => this.observe(newPing),
            });

        const lastPing = await this.configuration.serverCollection.findOneAsync();

        const isLastPingOld = isPingOld(lastPing);

        Logger.log('Jobs', 'startup', this.serverId, JSON.stringify(lastPing), `isOld=${isLastPingOld}`);

        // TODO: Verify Branching... messy here...
        // TODO: Test Me! Smells of a race-condition...
            // Test and or Document Proof of Safety...
        if (lastPing === undefined || lastPing === null) {
            // No Server is Master
            // Assume Control
            await this.upgradeToMaster('no ping');
        } else if (lastPing.serverId === undefined || lastPing.serverId === null) {
            // No Server is Master
            // Assume Control
            await this.upgradeToMaster('no ping');
        } else if (lastPing.serverId === this.serverId) {
            // This Server is Master
            // Resume Control
			await this.upgradeToMaster('restarted');
        } else if (isLastPingOld) {
            // Another Server was Master...
            // Upgrade to Master
			await this.upgradeToMaster('lastPingIsOld ' + JSON.stringify(lastPing));
        } else {
            // Another Server is Master...
            // Stand-By as Slave...
            // Observe for Upgrade to Master...
			this.observe(lastPing);
        }
    }

    private async upgradeToMaster(reason: string): Promise<void> {
        Logger.log('Jobs', 'takeControl', reason)

        // Initial Ping...
        await this.ping();

        // Recurring Ping...  
        Timer.startDominatorPingTimer(async () => {
            await this.ping();
        // TODO: Why `(Configuration.get().maxWait * 0.8)`
        //  Presumably, a sloppy attempt at ensuring completion prior-to `Configuration.get().maxWait`
        }, Configuration.get().maxWait * 0.8);

        await Queue.start();
    }

    private downgradeToSlave() {
        Logger.log('Jobs', 'relinquishControl');

        Timer.stopDominatorPingTimer();
        
        Queue.stop();
    }

    private async observe(newPing: DominatorDocument): Promise<void> {
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
            await Queue.restart();
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

    private async ping() {
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

        await this.configuration.serverCollection.upsertAsync({ _id: DOMINATOR_ID }, newPing);

        Logger.log('Jobs', 'ping', newPing.date, 'paused:', newPing.pausedJobs);
    }

    public async start(jobArgument?: string | string[]): Promise<void> {
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

        await this.configuration.serverCollection.upsertAsync({ _id: DOMINATOR_ID }, upsertQuery);

        Logger.log('Jobs', 'startJobs', jobArgument, upsertQuery);
    }

    public async stop(jobArgument?: string | string[]): Promise<void> {
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

        await this.configuration.serverCollection.upsertAsync({ _id: DOMINATOR_ID }, upsertQuery);

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
