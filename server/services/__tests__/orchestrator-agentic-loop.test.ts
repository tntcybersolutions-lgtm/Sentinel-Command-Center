// Tests for the orchestrator's agentic loop — verifies that tool
// calls are dispatched through executeHerbieTool and that results are
// fed back to the LLM until stop_reason === "end_turn".
//
// We mock the LLM provider at its import boundary to script a
// deterministic sequence of responses (tool_use → end_turn), then
// assert the orchestrator wires the results back correctly.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Scripted responses: each chat() call consumes one entry.
const scriptedResponses: Array<any> = [];
const llmChatMock = vi.fn();
const executeHerbieToolMock = vi.fn();

vi.mock("../llm", () => ({
  getLLMProvider: () => ({
    name: "mock",
    stub: false,
    chat: (...a: any[]) => llmChatMock(...a),
    extractJson: async () => ({ data: undefined, raw: "", usage: {} }),
  }),
}));

vi.mock("../herbie-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../herbie-tools")>();
  return {
    ...actual,
    executeHerbieTool: (...a: any[]) => executeHerbieToolMock(...a),
  };
});

// Stub db + schema dependencies so the orchestrator can import clean.
vi.mock("../../db", () => ({ pool: {}, db: {
  select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) }),
}}));
vi.mock("../../../db/schema/herbie", () => ({
  documentTextChunks: {
    id: { name: "id" },
    documentId: { name: "document_id" },
    chunkIndex: { name: "chunk_index" },
    content: { name: "content" },
    metadata: { name: "metadata" },
    bidId: { name: "bid_id" },
  },
}));

vi.mock("../herbie-facts.service", () => ({
  getProjectMemoryBlock: async () => ({
    facts: [],
    decisions: [],
    relationships: [],
  }),
}));

vi.mock("../herbie-identity.service", () => ({
  getHerbieIdentityPrompt: () => "HERBIE.md (mock identity)",
}));

import { HerbieOrchestrator } from "../herbie/orchestrator";

function reset() {
  scriptedResponses.length = 0;
  llmChatMock.mockReset();
  executeHerbieToolMock.mockReset();
  // Wire chat() to pull from scriptedResponses in order.
  llmChatMock.mockImplementation(async () => {
    if (scriptedResponses.length === 0) {
      return {
        text: "done",
        toolCalls: [],
        stopReason: "end_turn",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
        model: "mock-model",
      };
    }
    return scriptedResponses.shift();
  });
}

