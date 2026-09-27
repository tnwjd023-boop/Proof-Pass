import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
export async function submissionServer(root = 'dist/submission') {
  const directory = resolve(root);
  const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.png':'image/png', '.mp4':'video/mp4', '.vtt':'text/vtt', '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
  const server = createServer(async (req, res) => {
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = resolve(directory, '.' + (path === '/' ? '/index.html' : path));
      if (!file.startsWith(directory + sep)) throw Error('path');
      const data = await readFile(file);
      const headers = { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control':'no-store', 'accept-ranges':'bytes' };
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Math.min(range[2] ? Number(range[2]) : data.length - 1, data.length - 1);
        if (start > end) { res.writeHead(416, { 'content-range': `bytes */${data.length}` }); res.end(); return; }
        res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${data.length}`, 'content-length':end-start+1 });
        res.end(data.subarray(start,end+1));
      } else {
        res.writeHead(200, { ...headers, 'content-length':data.length });
        res.end(data);
      }
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, url:'http://127.0.0.1:' + server.address().port };
}
