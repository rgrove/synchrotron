'use strict';

const { format } = require('util');
const chalk = require('chalk');

// -- Exports ------------------------------------------------------------------

/**
Logs nicely formatted messages to stdout or stderr. Doesn't log messages whose
level is lower than the given threshold.
*/
class Logger {
  /**
  @param {Object<string, *>} [options]
    Logger options.

    @param {?string} [options.threshold]
      Log level threshold. Messages with a level below this threshold won't be
      displayed.

      May be one of the following values (in order of increasing severity):

      -   debug
      -   info
      -   warn
      -   error

      If set to `null`, nothing will be logged.
  */
  constructor(options = {}) {
    let {
      threshold = Logger.LEVEL_INFO
    } = options;

    this.threshold = threshold;
  }

  // -- Public Attributes ------------------------------------------------------

  /**
  Log level threshold. Messages with a level below this threshold won't be
  displayed.

  May be one of the following values (in order of increasing severity):

  -   debug
  -   info
  -   warn
  -   error

  If set to `null`, nothing will be logged.

  @type {?string}
  */
  get threshold() {
    return this._threshold;
  }

  set threshold(value) {
    if (value === null) {
      this._minSeverity = Infinity;
    } else {
      if (!Logger.SEVERITY.has(value)) {
        throw new Error(`Invalid log level threshold value: ${value}`);
      }

      this._minSeverity = Logger.SEVERITY.get(value);
    }

    this._threshold = value;
  }

  // -- Public Methods ---------------------------------------------------------

  /**
  Logs a debug message.

  @param {...*} args
    One or more values to log. Will be formatted using Node's `util.format()`,
    so non-string values will be formatted nicely.

  @chainable
  */
  debug(...args) {
    if (this.shouldLog(Logger.LEVEL_DEBUG)) {
      this.log(Logger.LEVEL_DEBUG, chalk.gray(format(...args)));
    }

    return this;
  }

  /**
  Logs an error message with an "Error:" prefix.

  @param {...*} args
    One or more values to log.

  @chainable
  */
  error(...args) {
    return this.log(Logger.LEVEL_ERROR, chalk.red('Error:'), ...args);
  }

  /**
  Logs an error message with an "Error:" prefix and then exits the process with
  an exit code of `1`.

  @param {...*} args
    One or more values to log.
  */
  fatal(...args) {
    this.log(Logger.LEVEL_ERROR, chalk.red('Error:'), ...args);
    process.exit(1);
  }

  /**
  Gets the numerical severity value for the given log level name. If the given
  name isn't a valid log level, `0` will be returned.

  @param {string} levelName
  @returns {number}
  */
  getSeverity(levelName) {
    return Logger.SEVERITY.get(levelName) || 0;
  }

  /**
  Logs an info message with a "==>" prefix.

  @param {...*} args
    One or more values to log.

  @chainable
  */
  header(...args) {
    let message = typeof args[0] === 'string'
      ? args.shift()
      : '';

    return this.log(Logger.LEVEL_INFO, chalk.green('==> ') + message, ...args);
  }

  /**
  Logs an info message.

  @param {...*} args
    One or more values to log.

  @chainable
  */
  info(...args) {
    return this.log(Logger.LEVEL_INFO, ...args);
  }

  /**
  Logs a message with the given log level. This method is called internally by
  convenience methods like `info()`, `error()`, etc.

  @param {string} levelName
    Log level.

  @param {...*} args
    One or more values to log.

  @chainable
  */
  log(levelName, ...args) {
    if (!this.shouldLog(levelName)) {
      return this;
    }

    if (this.getSeverity(levelName) >= Logger.SEVERITY.get(Logger.LEVEL_WARN)) {
      console.error(...args);
    } else {
      console.log(...args);
    }

    return this;
  }

  /**
  Logs an info message with a "✔" prefix.

  @param {...*} args
    One or more values to log.

  @chainable
  */
  ok(...args) {
    let message = typeof args[0] === 'string'
      ? args.shift()
      : '';

    return this.log(Logger.LEVEL_INFO, chalk.green('✔ ') + message, ...args);
  }

  /**
  Returns a boolean indicating whether a message with the given log level should
  be logged based on this logger's current threshold.

  If a _callback_ is passed, it will be called if the given log level is within
  this logger's current threshold.

  @param {string} levelName
  @param {function} callback
  @returns {boolean}
  */
  shouldLog(levelName, callback) {
    if (this.getSeverity(levelName) >= this._minSeverity) {
      if (callback) {
        callback();
      }

      return true;
    }

    return false;
  }

  /**
  Logs a warning message with a "Warning:" prefix.

  @param {...*} args
    One or more values to log. Will be formatted using Node's `util.format()`,
    so non-string values will be formatted nicely.

  @chainable
  */
  warn(...args) {
    return this.log(Logger.LEVEL_WARN, chalk.yellow('Warning:'), ...args);
  }
}

/**
Alias for `warn()`.

@chainable
*/
Logger.prototype.warning = Logger.prototype.warn;

// -- Static Properties --------------------------------------------------------
Logger.LEVEL_DEBUG = 'debug';
Logger.LEVEL_INFO = 'info';
Logger.LEVEL_WARN = 'warn';
Logger.LEVEL_ERROR = 'error';

/**
Map of log level names to severity numbers. A higher number indicates a higher
severity.

@type {Map<string, number>}
*/
Logger.SEVERITY = new Map([
  [ Logger.LEVEL_DEBUG, 10 ],
  [ Logger.LEVEL_INFO, 20 ],
  [ Logger.LEVEL_WARN, 30 ],
  [ Logger.LEVEL_ERROR, 40 ]
]);

module.exports = Logger;
