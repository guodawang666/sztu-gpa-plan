module.exports = {
  apps: [
    {
      name: 'sztu-gpa-api',
      cwd: './api',
      script: 'dist/server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3000',
      },
    },
  ],
};
