#!/usr/bin/env node
'use strict';

const path = require('path');

const chalk = require('chalk');
const findUp = require('find-up');
const fs = require('graceful-fs');
const ora = require('ora');
const yargs = require('yargs');

const Logger = require('../lib/Logger');
const Synchrotron = require('../lib/Synchrotron');

// -- Init ---------------------------------------------------------------------

// Default option values are applied manually instead of being specifed as yargs
// defaults. This makes it possible to ensure that defaults don't override
// values that are specified in an automatically discovered config file, which
// yargs won't know about.
const defaultOptions = {
  rsyncPath: '/usr/bin/rsync',
  source: process.cwd(),
  verbosity: Logger.LEVEL_INFO
};

const log = new Logger();
const nodeMajorVersion = process.versions.node.split('.', 1)[0];

const cliOptions = yargs
  .usage('$0', 'Watches a local directory and syncs files to another directory or a remote destination using rsync whenever changes occur.')
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
  .middleware(argv => {
    if (argv._.length > 0 && !argv.dest) {
      argv.dest = argv._.shift();
      log.warn(`Specifying the destination as a positional argument is deprecated. Use the ${chalk.blue('--dest')} option instead.`);
    }

    if (argv._.length > 0 && (!argv.source || argv.source === process.cwd())) {
      argv.source = path.normalize(argv._.shift());
      log.warn(`Specifying the source as a positional argument is deprecated. Use the ${chalk.blue('--source')} option instead.`);
    }
  }, true)

  .argv;

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

  log.fatal(reason.message || reason);
});

main().catch(err => {
  log.fatal(err.message);
});

// -- Private Functions --------------------------------------------------------
async function main() {
  await addDefaultsToOptions();
  validateOptions();

  log.debug('cliOptions:', cliOptions);

  if (cliOptions.dryRun) {
    log.header('Dry run mode is enabled. Changes will only be simulated.');
  }

  if (cliOptions.ignorePath) {
    log.header(`Using ignore file ${chalk.blue(cliOptions.ignorePath)}`);
  }

  log.header(`Syncing ${chalk.blue(cliOptions.source)} to ${chalk.blue(cliOptions.dest)}`);

  let synchrotron = new Synchrotron(cliOptions.dest, cliOptions.source, {
    dryRun: cliOptions.dryRun,
    ignorePath: cliOptions.ignorePath,
    logger: log,
    rsyncPath: cliOptions.rsyncPath
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

      if (stats.itemsSynced === 0 && !cliOptions.once) {
        // Don't report empty syncs, which can occur when changes are detected
        // to paths that are ultimately ignored by rsync.
        return;
      }

      let itemsText = stats.itemsSynced === 1 ? 'item' : 'items';
      log.ok(`${chalk.gray(new Date().toLocaleTimeString())} Synced ${stats.itemsSynced} ${itemsText} to ${chalk.blue(cliOptions.dest)}`);
    });

  if (!cliOptions.once) {
    // Start watching before running the initial sync so that any changes that
    // occur during the initial sync won't be missed.
    synchrotron.watch();
  }

  await synchrotron.sync();

  if (cliOptions.once) {
    return;
  }

  log.header(`Watching for changes in ${chalk.blue(cliOptions.source)}`);
}

async function addDefaultsToOptions() {
  Object.assign(cliOptions, {
    ...defaultOptions,
    ...cliOptions
  });

  log.threshold = cliOptions.verbosity;

  if (!cliOptions.ignorePath) {
    if (cliOptions.excludeFrom) {
      // Ruby Synchrotron backcompat.
      log.warn(`The ${chalk.blue('--exclude-from')} option is deprecated. Use ${chalk.blue('--ignore-path')} instead.`);
      cliOptions.ignorePath = cliOptions.excludeFrom;
    } else {
      cliOptions.ignorePath = await findUp('.synchrotron-ignore', { cwd: cliOptions.source }); // eslint-disable-line require-atomic-updates
    }
  }
}

function validateOptions() {
  if (!cliOptions.dest) {
    log.fatal(`No sync destination was specified. Use ${chalk.blue('--dest')} to specify a destination.`);
  }

  if (cliOptions.ignorePath) {
    try {
      fs.accessSync(cliOptions.ignorePath, fs.constants.R_OK);
    } catch (_) {
      log.fatal(`The ignore file ${chalk.blue(cliOptions.ignorePath)} was not found or is not readable.`);
    }
  }

  try {
    fs.accessSync(cliOptions.rsyncPath, fs.constants.X_OK);
  } catch (_) {
    log.fatal(`Rsync path ${chalk.blue(cliOptions.rsyncPath)} was not found or cannot be executed. Use ${chalk.blue('--rsync-path')} to specify the path to an Rsync executable.`);
  }

  cliOptions.source = path.resolve(cliOptions.source);

  try {
    fs.accessSync(cliOptions.source, fs.constants.R_OK);
  } catch (_) {
    log.fatal(`Source directory ${chalk.blue(cliOptions.source)} was not found or is not readable.`);
  }
}
