/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import { recogniseTranscriptImage } from "../src/lib/ocr";

vi.mock("../src/lib/ocr", () => ({
  recogniseTranscriptImage: vi.fn(async () => ({
    text: "IB00166 微积分2 4 53 F 0 正常考试",
    confidence: 88,
  })),
}));

function gpaResponse(attempts: Array<Record<string, unknown>>) {
  const points: Record<string, number> = {
    "A+": 4.5,
    A: 4,
    "B+": 3.5,
    B: 3,
    "C+": 2.5,
    C: 2,
    D: 1,
    F: 0,
  };
  const contributions = attempts.map((attempt) => ({
    ...attempt,
    grade: String(attempt.grade),
    gradePoint: points[String(attempt.grade)] ?? null,
    earnedCredit:
      attempt.grade === "F" || attempt.grade === "NP"
        ? 0
        : Number(attempt.credits),
    includedInGpa: attempt.grade !== "P" && attempt.grade !== "NP",
    gpaCredits:
      attempt.grade === "P" || attempt.grade === "NP"
        ? 0
        : Number(attempt.credits),
    qualityPoints:
      Number(attempt.credits) * (points[String(attempt.grade)] ?? 0),
  }));
  const attemptedCredits = contributions.reduce(
    (sum, item) => sum + Number(item.credits),
    0,
  );
  const earnedCredits = contributions.reduce(
    (sum, item) => sum + Number(item.earnedCredit),
    0,
  );
  const gpaCredits = contributions.reduce(
    (sum, item) => sum + item.gpaCredits,
    0,
  );
  const qualityPoints = contributions.reduce(
    (sum, item) => sum + item.qualityPoints,
    0,
  );
  const gpa = gpaCredits ? qualityPoints / gpaCredits : null;
  return {
    attemptedCredits,
    earnedCredits,
    gpaCredits,
    qualityPoints,
    gpa,
    displayGpa: gpa === null ? null : gpa.toFixed(2),
    contributions,
    policyWarnings: [],
  };
}

