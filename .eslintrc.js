module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    // React Hooks
    'react-hooks/exhaustive-deps': 'warn', // 检查 useEffect 依赖

    // TypeScript
    '@typescript-eslint/no-explicit-any': 'warn', // 警告 any 类型
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

    // 禁止 console.log (生产环境)
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',

    // 禁止 localStorage 存密码
    'no-restricted-globals': ['error',
      { name: 'localStorage', message: '禁止直接使用 localStorage 存储敏感数据，请使用加密存储或只存非敏感数据' },
      { name: 'sessionStorage', message: '禁止直接使用 sessionStorage 存储敏感数据' }
    ],
  },
  overrides: [
    {
      files: ['*.tsx', '*.ts'],
      rules: {
        // 特殊规则针对 TypeScript 文件
      }
    }
  ],
  settings: {
    react: {
      version: 'detect'
    }
  }
}
