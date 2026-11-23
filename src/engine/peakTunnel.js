const { spawn } = require('child_process');
const net = require('net');
const { Client } = require('ssh2');

const PINGGY_ENDPOINTS = [
  { host: 'free.pinggy.io', port: 443, username: 'tcp', label: 'Pinggy Free TCP (443)' },
  { host: 'a.pinggy.io', port: 443, username: 'tcp', label: 'Pinggy Alt TCP (443)' }
];

function stripAnsi(text) {
  return String(text || '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
}

function tryOpenSsh2Endpoint(endpoint, { getTargetPort, onClose, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const activeSockets = new Set();
    let settled = false;
    let established = false;
    let closedNotified = false;
    let combined = '';

    const notifyClose = (reason) => {
      for (const s of activeSockets) {
        try {
          s.destroy();
        } catch {}
      }
      activeSockets.clear();
      if (established && !closedNotified) {
        closedNotified = true;
        if (typeof onClose === 'function') {
          onClose(reason);
        }
      }
    };

    const failBeforeReady = (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        try {
          conn.destroy();
        } catch {}
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    const timer = setTimeout(() => {
      failBeforeReady(new Error(`Timeout tunelu SSH2 (${endpoint.host}:${endpoint.port})`));
    }, timeoutMs);

    conn.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
      finish(Array.isArray(prompts) ? prompts.map(() => '') : []);
    });

    conn.on('tcp connection', (_info, accept, rejectTcp) => {
      let stream;
      try {
        stream = accept();
      } catch {
        try {
          if (typeof rejectTcp === 'function') rejectTcp();
        } catch {}
        return;
      }

      stream.pause();
      const targetPort = Math.max(1, Math.min(65535, Number(getTargetPort?.()) || 25565));
      const localSock = net.connect({ host: '127.0.0.1', port: targetPort });
      activeSockets.add(stream);
      activeSockets.add(localSock);
      localSock.setNoDelay(true);

      const teardown = () => {
        activeSockets.delete(stream);
        activeSockets.delete(localSock);
        if (!stream.destroyed) stream.destroy();
        if (!localSock.destroyed) localSock.destroy();
      };

      localSock.once('connect', () => {
        if (stream.destroyed) {
          localSock.destroy();
          return;
        }
        stream.pipe(localSock);
        localSock.pipe(stream);
        stream.resume();
      });

      localSock.on('error', teardown);
      stream.on('error', teardown);
      localSock.on('close', teardown);
      stream.on('close', teardown);
    });

    const inspectText = (chunk) => {
      combined += stripAnsi(chunk.toString('utf8'));
      const match = combined.match(/tcp:\/\/([a-zA-Z0-9.-]+:\d+)/);
      if (match && match[1] && !settled) {
        settled = true;
        established = true;
        clearTimeout(timer);
        resolve({
          rawAddress: match[1],
          provider: endpoint.label,
          transport: 'ssh2',
          close: () => {
            closedNotified = true;
            for (const s of activeSockets) {
              try {
                s.destroy();
              } catch {}
            }
            activeSockets.clear();
            try {
              conn.end();
              setTimeout(() => {
                try {
                  conn.destroy();
                } catch {}
              }, 250).unref?.();
            } catch {}
          }
        });
      }
    };

    const startForwardAndShell = () => {
      const openShell = () => {
        conn.shell(false, (shellErr, stream) => {
          if (shellErr) {
            return failBeforeReady(shellErr);
          }
          stream.on('data', inspectText);
          if (stream.stderr) {
            stream.stderr.on('data', inspectText);
          }
          stream.on('close', () => {
            if (!settled) {
              failBeforeReady(new Error('Strumień powłoki SSH2 zamknięty przed przyznaniem adresu.'));
            } else {
              notifyClose('Strumień tunelu Pinggy zamknięty.');
            }
          });
          stream.on('error', (sErr) => {
            if (!settled) failBeforeReady(sErr);
          });
        });
      };

      conn.forwardIn('0.0.0.0', 0, (fwdErr) => {
        if (!fwdErr) return openShell();
        conn.forwardIn('', 0, (fwdErr2) => {
          if (fwdErr2) return failBeforeReady(fwdErr2);
          return openShell();
        });
      });
    };

    conn.on('ready', startForwardAndShell);
    conn.on('error', (err) => {
      if (!settled) {
        failBeforeReady(err);
      } else {
        notifyClose(err?.message || 'Błąd połączenia SSH2.');
      }
    });
    conn.on('close', () => {
      if (!settled) {
        failBeforeReady(new Error('Połączenie SSH2 zamknięte przed uruchomieniem tunelu.'));
      } else {
        notifyClose('Tunel publiczny został rozłączony.');
      }
    });

    conn.connect({
      host: endpoint.host,
      port: endpoint.port,
      username: endpoint.username,
      password: '',
      tryKeyboard: true,
      readyTimeout: Math.min(timeoutMs, 12000),
      keepaliveInterval: 20000,
      keepaliveCountMax: 3,
      hostVerifier: () => true
    });
  });
}

