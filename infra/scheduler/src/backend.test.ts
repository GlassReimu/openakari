/** Tests for backend message parsing. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseCursorMessage } from "./backend.js";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

function createMockProcess(): ReturnType<typeof spawn> {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const proc = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    killed: false,
    kill: vi.fn(),
  });
  return proc as ReturnType<typeof spawn>;
}

describe("parseCursorMessage", () => {
  describe("tool_call.completed events", () => {
    it("emits tool_call_completed message for tool_call.completed subtype", () => {
      const line = JSON.stringify({
        type: "tool_call",
        subtype: "completed",
        tool_call: { id: "call_123", name: "Bash" },
      });
      const result = parseCursorMessage(line);
      expect(result).toEqual({ type: "tool_call_completed" });
    });

    it("emits tool_call_completed even without tool_call data", () => {
      const line = JSON.stringify({
        type: "tool_call",
        subtype: "completed",
      });
      const result = parseCursorMessage(line);
      expect(result).toEqual({ type: "tool_call_completed" });
    });
  });

  describe("tool_call.started events", () => {
    it("parses shell tool calls into tool_use_summary", () => {
      const line = JSON.stringify({
        type: "tool_call",
        subtype: "started",
        tool_call: {
          shellToolCall: {
            args: { command: "ls -la" },
          },
        },
      });
      const result = parseCursorMessage(line);
      expect(result).toMatchObject({ type: "tool_use_summary" });
      expect((result as Record<string, unknown>).summary).toContain("Shell");
    });
  });

  describe("other event types", () => {
    it("passes through system/init messages", () => {
      const line = JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "test-session",
      });
      const result = parseCursorMessage(line);
      expect(result).toMatchObject({ type: "system" });
    });

    it("passes through assistant messages with content", () => {
      const line = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Hello" }] },
      });
      const result = parseCursorMessage(line);
      expect(result).toMatchObject({ type: "assistant" });
    });

    it("passes through result messages", () => {
      const line = JSON.stringify({
        type: "result",
        subtype: "success",
        result: "Done",
      });
      const result = parseCursorMessage(line);
      expect(result).toMatchObject({ type: "result" });
    });

    it("returns null for unknown message types", () => {
      const line = JSON.stringify({ type: "unknown_type" });
      const result = parseCursorMessage(line);
      expect(result).toBeNull();
    });

    it("returns null for malformed JSON", () => {
      const result = parseCursorMessage("not valid json");
      expect(result).toBeNull();
    });
  });
});

describe("OpenCodeBackend spawn environment", () => {
  let mockProc: ReturnType<typeof spawn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockProc = createMockProcess();
    mockSpawn.mockReturnValue(mockProc);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes GIT_CONFIG env vars to disable gc.auto", async () => {
    const { getBackend } = await import("./backend.js");
    const backend = getBackend("opencode");

    const queryPromise = backend.runQuery({
      prompt: "test",
      cwd: "/tmp",
    });

    expect(mockSpawn).toHaveBeenCalled();
    const spawnCall = mockSpawn.mock.calls[0];
    const env = spawnCall[2]?.env as Record<string, string>;

    expect(env["GIT_CONFIG_COUNT"]).toBe("1");
    expect(env["GIT_CONFIG_KEY_0"]).toBe("gc.auto");
    expect(env["GIT_CONFIG_VALUE_0"]).toBe("0");

    mockProc.emit("close", 0);
    await queryPromise;
  });

  it("preserves existing environment variables", async () => {
    const { getBackend } = await import("./backend.js");
    const backend = getBackend("opencode");

    const queryPromise = backend.runQuery({
      prompt: "test",
      cwd: "/tmp",
    });

    const spawnCall = mockSpawn.mock.calls[0];
    const env = spawnCall[2]?.env as Record<string, string>;

    expect(env["PATH"]).toBe(process.env["PATH"]);
    expect(env["OPENCODE_PERMISSION"]).toBe('{"*":"allow"}');

    mockProc.emit("close", 0);
    await queryPromise;
  });
});
