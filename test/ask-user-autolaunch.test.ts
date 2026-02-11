import assert from "node:assert/strict";
import test from "node:test";

import {
  readAutolaunchEnabled,
  resolveAskUserAutolaunchCommand
} from "../src/mcp/ask-user-autolaunch.js";

test("readAutolaunchEnabled defaults to true", () => {
  assert.equal(readAutolaunchEnabled({}), true);
});

test("readAutolaunchEnabled handles false-like values", () => {
  assert.equal(readAutolaunchEnabled({ HANDRAISE_ASK_USER_AUTOLAUNCH: "false" }), false);
  assert.equal(readAutolaunchEnabled({ HANDRAISE_ASK_USER_AUTOLAUNCH: "0" }), false);
  assert.equal(readAutolaunchEnabled({ HANDRAISE_ASK_USER_AUTOLAUNCH: "off" }), false);
});

test("resolveAskUserAutolaunchCommand uses explicit command when set", () => {
  const command = resolveAskUserAutolaunchCommand({
    env: { HANDRAISE_ASK_USER_AUTOLAUNCH_CMD: "tmux split-window -h handraise-ask-cli" },
    nodePath: "/usr/bin/node",
    scriptPath: "/repo/dist/src/mcp/ask-user-cli.js",
    hasBinary: () => false
  });

  assert.equal(command, "tmux split-window -h handraise-ask-cli");
});

test("resolveAskUserAutolaunchCommand prefers tmux when available", () => {
  const command = resolveAskUserAutolaunchCommand({
    env: { DISPLAY: ":0" },
    nodePath: "/usr/bin/node",
    scriptPath: "/repo/dist/src/mcp/ask-user-cli.js",
    hasBinary: (bin) => bin === "tmux" || bin === "x-terminal-emulator"
  });

  assert.equal(
    command,
    "tmux new-session -d -s raisehand-ask-tui '/usr/bin/node' '/repo/dist/src/mcp/ask-user-cli.js'"
  );
});

test("resolveAskUserAutolaunchCommand creates new tmux window inside tmux", () => {
  const command = resolveAskUserAutolaunchCommand({
    env: { TMUX: "/tmp/tmux-1000/default,123,0" },
    nodePath: "/usr/bin/node",
    scriptPath: "/repo/dist/src/mcp/ask-user-cli.js",
    hasBinary: (bin) => bin === "tmux"
  });

  assert.equal(
    command,
    "tmux new-window -n raisehand-ask-tui '/usr/bin/node' '/repo/dist/src/mcp/ask-user-cli.js'"
  );
});

test("resolveAskUserAutolaunchCommand falls back to GUI when tmux is unavailable", () => {
  const command = resolveAskUserAutolaunchCommand({
    env: { DISPLAY: ":0" },
    nodePath: "/usr/bin/node",
    scriptPath: "/repo/dist/src/mcp/ask-user-cli.js",
    hasBinary: (bin) => bin === "x-terminal-emulator"
  });

  assert.equal(
    command,
    "x-terminal-emulator -e '/usr/bin/node' '/repo/dist/src/mcp/ask-user-cli.js'"
  );
});
