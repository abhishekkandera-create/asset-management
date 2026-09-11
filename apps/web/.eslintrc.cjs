module.exports = {
  extends: ['../../.eslintrc.cjs', 'plugin:react-hooks/recommended'],
  env: { browser: true, es2022: true },
  parserOptions: {
    project: './tsconfig.app.json',
    tsconfigRootDir: __dirname,
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react-hooks'],
  ignorePatterns: ['dist', 'node_modules', 'vite.config.ts', '*.config.js'],
  rules: {
    // The new JSX transform means React need not be in scope.
    'react/react-in-jsx-scope': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
};
