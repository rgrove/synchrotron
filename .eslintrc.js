'use strict';

module.exports = {
  extends: [
    '@rgrove/eslint-config',
    '@rgrove/eslint-config/commonjs',
    '@rgrove/eslint-config/node',
  ],
  overrides: [
    {
      files: ['**/*.mjs'],
      extends: [
        '@rgrove/eslint-config',
        '@rgrove/eslint-config/modules',
        '@rgrove/eslint-config/node',
      ],
    },
  ],
};