function trySystemSshFallback({ targetPort, onClose, timeoutMs = 14000 }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let established = false;
    let closedNotified = false;
    let combined = '';

    const child = spawn(
      'ssh',
      [
        '-p',
        '443',
        '-o',
        'StrictHostKeyChecking=no',
        '-o',
        'UserKnownHostsFile=NUL',
        '-o',
        'PubkeyAuthentication=no',
        '-o',
        'PasswordAuthentication=no',
        '-o',
        'PreferredAuthentications=none,keyboard-interactive,password',
        '-o',
        'ServerAliveInterval=30',
        '-o',
        'ExitOnForwardFailure=yes',
        '-o',
        'ConnectTimeout=10',
        '-T',
        `-R0:127.0.0.1:${targetPort}`,
        'tcp@free.pinggy.io'
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    const fail = (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        try {
          child.kill();
        } catch {}
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    const timer = setTimeout(() => {
      fail(new Error('Przekroczono czas oczekiwania na systemowy tunel SSH.'));
    }, timeoutMs);

    const inspectOutput = (chunk) => {
      combined += stripAnsi(chunk.toString('utf8'));
      const match = combined.match(/tcp:\/\/([a-zA-Z0-9.-]+:\d+)/);
      if (match && match[1] && !settled) {
        settled = true;
        established = true;
        clearTimeout(timer);
        resolve({
          rawAddress: match[1],
          provider: 'OpenSSH TCP (443)',
          transport: 'system-ssh',
          close: () => {
            closedNotified = true;
            try {
              child.kill();
            } catch {}
          }
        });
      }
    };

    child.stdout.on('data', inspectOutput);
    child.stderr.on('data', inspectOutput);

    child.on('error', (err) => {
      fail(err);
    });

    child.on('exit', () => {
      clearTimeout(timer);
      if (!settled) {
        fail(new Error('Systemowy klient SSH zakończył się przed przydzieleniem adresu.'));
      } else if (established && !closedNotified) {
        closedNotified = true;
        if (typeof onClose === 'function') {
          onClose('Sesja tunelu SSH zakończyła się.');
        }
      }
    });
  });
}

async function openPeakSshTunnel({
  getTargetPort,
  onLog = null,
  onClose = null,
  timeoutMs = 15000
}) {
  const errors = [];

  for (const endpoint of PINGGY_ENDPOINTS) {
    try {
      const handle = await tryOpenSsh2Endpoint(endpoint, {
        getTargetPort,
        onClose,
        timeoutMs
      });
      return handle;
    } catch (err) {
      const msg = err?.message || String(err);
      errors.push(`${endpoint.host}: ${msg}`);
      if (typeof onLog === 'function') {
        onLog('WARN', `Próba połączenia tunelu (${endpoint.host}) nie powiodła się: ${msg}`);
      }
    }
  }

  try {
    const port = Math.max(1, Math.min(65535, Number(getTargetPort?.()) || 25565));
    return await trySystemSshFallback({ targetPort: port, onClose, timeoutMs });
  } catch (fallbackErr) {
    errors.push(`ssh fallback: ${fallbackErr?.message || String(fallbackErr)}`);
  }

  throw new Error(
    `Nie udało się zestawić publicznego tunelu TCP przez port 443 (${errors.join(' | ')}). Sprawdź połączenie z internetem lub zaporę sieciową.`
  );
}

module.exports = {
  PINGGY_ENDPOINTS,
  openPeakSshTunnel,
  stripAnsi
};
