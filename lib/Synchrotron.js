'use strict';

const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const readline = require('readline');

const chalk = require('chalk');
const chokidar = require('chokidar');

const normalizePathsToSync = require('./normalizePathsToSync');
const getParentPaths = require('./getParentPaths');
const Logger = require('./Logger');

// -- Constants ----------------------------------------------------------------

/**
Default command line arguments that will always be passed to rsync.

@type {string[]}
*/
const RSYNC_DEFAULT_ARGS = [
  '--compress',
  '--delete-during',
  '--delete-excluded',
  '--delete',
  '--files-from=-',
  '--force',
  '--human-readable',
  '--links',
  '--omit-dir-times',
  '--out-format=%o %n',
  '--perms',
  '--recursive',
  '--times'
];

/**
Mapping of rsync operation labels to user-friendly labels to use in log output
when logging itemized changes from rsync.

@type {Map<string, string>}
*/
const RSYNC_OPERATION_LABELS = new Map([
  [ 'del.', chalk.red('d') ],
  [ 'send' , chalk.green('>') ]
]);

/**
Set of rsync error codes that we can recover from by retrying a full sync.

@type {Set<number>}
*/
const RSYNC_RECOVERABLE_ERROR_CODES = new Set([
  10, // Error in socket I/O
  11, // Error in file I/O
  12, // Error in rsync protocol data stream
  23, // Partial transfer due to error
  24, // Partial transfer due to vanished source files
]);

// -- Exports ------------------------------------------------------------------

/**
Monitors a source directory and syncs files to a destination directory when
changes occur.
*/
class Synchrotron extends EventEmitter {
  /**
  @param {string} dest
    Destination to sync files to. Must be an rsync-compatible path.

  @param {string} source
    Local directory to sync files from.

  @param {Object<string, *>} [options]
    Options.

    @param {number} [options.debounceMax]
      Maximum time in milliseconds to wait before syncing after a change occurs.

      When many changes occur rapidly, the debounce time will be gradually
      increased from _debounceMin_ to _debounceMax_ to avoid triggering too many
      rapid sync operations.

    @param {number} [options.debounceMin]
      Minimum time in milliseconds to wait before syncing after a change occurs.

      All changes that occur during this time will be coalesced and synced in a
      single operation, which can improve performance when lots of small changes
      are made very quickly.

    @param {boolean} [options.dryRun]
      When `true`, changes will be simulated but not actually made.

    @param {string} [options.ignorePath]
      Path to a file containing rsync exclude patterns (one per line) indicating
      paths that should be excluded from sync operations. See the rsync
      documentation for details on the exclude pattern format. It's similar to,
      but not exactly the same as, the format for `.gitignore` files.

    @param {Logger} [options.logger]
      Logger instance to use for log output.

    @param {number} [options.maxSyncLimit]
      If more than this many paths are passed to `sync()`, just sync the entire
      source directory to avoid doing unnecessary work validating each path.

    @param {string} [options.rsyncPath]
      Path to the rsync executable.
  */
  constructor(dest, source, options = {}) {
    super();

    let {
      debounceMax = 2000,
      debounceMin = 50,
      dryRun = false,
      ignorePath,
      logger = new Logger({ threshold: null }),
      rsyncPath = '/usr/bin/rsync'
    } = options;

    this.debounceMax = debounceMax;
    this.debounceMin = debounceMin;
    this.dest = dest;
    this.dryRun = dryRun;
    this.log = logger;
    this.rsyncPath = path.resolve(rsyncPath);

    if (ignorePath) {
      this.ignorePath = path.resolve(ignorePath);
    }

    // Add a trailing slash to the source path so rsync will sync the contents
    // of the directory rather than the directory itself.
    this.source = path.resolve(source) + '/';

    this._debounceCount = 0;
    this._pendingSyncPaths = new Set();
    this._pendingSyncTimeout = null;
    this._watcher = null;
  }

  // -- Public Attributes ------------------------------------------------------

