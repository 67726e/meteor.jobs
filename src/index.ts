
import { Meteor } from 'meteor/meteor';

import { ServerCollection } from './collection';
import { Configuration } from './configuration';
import { DOMINATOR_ID } from './constant';
import { Dominator } from './dominator';
import { Jobs } from './job';
import { Logger } from './logger';

Meteor.startup(async () => {
    Logger.log('Jobs', `Meteor.startup, startupDelay: ${Configuration.get().startupDelay / 1000}s...`);

    await ServerCollection.removeAsync({ _id: { $ne: DOMINATOR_ID } });

    Meteor.setTimeout(() => Dominator.initialize(), Configuration.get().startupDelay);
});

export { Jobs };
