#!/usr/bin/env node
import { createRequire } from 'module';
import path from 'path';

import { findUp } from 'find-up';
import chalk from 'chalk';
import fs from 'graceful-fs';
import notifier from 'node-notifier';
import ora from 'ora';
import which from 'which';
import yargs from 'yargs';

import Logger from '../lib/Logger.mjs';
import Synchrotron from '../lib/Synchrotron.mjs';

const pkg = createRequire(import.meta.url)('../package.json');

// -- Constants ----------------------------------------------------------------
const cliState = {
  argv: process.argv.slice(2),
  defaultOptions: {
    source: process.cwd(),
    verbosity: Logger.LEVEL_INFO,
  },
  log: new Logger(),
  options: {},
  spinner: ora(),
  syncCount: 0,
  syncReportDebounceCount: 0,
  syncReportItemCount: 0,
  syncReportTimeout: null,
};

const nodeMinimumMajorVersion = 12;

// -- Private Functions --------------------------------------------------------
async function main(state) {
  let { log, options, spinner } = state;

  if (!isSupportedNodeVersion(process.version)) {
    log.fatal(`Node ${process.version} is not supported. Please use Node ${nodeMinimumMajorVersion} or higher.`);
  }

  await addDefaultsToOptions(state);
  validateOptions(state);

  log.debug('options:', options);

  if (options.dryRun) {
    log.header('Dry run mode is enabled. Changes will only be simulated.');
  }

  if (options.ignorePath) {
    log.header(`Using ignore file ${chalk.blue(options.ignorePath)}`);
  }

  log.header(`Syncing ${chalk.blue(options.source)} to ${chalk.blue(options.dest)}`);

  let synchrotron = new Synchrotron(options.dest, options.source, {
    deleteIgnored: options.deleteIgnored,
    dryRun: options.dryRun,
    ignorePath: options.ignorePath,
    logger: log,
    rsyncPath: options.rsyncPath,
  });

  synchrotron
    .on('debounce', ({ pendingChanges }) => {
      log.shouldLog(Logger.LEVEL_INFO, () => {
        let pathsText = pendingChanges === 1 ? 'path' : 'paths';
        spinner.start(`Rapid changes detected! Waiting for things to settle down. ${chalk.gray(`(${pendingChanges} ${pathsText} changed)`)}`);
      });
    })

    .on('rsyncStderr', ({ level, line }) => {
      spinner.stop();
      log.log(level, chalk.yellow('!'), line);
    })

    .on('rsyncStdout', ({ label, level, message }) => {
      spinner.stop();
      log.log(level, label, chalk.gray(message));
    })

    .on('syncStart', () => {
      spinner.stop();
    })

    .on('syncEnd', ({ stats }) => {
      spinner.stop();
      state.syncCount += 1;

      if (stats.itemsSynced === 0 && !options.once) {
        // Don't report empty syncs, which can occur when changes are detected
        // to paths that are ultimately ignored by rsync.
        return;
      }

      state.syncReportItemCount += stats.itemsSynced;
      scheduleSyncReport(state);
    })

    .on('warning', ({ message }) => {
      spinner.stop();
      log.warn(chalk.yellow('!'), message);
    });

  if (!options.once) {
    // Start watching before running the initial sync so that any changes that
    // occur during the initial sync won't be missed.
    synchrotron.watch();
  }

  await synchrotron.sync();

  if (options.once) {
    return;
  }

  log.header(`Watching for changes in ${chalk.blue(options.source)}`);
}

async function addDefaultsToOptions({ options, defaultOptions, log }) {
  Object.assign(options, {
    ...defaultOptions,
    ...options,
  });

  log.threshold = options.verbosity;

  if (!options.ignorePath) {
    if (options.excludeFrom) {
      // Ruby Synchrotron backcompat.
      log.warn(`The ${chalk.blue('--exclude-from')} option is deprecated. Use ${chalk.blue('--ignore-path')} instead.`);
      options.ignorePath = options.excludeFrom;
    } else {
      options.ignorePath = await findUp('.synchrotron-ignore', { cwd: options.source }); // eslint-disable-line require-atomic-updates
    }
  }

  if (!options.rsyncPath) {
    try {
      options.rsyncPath = await which('rsync'); // eslint-disable-line require-atomic-updates
      log.debug(`Found rsync at ${options.rsyncPath}`);
    } catch (err) {
      log.fatal(`Couldn't find an rsync executable. Please use ${chalk.blue('--rsync-path')} to specify the path to rsync.`);
    }
  }
}

function isSupportedNodeVersion(version) {
  let majorVersion = parseInt(version.replace('v', ''), 10);
  return majorVersion >= nodeMinimumMajorVersion;
}

function logSyncReport(state) {
  let { log, options, spinner, syncReportItemCount } = state;

  if (syncReportItemCount === 0 && !options.once) {
    return;
  }

  let itemsText = syncReportItemCount === 1 ? 'item' : 'items';
  let timestamp = new Date().toLocaleTimeString();

  spinner.stop();
  log.ok(`${chalk.gray(timestamp)} Synced ${syncReportItemCount} ${itemsText} to ${chalk.blue(options.dest)}`);

  if (options.notify) {
    notifier.notify({
      title: 'Synchrotron',
      message: `Synced ${syncReportItemCount} ${itemsText} to ${options.dest}`,
    });
  }

  state.syncReportItemCount = 0;
}

