// pm2 on the VM. All three processes run on Node 22 from nvm and share var/parallaxpay.db.
//   pm2 startOrReload ecosystem.config.cjs --only parallaxpay-web
const HOME = process.env.HOME || '/home/ubuntu'
const NODE = `${HOME}/.nvm/versions/node/v22.23.2/bin`
const env = { NODE_ENV: 'production', PATH: `${NODE}:/usr/local/bin:/usr/bin:/bin` }

module.exports = {
  apps: [
    {
      name: 'parallaxpay-web',
      cwd: `${HOME}/parallaxpay`,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3500 -H 127.0.0.1',
      interpreter: `${NODE}/node`,
      env,
      max_memory_restart: '900M',
    },
    {
      name: 'parallaxpay-engine',
      cwd: `${HOME}/parallaxpay`,
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'engine/main.ts',
      interpreter: `${NODE}/node`,
      env,
      max_memory_restart: '700M',
      restart_delay: 5000,
      kill_timeout: 15000,
    },
    {
      // The agent on NEAR: reads markets, trades members' vault accounts inside their rules.
      name: 'parallaxpay-near',
      cwd: `${HOME}/parallaxpay`,
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'engine/near/main.ts',
      interpreter: `${NODE}/node`,
      env,
      max_memory_restart: '600M',
      restart_delay: 5000,
      kill_timeout: 30000,
    },
  ],
}
