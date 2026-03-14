import fs from 'fs';
import path from 'path';
import nunjucks from 'nunjucks';

function listFilesRecursive(dir) {
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  var out = [];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var p = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(listFilesRecursive(p));
    else out.push(p);
  }
  return out;
}

function compileAll(viewsDir) {
  var env = new nunjucks.Environment(new nunjucks.FileSystemLoader(viewsDir, { noCache: true }), {
    autoescape: true
  });

  var files = listFilesRecursive(viewsDir);
  var templates = [];
  for (var i = 0; i < files.length; i++) {
    if (files[i].endsWith('.njk')) templates.push(path.relative(viewsDir, files[i]));
  }

  var failures = [];
  for (var j = 0; j < templates.length; j++) {
    var tpl = templates[j];
    try {
      env.getTemplate(tpl, true);
    } catch (err) {
      failures.push({ template: tpl, error: err });
    }
  }

  if (failures.length) {
    var msg = 'Failed to compile ' + failures.length + ' template(s):\n';
    for (var k = 0; k < failures.length; k++) {
      var e = failures[k].error;
      msg +=
        '- ' + failures[k].template + ': ' + (e && e.message ? String(e.message) : String(e)) + (k === failures.length - 1 ? '' : '\n');
    }
    throw new Error(msg);
  }

  return templates.length;
}

var viewsDir = process.env.VIEWS_DIR || path.resolve(process.cwd(), 'views');
try {
  var compiled = compileAll(viewsDir);
  if (!compiled) throw new Error('No .njk templates found under: ' + viewsDir);
  process.stdout.write('OK: compiled ' + compiled + ' template(s)\n');
  process.exit(0);
} catch (err) {
  process.stderr.write((err && err.message ? String(err.message) : String(err)) + '\n');
  process.exit(1);
}

