#!/usr/bin/env node
// Appends one rating line to ~/.local/share/omp-plugins/wrap-up/ratings.jsonl.
// Records are keyed by host + session_id; re-rating a session appends another
// line and the last line for a host+session wins.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const host = getArg("host");
const sessionId = getArg("session");
const score = Number(getArg("score"));
const reason = getArg("reason") || "";
const suggestedArg = getArg("suggested");
const suggested = suggestedArg === undefined ? undefined : Number(suggestedArg);
const projectPath = getArg("project") || process.cwd();

const isScore = (n) => Number.isInteger(n) && n >= 1 && n <= 5;
if (
  (host !== "omp" && host !== "pi") ||
  !sessionId ||
  !isScore(score) ||
  (suggested !== undefined && !isScore(suggested))
) {
  console.error(
    "usage: rate.mjs --host <omp|pi> --session <id> --score <1-5> [--suggested <1-5>] --reason <text> --project <path>",
  );
  process.exit(1);
}

const file = path.join(os.homedir(), ".local", "share", "omp-plugins", "wrap-up", "ratings.jsonl");
try {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const record = {
    host,
    session_id: sessionId,
    project_path: projectPath,
    score,
    // The score the host model recommended, which /wrap-up compares against.
    suggested,
    reason,
    rated_at: new Date().toISOString(),
  };
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
  console.log(`rated ${host} ${sessionId} ${score}/5 → ${file}`);
} catch (err) {
  console.error(`error: could not write rating to ${file}: ${err.message}`);
  process.exit(1);
}
