module.exports = {
  apps: [
    {
      name: "bot-wa",
      script: "src/index.ts",
      interpreter: "bun",
      watch: true,
      ignore_watch: ["node_modules", "auth_info_baileys"],
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