describe("grade screenshot import flow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init) => {
        const path = String(input);
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        let payload: unknown;
        if (path.endsWith("/api/v1/gpa/calculate")) {
          payload = gpaResponse(
            body.attempts as Array<Record<string, unknown>>,
          );
        } else if (path.endsWith("/api/v1/gpa/target")) {
          payload = {
            status: "ACHIEVABLE",
            currentGpa: 3,
            targetGpa: 3.3,
            requiredFutureGpa: 3.315,
            displayRequiredFutureGpa: "3.32",
            maximumReachableGpa: 4.43,
            displayMaximumReachableGpa: "4.43",
            futureGpaCredits: 60,
          };
        } else if (path.endsWith("/api/v1/course-score/required")) {
          payload = {
            status: "ACHIEVABLE",
            unknownComponent: "期末",
            knownWeightedScore: 52.8,
            requiredScore: 80.5,
            displayRequiredScore: "80.50",
          };
        } else {
          return new Response("not found", { status: 404 });
        }
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
  });

  it("pastes a copied grade table without OCR and sends exact values to review", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "成绩导入" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: /直接粘贴教务系统成绩表/ }),
      {
        target: {
          value: [
            "学期\t课程编号\t课程名称\t学分\t成绩\t等级\t绩点\t考试性质",
            "2024-2025-2\tIB00166\t微积分2\t4\t64\tD\t1\t补考",
          ].join("\n"),
        },
      },
    );
    await user.click(screen.getByRole("button", { name: "识别粘贴内容" }));

    expect(screen.getByDisplayValue("IB00166")).toBeTruthy();
    expect(screen.getByDisplayValue("微积分2")).toBeTruthy();
    expect(screen.getByDisplayValue("64")).toBeTruthy();
    expect(recogniseTranscriptImage).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "一键全部通过审核" }));
    await user.click(screen.getByRole("button", { name: "确认导入 1 条记录" }));
    await screen.findByRole("heading", { name: "我的课程" });
    expect(screen.getByText("微积分2")).toBeTruthy();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("drops duplicate screenshots, approves complete rows once, and imports the course", async () => {
    const user = userEvent.setup();
    const pngHeader = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const files = [
      new File([pngHeader], "grades.png", { type: "image/png" }),
      new File([pngHeader], "grades-copy.png", { type: "image/png" }),
    ];

    render(<App />);
    await user.click(screen.getByRole("button", { name: "成绩导入" }));
    fireEvent.drop(screen.getByRole("button", { name: /拖入成绩截图/ }), {
      dataTransfer: { files },
    });

    await screen.findByText(/已删除 1 张重复截图/);
    expect(recogniseTranscriptImage).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "一键全部通过审核" }));
    const importButton = screen.getByRole("button", {
      name: "确认导入 1 条记录",
    });
    expect((importButton as HTMLButtonElement).disabled).toBe(false);
    await user.click(importButton);

    await screen.findByRole("heading", { name: "我的课程" });
    await waitFor(() => expect(screen.getByText("微积分2")).toBeTruthy());
  });

  it("refreshes the entire grade archive only after the new screenshot is approved", async () => {
    localStorage.setItem(
      "sztu-gpa-planner-attempts-v1",
      JSON.stringify({
        version: 1,
        attempts: [
          {
            id: "old",
            courseName: "旧课程",
            semester: "2024-2025-1",
            credits: 3,
            score: 75,
            grade: "B",
            examType: "NORMAL",
          },
        ],
      }),
    );
    const user = userEvent.setup();
    const pngHeader = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    render(<App />);
    await screen.findByText("3.00");
    await user.click(screen.getByRole("button", { name: "刷新全部成绩" }));
    expect(screen.getByText(/刷新模式/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "成绩导入" }));
    expect(screen.getByText(/刷新模式/)).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem("sztu-gpa-planner-attempts-v1")!)
        .attempts[0].courseName,
    ).toBe("旧课程");

    fireEvent.drop(screen.getByRole("button", { name: /拖入成绩截图/ }), {
      dataTransfer: {
        files: [new File([pngHeader], "new-grades.png", { type: "image/png" })],
      },
    });
    await screen.findByText(/识别完成/);
    await user.click(screen.getByRole("button", { name: "一键全部通过审核" }));
    expect(
      JSON.parse(localStorage.getItem("sztu-gpa-planner-attempts-v1")!)
        .attempts[0].courseName,
    ).toBe("旧课程");
    await user.click(
      screen.getByRole("button", { name: "替换旧数据并导入 1 条记录" }),
    );

    await screen.findByRole("heading", { name: "我的课程" });
    expect(screen.getByText("微积分2")).toBeTruthy();
    expect(screen.queryByText("旧课程")).toBeNull();
  });

  it("replaces old grades from copied percentage-score text", async () => {
    localStorage.setItem(
      "sztu-gpa-planner-attempts-v1",
      JSON.stringify({
        version: 1,
        attempts: [
          {
            id: "old",
            courseName: "旧课程",
            semester: "2024-2025-1",
            credits: 3,
            score: 75,
            grade: "B",
            examType: "NORMAL",
          },
        ],
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("3.00");

    await user.click(screen.getByRole("button", { name: "刷新全部成绩" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: /直接粘贴教务系统成绩表/ }),
      {
        target: {
          value: [
            "学年学期　课程代码　课程名称　课程学分　成绩（百分制）　考核性质",
            "2024-2025-2　BS00298　数据科学基础　3　82 分　正常考试",
          ].join("\n"),
        },
      },
    );
    await user.click(screen.getByRole("button", { name: "识别粘贴内容" }));

    expect(screen.getByDisplayValue("82")).toBeTruthy();
    expect(screen.getByDisplayValue("B+")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "替换旧数据并导入 1 条记录" }),
    );

    await screen.findByRole("heading", { name: "我的课程" });
    expect(screen.getByText("数据科学基础")).toBeTruthy();
    expect(screen.queryByText("旧课程")).toBeNull();
    await user.click(screen.getByRole("button", { name: "总览" }));
    await screen.findByText("3.50");
  });

  it("keeps dashboard, target planning, semester simulation, and course-score planning connected", async () => {
    localStorage.setItem(
      "sztu-gpa-planner-attempts-v1",
      JSON.stringify({
        version: 1,
        attempts: [
          {
            id: "seed",
            courseName: "测试课程",
            semester: "2025-2026-1",
            credits: 3,
            score: 75,
            grade: "B",
            examType: "NORMAL",
          },
        ],
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("3.00");

    await user.click(screen.getByRole("button", { name: "目标规划" }));
    await user.click(screen.getByRole("button", { name: "计算所需成绩" }));
    await screen.findByText("3.32");

    await user.click(screen.getByRole("button", { name: "学期模拟" }));
    await screen.findByText("3.88");

    await user.click(screen.getByRole("button", { name: "单科计算" }));
    await user.click(screen.getByRole("button", { name: "添加考核项" }));
    expect(screen.getByRole("textbox", { name: "考核项 5 名称" })).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "删除考核项 新考核项" }),
    );
    await user.click(screen.getByRole("button", { name: "反推成绩" }));
    await screen.findByText("80.50");
  });

  it("uses a directly entered cumulative GPA across dashboard and planning", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "当前数据" }));
    await user.clear(screen.getByLabelText("当前累计 GPA"));
    await user.type(screen.getByLabelText("当前累计 GPA"), "3.02");
    await user.clear(screen.getByLabelText("当前 GPA 学分"));
    await user.type(screen.getByLabelText("当前 GPA 学分"), "130");
    await user.click(screen.getByRole("button", { name: "保存并使用累计数据" }));

    await screen.findByRole("heading", { name: "成绩总览" });
    expect(screen.getByText("3.02")).toBeTruthy();
    expect(screen.getByText(/质量分 392.60 ÷ GPA 学分 130.00/)).toBeTruthy();
    expect(screen.getByText("累计数据")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "目标规划" }));
    await user.click(screen.getByRole("button", { name: "计算所需成绩" }));
    await screen.findByText("3.32");
    const targetCall = vi.mocked(fetch).mock.calls.find(([input]) =>
      String(input).endsWith("/api/v1/gpa/target"),
    );
    expect(JSON.parse(String(targetCall?.[1]?.body))).toMatchObject({
      currentQualityPoints: 392.6,
      currentGpaCredits: 130,
    });
  });

  it("derives B+ and 3.5 from a manually entered score of 82", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "我的课程" }));
    await user.type(screen.getByPlaceholderText("课程名称"), "绩点映射测试");
    await user.type(screen.getByPlaceholderText("成绩（可选）"), "82");
    await user.click(screen.getByRole("button", { name: "新增" }));

    await screen.findByText("绩点映射测试");
    expect(screen.getByText("B+")).toBeTruthy();
    expect(screen.getAllByText("3.5")).toHaveLength(2);
    expect(
      screen.getByRole("columnheader", { name: "课程绩点计算" }),
    ).toBeTruthy();
    expect(screen.getByText("质量分 10.5 ÷ 3.0 学分")).toBeTruthy();
    expect(
      screen.getByText("累计 GPA 3.50 = 质量分 10.50 ÷ GPA 学分 3.00"),
    ).toBeTruthy();
  });

  it("never shows the old dashboard summary while newly imported grades are recalculating", async () => {
    localStorage.setItem(
      "sztu-gpa-planner-attempts-v1",
      JSON.stringify({
        version: 1,
        attempts: [
          {
            id: "old-course",
            courseName: "原课程",
            semester: "2024-2025-1",
            credits: 3,
            score: 75,
            grade: "B",
            examType: "NORMAL",
          },
        ],
      }),
    );
    let releaseNewCalculation!: () => void;
    const newCalculationGate = new Promise<void>((resolve) => {
      releaseNewCalculation = resolve;
    });
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        attempts: Array<Record<string, unknown>>;
      };
      if (
        String(input).endsWith("/api/v1/gpa/calculate") &&
        body.attempts.length === 2
      ) {
        await newCalculationGate;
      }
      return new Response(JSON.stringify(gpaResponse(body.attempts)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("3.00");

    await user.click(screen.getByRole("button", { name: "成绩导入" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: /直接粘贴教务系统成绩表/ }),
      {
        target: {
          value: [
            "学期\t课程编号\t课程名称\t学分\t成绩\t等级\t绩点\t考试性质",
            "2024-2025-2\tNEW001\t新课程\t3\t85\tA\t4\t正常考试",
          ].join("\n"),
        },
      },
    );
    await user.click(screen.getByRole("button", { name: "识别粘贴内容" }));
    await user.click(screen.getByRole("button", { name: "一键全部通过审核" }));
    await user.click(screen.getByRole("button", { name: "确认导入 1 条记录" }));
    await screen.findByRole("heading", { name: "我的课程" });
    await user.click(screen.getByRole("button", { name: "总览" }));

    const syncing = screen.queryByText("正在同步最新成绩…");
    const staleGpa = screen.queryByText("3.00");
    releaseNewCalculation();
    expect(syncing).toBeTruthy();
    expect(staleGpa).toBeNull();
    await screen.findByText("3.50");
  });
});
