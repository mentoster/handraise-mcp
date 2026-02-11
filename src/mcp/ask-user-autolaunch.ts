import { spawn, spawnSync } from "node:child_process";

type HasBinary = (binary: string) => boolean;

export type AskUserAutolaunchResult =
  | { launched: true; command: string }
  | { launched: false; reason: string };

export function readAutolaunchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.HANDRAISE_ASK_USER_AUTOLAUNCH;
  if (!raw) return true;
  const value = raw.trim().toLowerCase();
  if (value === "false" || value === "0" || value === "no" || value === "off") return false;
  return true;
}

export function resolveAskUserAutolaunchCommand(
  params: {
    env?: NodeJS.ProcessEnv;
    nodePath: string;
    scriptPath: string;
    hasBinary?: HasBinary;
  }
): string | undefined {
  const env = params.env ?? process.env;
  const hasBinary = params.hasBinary ?? hasCommand;
  const explicitCommand = env.HANDRAISE_ASK_USER_AUTOLAUNCH_CMD?.trim();
  if (explicitCommand) return explicitCommand;

  const node = sh(params.nodePath);
  const script = sh(params.scriptPath);

  if (hasBinary("tmux")) {
    if (env.TMUX) {
      return `tmux new-window -n raisehand-ask-tui ${node} ${script}`;
    }
    return `tmux new-session -d -s raisehand-ask-tui ${node} ${script}`;
  }

  if (env.DISPLAY) {
    const guiCandidates: Array<{ bin: string; command: string }> = [
      { bin: "x-terminal-emulator", command: `x-terminal-emulator -e ${node} ${script}` },
      { bin: "gnome-terminal", command: `gnome-terminal -- ${node} ${script}` },
      { bin: "konsole", command: `konsole -e ${node} ${script}` },
      { bin: "lxterminal", command: `lxterminal -e ${node} ${script}` },
      { bin: "xfce4-terminal", command: `xfce4-terminal --command ${node}\ ${script}` }
    ];
    for (const candidate of guiCandidates) {
      if (hasBinary(candidate.bin)) return candidate.command;
    }
  }

  return undefined;
}

export async function autolaunchAskUserResponder(
  params: {
    env?: NodeJS.ProcessEnv;
    nodePath: string;
    scriptPath: string;
  } = {
    nodePath: process.execPath,
    scriptPath: ""
  }
): Promise<AskUserAutolaunchResult> {
  const env = params.env ?? process.env;
  if (!readAutolaunchEnabled(env)) {
    return { launched: false, reason: "autolaunch disabled by HANDRAISE_ASK_USER_AUTOLAUNCH" };
  }

  const command = resolveAskUserAutolaunchCommand({
    env,
    nodePath: params.nodePath,
    scriptPath: params.scriptPath
  });

  if (!command) {
    return {
      launched: false,
      reason:
        "no terminal launcher detected; set HANDRAISE_ASK_USER_AUTOLAUNCH_CMD or run handraise-ask-tui manually"
    };
  }

  const child = spawn(command, {
    shell: true,
    detached: true,
    stdio: "ignore",
    env
  });
  child.unref();
  return { launched: true, command };
}

function hasCommand(binary: string): boolean {
  const check = spawnSync("sh", ["-lc", `command -v ${sh(binary)} >/dev/null 2>&1`], {
    stdio: "ignore"
  });
  return check.status === 0;
}

function sh(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
