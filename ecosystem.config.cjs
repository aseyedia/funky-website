// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'funky-website-ui',
      script: './server.js',
      instances: 1, // Single instance
      exec_mode: 'fork', // Use 'fork' mode instead of 'cluster'
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080, // Ensure this matches your nginx proxy port
      },
    },
  ],
};

