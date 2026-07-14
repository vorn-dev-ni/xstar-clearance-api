// PM2 process definition for the production API. `cwd: __dirname` pins the
// working directory to the deploy dir so ConfigModule and prisma.config.ts
// find .env.production next to this file.
module.exports = {
  apps: [
    {
      name: 'system-x-star-api',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
