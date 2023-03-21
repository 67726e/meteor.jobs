
import { Meteor } from 'meteor/meteor';

// NOTE: The `Meteor.setTimeout` API states `(...): number`
//  However, `Meteor.setTimeout` code returns `object`
//  As such, use `null | any` to avoid infinite timeouts
class Timer {
    private dominatorPingTimeout: null | any = null;
    private dominatorUpgradeTimeout: null | any = null;
    private queueExecutionTimeout: null | any = null;

    constructor() {}

    public startDominatorPingTimer(callback: Function, delay: number) {
        if (this.dominatorPingTimeout === null) {
            this.dominatorPingTimeout = Meteor.setTimeout(() => {
                // Interval Semantics...
                this.dominatorPingTimeout = null;

                callback();

                // Interval Semantics...
                this.startDominatorPingTimer(callback, delay);
            }, delay);
        } else {
            // TODO: Implement Me!
        }
    }

    public stopDominatorPingTimer() {
        if (this.dominatorPingTimeout !== null) {
            Meteor.clearTimeout(this.dominatorPingTimeout);
        } else {
            // TODO: Implement Me!
        }
    }

    public startDominatorUpgradeTimer(callback: Function, delay: number) {
        if (this.dominatorUpgradeTimeout === null) {
            this.dominatorUpgradeTimeout = Meteor.setTimeout(() => {
                this.dominatorUpgradeTimeout = null;

                callback();
            }, delay);
        } else {
            // TODO: Implement Me!
        }
    }

    public stopDominatorUpgradeTimer() {
        if (this.dominatorUpgradeTimeout !== null) {
            Meteor.clearTimeout(this.dominatorUpgradeTimeout);

            this.dominatorUpgradeTimeout = null;
        } else {
            // TODO: Implement Me!
        }
    }

    public startQueueExecutionTimer(callback: Function, delay: number) {
        if (this.queueExecutionTimeout === null) {
            this.queueExecutionTimeout = Meteor.setTimeout(() => {
                this.queueExecutionTimeout = null;

                callback();
            }, delay);
        } else {
            // TODO: Implement Me!
        }
    }

    public stopQueueExecutionTimer() {
        if (this.queueExecutionTimeout !== null) {
            Meteor.clearTimeout(this.queueExecutionTimeout);

            this.queueExecutionTimeout = null;
        } else {
            // TODO: Implement Me!
        }
    }
}

const instance = new Timer();

export { instance as Timer };
