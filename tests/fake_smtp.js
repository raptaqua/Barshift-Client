// Minimaalinen SMTP-palvelin testeihin: ottaa vastaan viestit muistiin (ei todennusta, ei TLS:ää).
const net = require('net');

function decodeHeader(v) {
  return v.replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/gi, (_, b) => Buffer.from(b, 'base64').toString('utf8'));
}
function parseMessage(raw, to) {
  const [head, ...rest] = raw.split('\r\n\r\n');
  const headers = {};
  head.replace(/\r\n[ \t]+/g, ' ').split('\r\n').forEach(l => { const i = l.indexOf(':'); if (i > 0) headers[l.slice(0, i).toLowerCase()] = l.slice(i + 1).trim(); });
  let body = rest.join('\r\n\r\n');
  if ((headers['content-transfer-encoding'] || '').toLowerCase() === 'base64') body = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  return { to, subject: decodeHeader(headers.subject || ''), from: headers.from, body, headers };
}

function start(port) {
  const messages = [];
  const server = net.createServer(sock => {
    let mode = 'cmd', buf = '', data = '', rcpt = '';
    const send = s => sock.write(s + '\r\n');
    send('220 fake.smtp ESMTP');
    sock.on('data', chunk => {
      buf += chunk.toString('utf8');
      for (;;) {
        if (mode === 'data') {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          data = buf.slice(0, end); buf = buf.slice(end + 5); mode = 'cmd';
          messages.push(parseMessage(data.replace(/^\.\./gm, '.'), rcpt)); send('250 OK queued');
          continue;
        }
        const nl = buf.indexOf('\r\n'); if (nl < 0) return;
        const line = buf.slice(0, nl); buf = buf.slice(nl + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') send('250 fake.smtp');
        else if (cmd === 'MAIL') send('250 OK');
        else if (cmd === 'RCPT') { rcpt = (line.match(/<([^>]+)>/) || [])[1] || ''; send('250 OK'); }
        else if (cmd === 'DATA') { mode = 'data'; send('354 go ahead'); }
        else if (cmd === 'QUIT') { send('221 bye'); sock.end(); return; }
        else send('250 OK');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise(res => server.listen(port, '127.0.0.1', () => res({ messages, close: () => server.close() })));
}
module.exports = { start };
