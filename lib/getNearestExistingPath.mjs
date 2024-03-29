import { resolve } from 'path';
import fs from 'graceful-fs';
import getParentPaths from './getParentPaths.mjs';

/**
Returns the nearest path, starting from _path_, that currently exists within
_basePath_, or "." if _basePath_ is the nearest existing path.

Note: _basePath_ is always assumed to exist.

@param {string} basePath
  Absolute base path to which _path_ is relative.

@param {string} path
  Path relative to _basePath_ at which to begin searching for the nearest
  existing path.

@returns {string}
*/
export default function getNearestExistingPath(basePath, path) {
  try {
    fs.accessSync(resolve(basePath, path));
    return path;
  } catch (_) {} // eslint-disable-line no-empty

  getParentPaths(path)
    .reverse()
    .forEach(parentPath => {
      try {
        fs.accessSync(resolve(basePath, path));
        return parentPath;
      } catch (_) {} // eslint-disable-line no-empty
    });

  return '.';
}
