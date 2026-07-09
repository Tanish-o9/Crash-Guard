const { spawn } = require('child_process');

function startTunnel() {
  console.log('Starting localtunnel...');
  const tunnel = spawn('npx', ['localtunnel', '--port', '3000', '--local-host', '127.0.0.1'], {
    shell: true,
  });

  tunnel.stdout.on('data', (data) => {
    console.log(data.toString().trim());
  });

  tunnel.stderr.on('data', (data) => {
    console.error(`Error: ${data}`);
  });

  tunnel.on('close', (code) => {
    console.log(`localtunnel crashed with code ${code}. Restarting in 2 seconds...`);
    setTimeout(startTunnel, 2000);
  });
}

startTunnel();
