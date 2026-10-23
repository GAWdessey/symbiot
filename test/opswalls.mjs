// The ops run's walls (agents.mjs opsWalls): an ops run isn't in Claude Code's sandbox (it needs ssh),
// so it runs in walls of Symbiot's own. Inside them it can't change what would turn the guard off or
// start something again later, can't change your ssh keys, can't read the vault's key or PIN file,
// and still works as before everywhere else (23 Oct 2026). Isolated HOME; the real walls when bwrap
// is here, else only the arguments.
//
//   node test/opswalls.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-opswalls-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const A = await import("../agents.mjs");
const put = (p, t = "x\n") => { mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, t); };
try {
  const act = join(CFG, "drafts", "act-0walls1"), repo = join(HOME, "work", "app");
  for (const f of [".bashrc", ".profile", ".claude/settings.json", ".ssh/id_ed25519", ".config/autostart/x.desktop", ".config/systemd/user/x.service", ".local/bin/tool"]) put(join(HOME, f));
  put(join(HOME, ".claude.json"), "{}"); put(join(HOME, ".claude/projects/p.jsonl"));
  for (const f of ["vault.key", "vault-pin.json", "vault.json", "agent-guard.json", "standing.json", "mind.json", "overrides/triggers/t.mjs"]) put(join(CFG, f), "secret-ish " + f + "\n");
  mkdirSync(join(act, ".symbiot"), { recursive: true }); mkdirSync(repo, { recursive: true });

  console.log("WHO GETS WALLS — ops runs only, on Linux with bwrap, unless turned off");
  const has = (c) => c === "bwrap";
  ok("an ops run gets them; a repo lane (Claude Code's sandbox) doesn't", !!A.opsWalls(act, { has, platform: "linux" }) && A.opsWalls(repo, { has, platform: "linux" }) === null);
  ok("…not without bwrap, off Linux, or with opsWalls: false", A.opsWalls(act, { has: () => false, platform: "linux" }) === null && A.opsWalls(act, { has, platform: "darwin" }) === null && A.opsWalls(act, { has, platform: "linux", cfg: { opsWalls: false } }) === null);
  const w = A.opsWalls(act, { has, platform: "linux" }), j = w.join(" ");
  ok("the disk as it is, then read-only over what matters, the vault's key and PIN file covered, and the run's folder to start in", j.startsWith("--die-with-parent --dev-bind / /") && j.includes(`--ro-bind ${join(HOME, ".bashrc")}`) && j.includes(`--ro-bind ${join(HOME, ".claude/settings.json")}`) && j.includes(`--ro-bind /dev/null ${join(CFG, "vault.key")}`) && j.includes(`--ro-bind ${join(CFG, "agent-guard.json")}`) && j.endsWith(`--chdir ${act}`), j);
  ok("…the command inside them, quoted for the shell", A.walled("echo 'hi'", ["--chdir", "/tmp"]) === "bwrap '--chdir' '/tmp' -- sh -c 'echo '\\''hi'\\'''");

  const real = spawnSync("bwrap", ["--dev-bind", "/", "/", "true"]).status === 0;
  if (!real) console.log("  (no working bwrap here: the walls themselves aren't tried)");
  else {
    console.log("INSIDE THE WALLS — what an ops run can and can't do");
    const tries = { bashrc: `echo bad >> ${HOME}/.bashrc`, claudeSettings: `echo bad > ${HOME}/.claude/settings.json`, autostart: `echo bad > ${HOME}/.config/autostart/new.desktop`, sshKey: `echo bad > ${HOME}/.ssh/id_ed25519`, guard: `echo bad > ${CFG}/agent-guard.json`, rules: `echo bad > ${CFG}/standing.json`, trigger: `echo bad > ${CFG}/overrides/triggers/t.mjs`,
      own: `echo ok > ${act}/out.txt`, repo: `echo ok > ${repo}/out.txt`, tmp: `echo ok > /tmp/symbiot-walls-${process.pid}`, config: `echo '{"x":1}' > ${CFG}/config.json`, claudeWork: `echo ok >> ${HOME}/.claude/projects/p.jsonl && echo '{}' > ${HOME}/.claude.json` };
    const reads = { vaultKey: `cat ${CFG}/vault.key`, pin: `cat ${CFG}/vault-pin.json`, vaultIndex: `cat ${CFG}/vault.json`, sshKey: `cat ${HOME}/.ssh/id_ed25519`, pwd: "pwd" };
    const run = (cmd) => spawnSync("sh", ["-c", A.walled(cmd, w)], { encoding: "utf8" });
    const r = Object.fromEntries(Object.entries(tries).map(([k, c]) => [k, run(c).status === 0]));
    ok("can't change: the shell's start-up, Claude's settings, autostart, ssh keys, the guard's settings, standing rules, the app's triggers", ["bashrc", "claudeSettings", "autostart", "sshKey", "guard", "rules", "trigger"].every((k) => r[k] === false), r);
    ok("…and nothing of theirs changed", readFileSync(join(HOME, ".bashrc"), "utf8") === "x\n" && readFileSync(join(HOME, ".claude/settings.json"), "utf8") === "x\n" && readFileSync(join(CFG, "agent-guard.json"), "utf8").startsWith("secret-ish") && !existsSync(join(HOME, ".config/autostart/new.desktop")));
    ok("can still write its own folder, the projects, /tmp, Symbiot's settings (its commands do) and Claude's own working files", ["own", "repo", "tmp", "config", "claudeWork"].every((k) => r[k] === true), r);
    const g = Object.fromEntries(Object.entries(reads).map(([k, c]) => { const x = run(c); return [k, x.stdout.trim()]; }));
    ok("the vault's key and PIN file read as empty; the vault's list of names and the ssh key read as they are; it starts in its own folder", g.vaultKey === "" && g.pin === "" && /vault\.json/.test(g.vaultIndex) && g.sshKey === "x" && g.pwd === act, g);
    rmSync(`/tmp/symbiot-walls-${process.pid}`, { force: true });
  }
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} opswalls: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
