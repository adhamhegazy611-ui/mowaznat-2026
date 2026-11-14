// بيشتغل كعملية منفصلة: الذاكرة بتترجع كلها لما يخلص (اللوح الضخمة كانت بتخلّص ذاكرة السيرفر)
const fs = require('fs');
const { spawn } = require('child_process');
const { analyze } = require('./qt');
const { surfaceGroups, civilCounts, scanDwgStream } = require('./surf');
process.on('message', async (m) => {
  try {
    if (m.mode === 'dxf') {
      let t = fs.readFileSync(m.file, m.latin1 ? 'latin1' : 'utf8');
      try { if (m.unlink) fs.unlinkSync(m.file); } catch (e) { /* */ }
      const r = analyze(t, !!m.latin1); t = null;
      process.send({ ok: true, r });
    } else {
      const ch = spawn(m.bin, ['-O', 'JSON', m.file], { stdio: ['ignore', 'pipe', 'ignore'] });
      const kill = setTimeout(() => ch.kill('SIGKILL'), m.timeout || 60000);
      const J = await scanDwgStream(ch.stdout).finally(() => clearTimeout(kill));
      const civil = civilCounts(J), sg = surfaceGroups(J, m.origin || null);
      process.send({ ok: true, r: { civil, groups: sg.groups } });
    }
  } catch (e) { process.send({ ok: false, error: String((e && e.message) || e) }); }
});