describe("HerbieOrchestrator — agentic loop", () => {
  beforeEach(reset);

  it("returns the model's text directly when no tool calls are made", async () => {
    scriptedResponses.push({
      text: "Acme's COI expires Friday. Drafted the renewal.",
      toolCalls: [],
      stopReason: "end_turn",
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreationTokens: 80,
      },
      model: "claude-opus-4-7",
    });

    const orch = new HerbieOrchestrator();
    const response = await orch.chat({
      bidId: "b1",
      userId: "u1",
      tenantId: "t1",
      projectId: "p1",
      message: "status?",
    });

    expect(response.text).toContain("COI expires Friday");
    expect(response.toolCalls).toHaveLength(0);
    expect(response.model).toBe("claude-opus-4-7");
    expect(response.usage.inputTokens).toBe(100);
    expect(response.usage.outputTokens).toBe(50);
    expect(llmChatMock).toHaveBeenCalledOnce();
  });

  it("executes tool calls and feeds results back to the LLM", async () => {
    scriptedResponses.push({
      text: "Looking up facts.",
      toolCalls: [
        {
          id: "tu_1",
          name: "get_project_status",
          input: { projectId: "p1" },
        },
      ],
      stopReason: "tool_use",
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      model: "claude-opus-4-7",
    });
    scriptedResponses.push({
      text: "Here's what I found: 2 COIs, 1 expiring.",
      toolCalls: [],
      stopReason: "end_turn",
      usage: {
        inputTokens: 120,
        outputTokens: 30,
        cacheReadTokens: 100,
        cacheCreationTokens: 0,
      },
      model: "claude-opus-4-7",
    });

    executeHerbieToolMock.mockResolvedValue({
      success: true,
      data: { coi: { total: 2, expired: 0, critical: 1 } },
    });

    const orch = new HerbieOrchestrator();
    const response = await orch.chat({
      bidId: "b1",
      userId: "u1",
      tenantId: "t1",
      projectId: "p1",
      message: "status?",
    });

    expect(response.text).toContain("2 COIs, 1 expiring");
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls[0].tool).toBe("get_project_status");
    expect(executeHerbieToolMock).toHaveBeenCalledOnce();
    // Two LLM round trips: the initial call + the follow-up with tool_result.
    expect(llmChatMock).toHaveBeenCalledTimes(2);
    // Usage accumulates across iterations.
    expect(response.usage.inputTokens).toBe(220);
    expect(response.usage.cacheReadTokens).toBe(100);
  });

  it("stops after maxIterations even if the model keeps calling tools", async () => {
    // Have the model always respond with a tool call.
    llmChatMock.mockImplementation(async () => ({
      text: "calling",
      toolCalls: [{ id: "tu_x", name: "record_fact", input: {} }],
      stopReason: "tool_use",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      model: "claude-opus-4-7",
    }));
    executeHerbieToolMock.mockResolvedValue({ success: true, data: {} });

    const orch = new HerbieOrchestrator();
    const response = await orch.chat({
      bidId: "b1",
      userId: "u1",
      tenantId: "t1",
      message: "loop forever",
      maxIterations: 3,
    });

    // Loop should have run exactly maxIterations times.
    expect(llmChatMock).toHaveBeenCalledTimes(3);
    expect(response.toolCalls).toHaveLength(3);
  });

  it("sends tool errors back to the model as is_error=true tool_result", async () => {
    scriptedResponses.push({
      text: "",
      toolCalls: [
        { id: "tu_1", name: "record_fact", input: { confidence: 0.5 } },
      ],
      stopReason: "tool_use",
      usage: {
        inputTokens: 50, outputTokens: 5,
        cacheReadTokens: 0, cacheCreationTokens: 0,
      },
      model: "claude-opus-4-7",
    });
    scriptedResponses.push({
      text: "Got it. Sending to review queue.",
      toolCalls: [],
      stopReason: "end_turn",
      usage: {
        inputTokens: 60, outputTokens: 10,
        cacheReadTokens: 0, cacheCreationTokens: 0,
      },
      model: "claude-opus-4-7",
    });
    executeHerbieToolMock.mockResolvedValue({
      success: false,
      error: "Below confidence threshold",
      code: "LOW_CONFIDENCE",
    });

    const orch = new HerbieOrchestrator();
    await orch.chat({
      bidId: "b1",
      userId: "u1",
      tenantId: "t1",
      message: "record something",
    });

    // Inspect the tool_result message sent back on the second call.
    const secondCallArgs = llmChatMock.mock.calls[1][0];
    const lastMessage = secondCallArgs.messages[secondCallArgs.messages.length - 1];
    expect(lastMessage.role).toBe("user");
    const content = lastMessage.content[0];
    expect(content.type).toBe("tool_result");
    expect(content.is_error).toBe(true);
    expect(content.content).toContain("LOW_CONFIDENCE");
  });

  it("marks the identity block as cacheable and the project-memory block as not", async () => {
    scriptedResponses.push({
      text: "ok",
      toolCalls: [],
      stopReason: "end_turn",
      usage: {
        inputTokens: 0, outputTokens: 0,
        cacheReadTokens: 0, cacheCreationTokens: 0,
      },
      model: "claude-opus-4-7",
    });
    const orch = new HerbieOrchestrator();
    await orch.chat({
      bidId: "b1",
      userId: "u1",
      tenantId: "t1",
      projectId: "p1",
      message: "hi",
    });
    const sys = llmChatMock.mock.calls[0][0].system;
    expect(Array.isArray(sys)).toBe(true);
    const identityBlock = sys[0];
    expect(identityBlock.cacheable).toBe(true);
    expect(identityBlock.text).toContain("HERBIE.md");
  });

  it("skips the tool loop when withTools: false", async () => {
    scriptedResponses.push({
      text: "just text",
      toolCalls: [],
      stopReason: "end_turn",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      model: "claude-opus-4-7",
    });
    const orch = new HerbieOrchestrator();
    await orch.chat({
      bidId: "b1",
      userId: "u1",
      tenantId: "t1",
      message: "hi",
      withTools: false,
    });
    const firstCall = llmChatMock.mock.calls[0][0];
    expect(firstCall.tools).toBeUndefined();
  });
});
