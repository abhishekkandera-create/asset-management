module.exports = {
  extends: ['../../.eslintrc.cjs'],
  parserOptions: { project: './tsconfig.eslint.json', tsconfigRootDir: __dirname },
  ignorePatterns: ['dist', 'node_modules', 'prisma/migrations', '*.config.ts', 'vitest.workspace.ts'],
  rules: {
    // Nest controllers and services rely on decorator metadata from empty
    // constructors and parameter properties.
    '@typescript-eslint/no-extraneous-class': 'off',
  },
  overrides: [
    {
      files: ['test/**/*.ts', 'prisma/seed*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-console': 'off',
      },
    },
  ],
};
