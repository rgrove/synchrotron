# @rgrove/synchrotron

Watches a local directory and syncs files to another directory or a remote destination using rsync whenever changes occur.

[![npm version](https://badge.fury.io/js/%40rgrove%2Fsynchrotron.svg)](https://badge.fury.io/js/%40rgrove%2Fsynchrotron)

## Why You Might Want It

You have some local files. Maybe thousands of them.

When you make local changes, you want those changes to be synced immediately to another location (like a remote development server).

You want this to be fast whether you make a change to one file or to thousands of files, because sometimes you change a lot of things at once, like when you check out another git branch, or run webpack, or do a massive find and replace.

## Quick Start

Install Synchrotron globally and view the available options:

```
npm i -g @rgrove/synchrotron
synchrotron --help
```

Or, if you prefer, install it locally in a project directory and run it via npm scripts or `npx`:

```
npm i @rgrove/synchrotron
npx @rgrove/synchrotron --help
```

If you're scared of commitment, you can skip the installation step entirely and let `npx` install Synchrotron on demand whenever you use it:

```
npx @rgrove/synchrotron --help
```

## Requirements

-   Node.js 12+
-   Rsync 2.6.7+
-   Tested on macOS. Might work on Linux. Probably won't work on Windows.

## Examples

_These examples assume you've installed Synchrotron globally. If you'd prefer to run it via `npx`, replace the command `synchrotron` with `npx @rgrove/synchrotron`._

Sync the current working directory over SSH to the path `/data/www` on the server `example.com` and then watch for changes:

```
synchrotron --dest example.com:/data/www
```

Sync the local directory `/Users/kevin` to the local directory `/Users/nora` once and then exit without watching for changes:

```
synchrotron --source /Users/kevin --dest /Users/nora --once
```

Pretend to sync the current working directory to a remote server and watch for changes, but don't actually sync anything (this is great if you just want to see what would happen):

```
synchrotron --dest example.com:/data/www --dry-run
```

See a list of all available options:

```
synchrotron --help
```

## Ignoring Files & Directories

You can use a `.synchrotron-ignore` file to specify file and directory names and patterns that Synchrotron should ignore.

Synchrotron will search for a `.synchrotron-ignore` file starting in the source directory, then its parent directory, then its parent's parent, and so on, stopping if it finds one. Or you can specify an ignore file manually with the `--ignore-path` option.

This file should contain a newline-separated list of rsync exclude pattern rules. The format is similar to — but not exactly the same as — the format of `.gitignore` files.

For example:

```
# Ignore a file or directory named "dist" no matter where it is in the directory
# hierarchy.
dist

# Ignore any file or directory whose name starts with "."
.*

# Ignore a file or directory named "dist", but only if it's in the root of the
# directory hierarchy.
/dist

# Ignore a file or directory named "dist", but only if it's inside a directory
# named "build" anywhere in the hierarchy.
build/dist

# Ignore a directory named "dist" as well as all of its contents.
dist/***
```

See the [rsync man page][rsync-man-page] for more details.

[rsync-man-page]:https://download.samba.org/pub/rsync/rsync.html

## Contributing

PRs with bug fixes are welcome!

Please get in touch before adding new features. I'm not likely to accept feature enhancements that I won't personally use since I won't be able to maintain them.
