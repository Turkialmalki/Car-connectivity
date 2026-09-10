module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  settings: { react: { version: 'detect' } },
  env: { es2022: true, node: true, jest: true },
  ignorePatterns: ['node_modules/', '.expo/', 'dist/', 'web-build/', 'babel.config.js', 'metro.config.js', 'jest.config.js'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  overrides: [
    {
      // React Three Fiber turns three.js classes into JSX intrinsics
      // (<ambientLight />, <directionalLight />). The React plugin's DOM
      // property list does not know them, so it flags every valid prop.
      files: ['src/components/vehicle-3d/**/*.tsx'],
      rules: { 'react/no-unknown-property': 'off' },
    },
  ],
};
