const path = require('node:path');
const js = require('@eslint/js');
const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: path.resolve(__dirname, '../../tooling/eslint-config'),
  recommendedConfig: js.configs.recommended,
});

module.exports = [...compat.config(require('../../tooling/eslint-config/react.js'))];