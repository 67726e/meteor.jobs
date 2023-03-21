
import { LOGGER_NOOP } from './constant';
import { Config } from './types';

class Logger {
    public error = console.error;
    public log = console.log;
    public warn = console.warn;

    public configure(configuration: Partial<Config>) {
        switch (typeof configuration.error) {
            case 'boolean':
                this.error = (configuration.error) ? console.error : LOGGER_NOOP;
                break;
            case 'function':
                this.error = configuration.error;
                break;
            default:
                break; // TODO: Implement Me?
        }

        switch (typeof configuration.log) {
            case 'boolean':
                this.log = (configuration.log) ? console.log : LOGGER_NOOP;
                break;
            case 'function':
                this.log = configuration.log;
                break;
            default:
                break; // TODO: Implement Me?
        }

        switch (typeof configuration.warn) {
            case 'boolean':
                this.warn = (configuration.warn) ? console.warn : LOGGER_NOOP;
                break;
            case 'function':
                this.warn = configuration.warn;
                break;
            default:
                break; // TODO: Implement Me?
        }
    }
}

const instance = new Logger();

export { instance as Logger };
