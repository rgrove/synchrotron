#!/usr/bin/env node
'use strict';

const path = require('path');

const chalk = require('chalk');
const findUp = require('find-up');
const fs = require('graceful-fs');
const notifier = require('node-notifier');
const ora = require('ora');
const updateNotifier = require('update-notifier');
const yargs = require('yargs');

const Logger = require('../lib/Logger');
const pkg = require('../package.json');
const Synchrotron = require('../lib/Synchrotron');

// -- Constants ----------------------------------------------------------------
const cliState = {
  argv: process.argv,
  defaultOptions: {
    rsyncPath: '/usr/bin/rsync',
    source: process.cwd(),
    verbosity: Logger.LEVEL_INFO
  },
  log: new Logger(),
  options: {}
};

// -- Private Functions --------------------------------------------------------
async function main(state) {
  updateNotifier({ pkg }).notify();
  await addDefaultsToOptions(state);
  validateOptions(state);

  let { log, options } = state;
  log.debug('options:', options);

  if (options.dryRun) {
    log.header('Dry run mode is enabled. Changes will only be simulated.');
  }

  if (options.ignorePath) {
    log.header(`Using ignore file ${chalk.blue(options.ignorePath)}`);
  }

  log.header(`Syncing ${chalk.blue(options.source)} to ${chalk.blue(options.dest)}`);

  let synchrotron = new Synchrotron(options.dest, options.source, {
    dryRun: options.dryRun,
    ignorePath: options.ignorePath,
    logger: log,
    rsyncPath: options.rsyncPath
  });

  let spinner = ora();

  synchrotron
    .on('debounce', ({ pendingChanges }) => {
      log.shouldLog(Logger.LEVEL_INFO, () => {
        let pathsText = pendingChanges === 1 ? 'path' : 'paths';
        spinner.start(`Rapid changes detected! Waiting for things to settle down. ${chalk.gray(`(${pendingChanges} ${pathsText} changed)`)}`);
      });
    })

    .on('rsyncStderr', ({ line }) => {
      spinner.stop();
      log.info(chalk.yellow('!'), line);
    })

    .on('rsyncStdout', ({ label, message }) => {
      spinner.stop();
      log.info(label, chalk.gray(message));
    })

    .on('syncStart', () => {
      spinner.stop();
    })

    .on('syncEnd', ({ stats }) => {
      spinner.stop();

      if (stats.itemsSynced === 0 && !options.once) {
        // Don't report empty syncs, which can occur when changes are detected
        // to paths that are ultimately ignored by rsync.
        return;
      }

      let itemsText = stats.itemsSynced === 1 ? 'item' : 'items';
      log.ok(`${chalk.gray(new Date().toLocaleTimeString())} Synced ${stats.itemsSynced} ${itemsText} to ${chalk.blue(options.dest)}`);

      if (options.notify) {
        notifier.notify({
          title: 'Synchrotron',
          message: `Synced ${stats.itemsSynced} ${itemsText} to ${options.dest}`
        });
      }
    })

    .on('warning', ({ message }) => {
      spinner.stop();
      log.info(chalk.yellow('!'), message);
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
    ...options
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
}

function parseCliOptions({ argv, defaultOptions, log }) {
  return yargs
    .usage('$0', pkg.description)
    .group([ 'dest', 'source' ], chalk.bold('Primary Options:'))

    .option('dest', {
      desc: 'Destination to sync files to, as an rsync-compatible path [required]',
      requiresArg: true,
      type: 'string'
    })

    .option('dry-run', {
      desc: "Show what would've been synced, but don't actually sync it",
      type: 'boolean'
    })

    .help('help')
    .alias('help', 'h')

    .option('ignore-path', {
      desc: 'Path to a file containing filename and directory patterns to ignore',
      normalize: true,
      type: 'string'
    })

    .option('no-color', {
      desc: 'Disable colors in CLI output',
      type: 'boolean'
    })

    .option('notify', {
      desc: 'Display a system notification when a sync operation completes or an error occurs',
      type: 'boolean'
    })

    .option('once', {
      desc: 'Sync once and then exit instead of watching for changes',
      type: 'boolean'
    })

    .option('rsync-path', {
      desc: `Path to the rsync executable [default: ${defaultOptions.rsyncPath}]`,
      normalize: true,
      requiresArg: true
    })

    .option('source', {
      desc: `Local directory to sync files from [default: ${defaultOptions.source}]`,
      normalize: true,
      requiresArg: true
    })

    .option('verbosity', {
      desc: `Set output verbosity [default: ${defaultOptions.verbosity}]`,
      choices: [ Logger.LEVEL_DEBUG, Logger.LEVEL_INFO, Logger.LEVEL_WARN, Logger.LEVEL_ERROR ],
      requiresArg: true
    })

    .version()
    .parserConfiguration({
      'strip-aliased': true,
      'strip-dashed': true
    })
    .updateStrings({
      'Options:': chalk.bold('Other Options:')
    })
    .wrap(yargs.terminalWidth())

    // Backcompat for positional dest and source arguments, like in the old Ruby
    // version of Synchrotron.
    .middleware(args => {
      if (args._.length > 0 && !args.dest) {
        args.dest = args._.shift();
        log.warn(`Specifying the destination as a positional argument is deprecated. Use the ${chalk.blue('--dest')} option instead.`);
      }

      if (args._.length > 0 && (!args.source || args.source === process.cwd())) {
        args.source = path.normalize(argv._.shift());
        log.warn(`Specifying the source as a positional argument is deprecated. Use the ${chalk.blue('--source')} option instead.`);
      }
    }, true)

    .parse(argv);
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
    log.fatal(`Rsync path ${chalk.blue(options.rsyncPath)} was not found or cannot be executed. Use ${chalk.blue('--rsync-path')} to specify the path to an Rsync executable.`);
  }

  options.source = path.resolve(options.source);

  try {
    fs.accessSync(options.source, fs.constants.R_OK);
  } catch (_) {
    log.fatal(`Source directory ${chalk.blue(options.source)} was not found or is not readable.`);
  }
}

// -- Init ---------------------------------------------------------------------
if (require.main === module) {
  const { log } = cliState;
  const nodeMajorVersion = process.versions.node.split('.', 1)[0];

  cliState.options = parseCliOptions(cliState);

  process.on('unhandledRejection', reason => {
    if (reason.code === 'ENOENT'
        && reason.syscall === 'stat'
        && nodeMajorVersion === '8') {

      // Node.js 8.x incorrectly stats the destination of symlinks instead of the
      // links themselves, which can cause Chokidar to throw an error if a link
      // points to a nonexistent file. This isn't fatal, so don't let it kill the
      // process.
      log.warn(reason.message || reason);
      return;
    }

    if (cliState.options.notify) {
      try {
        notifier.notify({
          title: 'Synchrotron',
          message: `Fatal error: ${reason.message || reason}`
        });
      } catch (_) {} // eslint-disable-line no-empty
    }

    log.fatal(reason.message || reason);
  });

  main(cliState).catch(err => {
    if (cliState.options.notify) {
      try {
        notifier.notify({
          title: 'Synchrotron',
          message: `Fatal error: ${err.message || err}`
        });
      } catch (_) {} // eslint-disable-line no-empty
    }

    log.fatal(err.message);
  });
}
