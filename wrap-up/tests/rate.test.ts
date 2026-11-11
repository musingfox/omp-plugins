#!/usr/bin/env bun
import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const script = new URL("../skills/wrap-up/scripts/rate.mjs", import.meta.url).pathname;

const homes: string[] = [];

afterAll(() => {
  for (const dir of homes) fs.rmSync(dir, { recursive: true, force: true });
});

function run(args: string[], home: string) {
  return spawnSync("node", [script, ...args], {
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
}

function newHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wrap-up-rate-"));
  homes.push(dir);
  return dir;
}

const ratingsFile = (home: string) =>
  path.join(home, ".local", "share", "omp-plugins", "wrap-up", "ratings.jsonl");

const baseArgs = ["--score", "4", "--reason", "solid", "--project", "/abs/p"];

function valid(extra: string[]) {
  const home = newHome();
  return { r: run(["--session", "s1", ...baseArgs, ...extra], home), home };
}

describe("wrap-up rate.mjs", () => {
  test("valid omp call appends record and prints receipt", () => {
    const { r, home } = valid(["--host", "omp", "--suggested", "5"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("rated omp s1 4/5");
    const lines = fs.readFileSync(ratingsFile(home), "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]);
    expect(rec).toMatchObject({
      host: "omp",
      session_id: "s1",
      project_path: "/abs/p",
      score: 4,
      suggested: 5,
      reason: "solid",
    });
    expect(Number.isFinite(Date.parse(rec.rated_at))).toBeTrue();
  });

  test("suggested omitted stays absent", () => {
    const { r, home } = valid(["--host", "pi"]);
    expect(r.status).toBe(0);
    const rec = JSON.parse(fs.readFileSync(ratingsFile(home), "utf8").trimEnd());
    expect(rec.suggested).toBeUndefined();
    expect(rec.host).toBe("pi");
  });

  test("same session on two hosts stays isolated; re-rating appends", () => {
    const home = newHome();
    run(["--host", "pi", "--session", "s1", ...baseArgs], home);
    run(["--host", "omp", "--session", "s1", "--score", "2", "--reason", "r", "--project", "/abs/p"], home);
    run(["--host", "omp", "--session", "s1", ...baseArgs], home);
    const lines = fs.readFileSync(ratingsFile(home), "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => JSON.parse(l).host)).toEqual(["pi", "omp", "omp"]);
    expect(lines.map((l) => JSON.parse(l).score)).toEqual([4, 2, 4]);
  });

  test.each([
    ["score 0", ["--host", "omp", "--session", "s1", "--score", "0", "--reason", "r", "--project", "/abs/p"]],
    ["score 6", ["--host", "omp", "--session", "s1", "--score", "6", "--reason", "r", "--project", "/abs/p"]],
    ["suggested 0", ["--host", "omp", "--session", "s1", ...baseArgs, "--suggested", "0"]],
    ["suggested 6", ["--host", "omp", "--session", "s1", ...baseArgs, "--suggested", "6"]],
    ["empty session", ["--host", "omp", "--session", "", ...baseArgs]],
    ["missing session", ["--host", "omp", ...baseArgs]],
    ["bad host", ["--host", "claude", "--session", "s1", ...baseArgs]],
  ])("rejects %s without writing", (_name, args) => {
    const home = newHome();
    const r = run(args, home);
    expect(r.status).toBe(1);
    expect(r.stderr).not.toBe("");
    expect(fs.existsSync(ratingsFile(home))).toBeFalse();
  });

  test("IO error does not claim success", () => {
    const home = newHome();
    fs.mkdirSync(ratingsFile(home), { recursive: true });
    const r = run(["--host", "omp", "--session", "s1", ...baseArgs], home);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("error:");
    expect(r.stdout).toBe("");
  });

  test("never touches ~/.claude", () => {
    const { r, home } = valid(["--host", "omp"]);
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(home, ".claude"))).toBeFalse();
  });
});
