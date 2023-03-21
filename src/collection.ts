
import { Mongo } from 'meteor/mongo';
import { DominatorDocument, JobDocument } from './types';

export const JobCollection = new Mongo.Collection<JobDocument>("jobs_data");
// TODO: Fix Me!
// TODO: Document Me!
// jobCollection._ensureIndex({ name: 1, due: 1, state: 1});

export const ServerCollection = new Mongo.Collection<DominatorDocument>('jobs_dominator_3');
