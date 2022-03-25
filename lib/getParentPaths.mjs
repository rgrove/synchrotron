import { posix } from 'path';

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
export default function getParentPaths(path) {
  return posix
    .normalize(path)
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
}
