import globals from 'globals';

// The engine and content scripts are plain JS, so tsc does not check them.
// no-undef catches the references that only fail at runtime on Facebook.
export default [
  {
    files: ['src/engine/**/*.js', 'src/content/**/*.js', 'src/lib/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        ...globals.webextensions,
        require: 'readonly', // Facebook's own module loader, guarded by typeof at its one use
      },
    },
    rules: { 'no-undef': 'error' },
  },
];
