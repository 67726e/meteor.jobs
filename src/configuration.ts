
import { Logger } from './logger';
import { Config } from './types';

class Configuration {
    private configuration: Config;

    constructor() {
        this.configuration = {
            autoStart: true,
            error: console.error,
            log: console.log,
            warn: console.warn,
            // specify how long the server could be inactive before another server takes on the master role  (default=5 min)
            maxWait: 5 * 60 * 1000,
            // default 1 second
            startupDelay: 1 * 1000,
            // TODO: Handle me?
            // defaultCompletion: 'success',
        };
    }

    public configure(configuration: Partial<Config>) {
        this.configuration = Object.assign(
            {},
            this.configuration,
            configuration,
        );

        // TODO: Invert Me! - Long Term, Refactor `Logger` into an `interface` and `new { ... }`
        Logger.configure(configuration);
    }

    public get() {
        // TODO: Clone Me?
        return this.configuration;
    }
}

const instance = new Configuration();

export { instance as Configuration };