  /**
  Whether a sync operation is currently in progress.

  @type {boolean}
  */
  get isSyncing() {
    return Boolean(this._syncPromise);
  }

  /**
  Whether Synchrotron is currently watching for changes.

  @type {boolean}
  */
  get isWatching() {
    return Boolean(this._watcher);
  }

  // -- Public Methods ---------------------------------------------------------

  /**
  Syncs source paths to the destination.

  @param {string[]} [pathsToSync]
    Array of paths to sync relative to the source directory. If not specified,
    the entire source directory will be synced.

  @returns {Promise<Object<string, *>>}
    Promise fulfilled with an object containing stats about the sync operation.

  @fires Synchrotron#rsyncStderr
  @fires Synchrotron#rsyncStdout
  @fires Synchrotron#syncEnd
  @fires Synchrotron#syncStart
  @fires Synchrotron#warning
  */
  async sync(pathsToSync = [ '.' ]) {
    if (this._syncPromise) {
      // A sync operation is already in progress. Wait for it to finish before
      // starting another one.
      await this._syncPromise;
    }

    this._syncPromise = new Promise((resolve, reject) => {
      let rsyncArgs = [];
      let stats = { itemsSynced: 0 };

      pathsToSync = normalizePathsToSync(this.source, pathsToSync);

      this.emit('syncStart', {
        paths: pathsToSync
      });

      if (pathsToSync.length === 0) {
          this.emit('syncEnd', {
            paths: pathsToSync,
            stats
          });

          return void resolve(stats);
      }

      if (this.dryRun) {
        rsyncArgs.push('--dry-run');
      }

      if (this.ignorePath) {
        rsyncArgs.push(`--filter=merge,e- ${this.ignorePath}`);
      }

      rsyncArgs = [
        ...RSYNC_DEFAULT_ARGS,
        ...rsyncArgs,
        this.source,
        this.dest
      ];

      this.log.debug(`Spawning ${this.rsyncPath} with args`, rsyncArgs);

      let rsync = spawn(this.rsyncPath, rsyncArgs, {
        cwd: this.source,
        stdio: 'pipe'
      });

      readline.createInterface({
        crlfDelay: Infinity,
        input: rsync.stdout
      }).on('line', line => {
        let [ operation, ...pathParts ] = line.split(' ');
        let label;
        let message;

        if (RSYNC_OPERATION_LABELS.has(operation)) {
          // Every file operation has a label, so this indicates a file or
          // directory was synced.
          stats.itemsSynced += 1;
          label = RSYNC_OPERATION_LABELS.get(operation);
          message = pathParts.join(' ');
        } else {
          // No operation means this is warning output of some kind.
          label = chalk.yellow('!');
          message = line;
        }

        this.emit('rsyncStdout', {
          label,
          line,
          message
        });
      });

      readline.createInterface({
        crlfDelay: Infinity,
        input: rsync.stderr
      }).on('line', line => {
        this.emit('rsyncStderr', { line });
      });

      rsync.on('close', code => {
        this._syncPromise = null;
        this.log.debug('rsync exited with code', code);

        if (code === 0) {
          this.emit('syncEnd', {
            paths: pathsToSync,
            stats
          });

          return void resolve(stats);
        }

        if (RSYNC_RECOVERABLE_ERROR_CODES.has(code)) {
          // rsync failed, but with an error that we can recover from by
          // retrying a full sync.
          this.emit('warning', {
            message: `rsync exited with error code ${code}; will retry a full sync`
          });

          return void resolve(this.sync());
        }

        let err = new Error(`rsync exited with error code ${code}`);
        this.emit('error', err);
        reject(err);
      });

      rsync.on('error', err => {
        this._syncPromise = null;
        reject(err);
      });

      this.log.debug('Syncing', pathsToSync);
      rsync.stdin.end(pathsToSync.join('\n'), 'utf8');
    });

    return this._syncPromise;
  }

  /**
  Stops watching for changes in the source directory.
  */
  unwatch() {
    if (this.isWatching) {
      this._watcher.close();
      this._watcher = null;
    }
  }

