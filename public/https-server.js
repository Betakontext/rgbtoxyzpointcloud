/*
# For further developments and participations
# visit and fork: https://github.com/betakontext/rgbtoxyzpointcloud
# Copyright (c) 2026 Christoph Medicus
# Licensed under the MIT License*/

// file: https-server.js
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const serveStatic = require('serve-static');
const finalhandler = require('finalhandler');

const static = serveStatic(__dirname); // bedient das aktuelle Verzeichnis

https.createServer({
  key : fs.readFileSync('localhost-key.pem'),
  cert: fs.readFileSync('localhost.pem')
}, (req, res) => {
  static(req, res, finalhandler(req, res));
}).listen(8443, () => console.log('HTTPS‑Server läuft: https://localhost:8443'));