function parseCliOptions({ argv, defaultOptions, log }) {
  /** @type {yargs} */
  let y = yargs();

  return y
    .usage('$0', pkg.description)
    .group([ 'dest', 'source' ], chalk.bold('Primary Options:'))

    .option('dest', {
      desc: 'Destination to sync files to, as an rsync-compatible path [required]',
      requiresArg: true,
      type: 'string',
    })

    .option('delete-ignored', {
      desc: 'Delete ignored files and directories from the destination',
      type: 'boolean',
    })

    .option('dry-run', {
      desc: "Show what would've been synced, but don't actually sync it",
      type: 'boolean',
    })

    .help('help')
    .alias('help', 'h')

    .option('ignore-path', {
      desc: 'Path to a file containing filename and directory patterns to ignore',
      normalize: true,
      type: 'string',
    })

    .option('no-color', {
      desc: 'Disable colors in CLI output',
      type: 'boolean',
    })

    .option('notify', {
      desc: 'Display a system notification when a sync operation completes or an error occurs',
      type: 'boolean',
    })

    .option('once', {
      desc: 'Sync once and then exit instead of watching for changes',
      type: 'boolean',
    })

    .option('rsync-path', {
      desc: `Path to the rsync executable [default: rsync]`,
      normalize: true,
      requiresArg: true,
    })

    .option('source', {
      desc: `Local directory to sync files from [default: ${defaultOptions.source}]`,
      normalize: true,
      requiresArg: true,
    })

    .option('verbosity', {
      desc: `Set output verbosity [default: ${defaultOptions.verbosity}]`,
      choices: [ Logger.LEVEL_DEBUG, Logger.LEVEL_INFO, Logger.LEVEL_WARN, Logger.LEVEL_ERROR ],
      requiresArg: true,
    })

    .version(pkg.version)
    .parserConfiguration({
      'strip-aliased': true,
      'strip-dashed': true,
    })
    .updateStrings({
      'Options:': chalk.bold('Other Options:'),
    })
    .wrap(y.terminalWidth())

    // Backcompat for positional dest and source arguments, like in the old Ruby
    // version of Synchrotron.
    .middleware(args => {
      if (args._.length > 0 && !args.dest) {
        args.dest = args._.shift();
        log.warn(`Specifying the destination as a positional argument is deprecated. Use the ${chalk.blue('--dest')} option instead.`);
      }

      if (args._.length > 0 && (!args.source || args.source === process.cwd())) {
        args.source = path.normalize(args._.shift());
        log.warn(`Specifying the source as a positional argument is deprecated. Use the ${chalk.blue('--source')} option instead.`);
      }
    }, true)

    .parse(argv);
}

function scheduleSyncReport(state) {
  if (state.syncCount === 1) {
    // Always log immediately on the initial sync.
    return void logSyncReport(state);
  }

  if (state.syncReportTimeout) {
    clearTimeout(state.syncReportTimeout);
    state.syncReportDebounceCount += 1;
  } else {
    state.syncReportDebounceCount = 0;
  }

  // Use exponential backoff to avoid logging sync reports too rapidly.
  let delay = Math.round(Math.min(2000, 1000 * Math.pow(1.2, state.syncReportDebounceCount)));

  state.syncReportTimeout = setTimeout(() => {
    state.syncReportTimeout = null;
    logSyncReport(state);
  }, delay);
}

function validateOptions({ log, options }) {
  if (!options.dest) {
    log.fatal(`No sync destination was specified. Use ${chalk.blue('--dest')} to specify a destination.`);
  }

  if (options.ignorePath) {
    options.ignorePath = path.resolve(options.ignorePath);

    try {
      fs.accessSync(options.ignorePath, fs.constants.R_OK);
    } catch (_) {
      log.fatal(`The ignore file ${chalk.blue(options.ignorePath)} was not found or is not readable.`);
    }
  }

  options.rsyncPath = path.resolve(options.rsyncPath);

  try {
    fs.accessSync(options.rsyncPath, fs.constants.X_OK);
  } catch (_) {
    log.fatal(`Rsync path ${chalk.blue(options.rsyncPath)} was not found or cannot be executed. Use ${chalk.blue('--rsync-path')} to specify the path to an rsync executable.`);
  }

  options.source = path.resolve(options.source);

  try {
    fs.accessSync(options.source, fs.constants.R_OK);
  } catch (_) {
    log.fatal(`Source directory ${chalk.blue(options.source)} was not found or is not readable.`);
  }
}

// -- Init ---------------------------------------------------------------------
let { log } = cliState;

cliState.options = parseCliOptions(cliState);

process.on('unhandledRejection', reason => {
  if (cliState.options.notify) {
    try {
      notifier.notify({
        title: 'Synchrotron',
        message: `Fatal error: ${/** @type {any} */ (reason)?.message || reason}`,
      });
    } catch (_) {} // eslint-disable-line no-empty
  }

  log.fatal(reason);
});

main(cliState).catch(err => {
  if (cliState.options.notify) {
    try {
      notifier.notify({
        title: 'Synchrotron',
        message: `Fatal error: ${err.message || err}`,
      });
    } catch (_) {} // eslint-disable-line no-empty
  }

  log.fatal(err);
});
