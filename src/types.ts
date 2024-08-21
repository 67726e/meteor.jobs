
export interface Config {
    startupDelay: number,
    maxWait: number,
    log: typeof console.log | boolean;
    warn: typeof console.log | boolean;
    error: typeof console.log | boolean;
    autoStart: boolean;
    setServerId?: string | Function;
    defaultCompletion?: 'success' | 'remove';
}

// TODO: Rename Me! (Executor???)
export interface DominatorDocument {
    _id?: string,
    serverId?: string,
    pausedJobs: string[],
    date?: Date,
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

// TODO: Convert to an enum
export type JobState = "pending" | "success" | "failure" | "executing";

export interface JobDocument {
    _id: string,
    name: string,
    state: JobState,
    arguments: any[],
    due: Date,
    priority: number,
    created: Date,
    awaitAsync?: boolean,
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
