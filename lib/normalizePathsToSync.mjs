import getNearestExistingPath from './getNearestExistingPath.mjs';

/**
Normalizes an array of paths to sync relative to the given _sourcePath_,
removing duplicates and resolving nonexistent paths to the nearest existing
parent.

@param {string} sourcePath
  Absolute source path (the root path being synced).

@param {string[]} pathsToSync
  Array of relative paths to be synced.

@returns {string[]}
  Array of normalized relative paths. If the entire source path should be
  synced, this array will contain the single item ".".
*/
export default function normalizePathsToSync(sourcePath, pathsToSync) {
  if (pathsToSync.includes('.')) {
    return [ '.' ];
  }

  let normalizedPaths = new Set();

  for (let i = 0; i < pathsToSync.length; ++i) {
    let path = pathsToSync[i];

    if (normalizedPaths.has(path)) {
      continue;
    }

    let nearestExistingPath = getNearestExistingPath(sourcePath, path);

    if (nearestExistingPath === '.') {
      return [ '.' ];
    }

    normalizedPaths.add(nearestExistingPath);
  }

  return Array.from(normalizedPaths);
}