  /**
  Starts watching for changes in the source directory and syncing when changes
  occur.

  @fires Synchrotron#debounce
  */
  watch() {
    if (this.isWatching) {
      this.unwatch();
    }

    let pending = this._pendingSyncPaths;

    this._watcher = chokidar.watch(this.source, {
      atomic: true,
      cwd: this.source,
      disableGlobbing: true,
      followSymlinks: false,
      ignoreInitial: true
    });

    this._watcher.on('all', (eventName, eventPath) => {
      this.log.debug('Chokidar event:', eventName, eventPath);

      if (pending.has('.')) {
        // No point adding any more paths to sync since we already need to sync
        // the entire source path.
        return;
      }

      switch (eventName) {
        case 'add':
        case 'addDir':
        case 'change':
          // Add this path unless one of its parents is already waiting to be
          // synced.
          if (!getParentPaths(eventPath).some(parent => pending.has(parent))) {
            pending.add(eventPath);
          }
          break;

        case 'unlink':
        case 'unlinkDir': {
          // Since the path has been deleted, we can't tell rsync to sync it.
          // Instead we need to tell rsync to sync the parent path.
          pending.delete(eventPath);
          pending.add(path.posix.dirname(eventPath));
          break;
        }
      }

      if (pending.size > 0) {
        this._scheduleSync();
      }
    });
  }

  // -- Protected Methods ------------------------------------------------------
  _scheduleSync() {
    if (this._pendingSyncTimeout) {
      clearTimeout(this._pendingSyncTimeout);
      this._debounceCount += 1;

      if (this._debounceCount >= 8) {
        this.emit('debounce', {
          pendingChanges: this._pendingSyncPaths.size
        });
      }
    } else {
      this._debounceCount = 0;
    }

    // Use exponential backoff to avoid syncing too rapidly.
    let delay = Math.round(Math.min(this.debounceMax, this.debounceMin * Math.pow(1.5, this._debounceCount)));

    this._pendingSyncTimeout = setTimeout(() => {
      this._pendingSyncTimeout = null;

      if (this.isSyncing) {
        // A sync is already in progress, so wait a bit longer for it to finish.
        // Further changes will continue to be gathered up in the meantime.
        return void this._scheduleSync();
      }

      this.sync(Array.from(this._pendingSyncPaths));
      this._pendingSyncPaths.clear();
    }, delay);
  }
}

module.exports = Synchrotron;

// -- Docs ---------------------------------------------------------------------

/**
Emitted when many rapid filesystem changes have been detected, triggering a
backoff delay. Once changes have settled down, a sync operation will be started
and a `syncStart` event will be emitted.

@event Synchrotron#debounce
@type {Object}

@prop {number} pendingChanges
  Number of changed items waiting to be synced. Note that this number may differ
  from the final number of items that are actually synced once rsync filters out
  ignored and equivalent paths.
*/

/**
Emitted each time rsync prints a line to stderr.

@event Synchrotron#rsyncStderr
@type {Object}

@props {string} line
  Complete line of output.
*/

/**
Emitted each time rsync prints a line to stdout.

@event Synchrotron#rsyncStdout
@type {Object}

@prop {string} label
  CLI-friendly label for the line, with color if colors are enabled.

@prop {string} line
  Complete line of output.

@prop {string} message
  Just the message portion of the line without the operation prefix if this line
  is reporting a sync operation.
*/

/**
Emitted when a sync operation finishes successfully.

@event Synchrotron#syncEnd
@type {Object}

@prop {string[]} paths
  Paths that were sent to rsync by the sync operation.

@prop {object} stats
  Stats about the sync operation.

  @prop {number} stats.itemsSynced
    Number of items rsync reported as synced to the destination (either created,
    updated, or deleted).
*/

/**
Emitted when a sync operation starts.

@event Synchrotron#syncStart
@type {Object}

@prop {string[]} paths
  Paths that will be synced.
*/

/**
Emitted when a recoverable warning occurs during a sync operation.

@event Synchrotron#warning
@type {Object}

@prop {string} message
  Warning message.
*/
