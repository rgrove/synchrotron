'use strict';

const { readFileSync } = require('graceful-fs');

/**
Reads and parses the JSON config file at the given path.

@param {string} configPath
  Config file path.

@returns {Object<string, *>}
  Config object.
*/
module.exports = function parseConfigFile(configPath) {
  let configJson = readFileSync(configPath, 'utf8').trim();
  return configJson.length > 0 ? JSON.parse(configJson) : {};
};
