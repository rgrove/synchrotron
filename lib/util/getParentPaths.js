'use strict';

const { normalize } = require('path').posix;

/**
Returns an array containing each parent path of the given relative or absolute
POSIX _path_, starting from the root.

Example:

    getParentPaths('foo/bar/baz/quux');
    // => [ 'foo', 'foo/bar', 'foo/bar/baz' ]

    getParentPaths('/foo/bar/baz/quux');
    // => [ '/', '/foo', '/foo/bar', '/foo/bar/baz' ]

@param {string} path
  POSIX path.

@returns {string[]}
*/
module.exports = function getParentPaths(path) {
  return normalize(path)
    .split('/')
    .slice(0, -1)
    .map((pathSegment, index, pathSegments) => {
      if (index === 0) {
        return pathSegment || '/';
      }

      return pathSegments
        .slice(0, index)
        .join('/') + '/' + pathSegment;
    });
};
