import { useEffect, useMemo, useState } from "react";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ConditionId = "condition1" | "condition2" | "condition3" | "condition4" | "condition5";

type ConditionResult = {
  id: ConditionId;
  title: string;
  status: "待機中" | "実行中" | "完了" | "エラー";
  progress: string[];
  a1Thinking?: string;
  a1Answer?: string;
  law?: string;
  review?: string;
  improvedThinking?: string;
  improvedAnswer?: string;
  score?: string;
  error?: string;
};

type LearningMemory = Record<ConditionId, string[]>;

type LawRecord = {
  id: string;
  name: string;
  content: string;
  reason?: string;
  review: string;
  status: "承認" | "非承認";
  createdAt: string;
  roundNumber: number;
  constitutionVersionName?: string;
  legislativeRulesVersionName?: string;
  sourceRaw: string;
  usageRaw?: string;
};

type ExperimentRound = {
  roundNumber: number;
  timestamp: string;
  taskPrompt: string;
  model: string;
  constitutionVersionName?: string;
  legislativeRulesVersionName?: string;
  conditions: ConditionResult[];
};

type LawEditDraft = {
  name: string;
  content: string;
  reason: string;
};

type ConstitutionVersion = {
  name: string;
  text: string;
  createdAt: string;
};

type LegislativeRulesVersion = {
  name: string;
  text: string;
  createdAt: string;
};

type AnalyticsPoint = {
  roundNumber: number;
  conditionId: ConditionId;
  conditionLabel: string;
  original: number | null;
  improved: number | null;
};

type RankingItem = {
  conditionId: ConditionId;
  label: string;
  value: number;
  rank: number;
};

type BumpPoint = {
  roundNumber: number;
  conditionId: ConditionId;
  rank: number;
};

type BenchmarkProblem = {
  id: string;
  prompt: string;
  expectedAnswer: string;
  gradingCriteria: string;
};

type BenchmarkDefinition = {
  id: string;
  name: string;
  createdAt: string;
  globalCriteria: string;
  problems: BenchmarkProblem[];
};

type BenchmarkConditionResult = {
  conditionId: ConditionId;
  a1Thinking?: string;
  a1Answer: string;
  improvedThinking?: string;
  improvedAnswer: string;
  law?: string;
  review?: string;
  referencedLaws?: string;
  autoScore: number | null;
  autoComment: string;
  manualScore?: number;
  manualComment?: string;
};

type BenchmarkProblemResult = {
  problemNumber: number;
  prompt: string;
  expectedAnswer: string;
  gradingCriteria: string;
  conditions: BenchmarkConditionResult[];
};

type BenchmarkRunResult = {
  id: string;
  benchmarkId: string;
  benchmarkName: string;
  executedAt: string;
  constitutionVersionName: string;
  legislativeRulesVersionName: string;
  results: BenchmarkProblemResult[];
};

type BenchmarkScorePoint = {
  runIndex: number;
  runLabel: string;
  conditionId: ConditionId;
  conditionLabel: string;
  score: number | null;
};

type BenchmarkScoreMode = "auto" | "manual";

type SelfScoreTarget = {
  runId: string;
  problemNumber: number;
  conditionId: ConditionId;
} | null;

const modelOptions = ["llama-3.3-70b-versatile", "llama3-70b-8192", "llama-3.1-8b-instant"];
const MIN_API_INTERVAL_MS = 1300;
const STORAGE_KEYS = {
  apiKey: "groq_api_key",
  model: "groq_model",
  laws: "cls_laws_v1",
  rounds: "cls_experiment_rounds_v1",
  latestResults: "cls_latest_results_v1",
  learningMemory: "cls_learning_memory_v1",
  constitutionVersions: "cls_constitution_versions_v1",
  legislativeRulesVersions: "cls_legislative_rules_versions_v1",
  activeConstitutionName: "cls_active_constitution_name_v1",
  activeLegislativeRulesName: "cls_active_legislative_rules_name_v1",
  benchmarks: "benchmarks_v1",
  benchmarkResults: "benchmark_results_v1",
};

const conditionTitles: Record<ConditionId, string> = {
  condition1: "条件1: 憲法 + 法律 + thinking改善",
  condition2: "条件2: 憲法のみ + thinking改善",
  condition3: "条件3: 憲法のみ + 回答改善",
  condition4: "条件4: 改善指示のみ",
  condition5: "条件5: 改善なし",
};

const conditionShortLabels: Record<ConditionId, string> = {
  condition1: "条件1",
  condition2: "条件2",
  condition3: "条件3",
  condition4: "条件4",
  condition5: "条件5",
};

const conditionChartColors: Record<ConditionId, { light: string; dark: string }> = {
  condition1: { light: "#93c5fd", dark: "#2563eb" },
  condition2: { light: "#fca5a5", dark: "#dc2626" },
  condition3: { light: "#fde68a", dark: "#ca8a04" },
  condition4: { light: "#86efac", dark: "#16a34a" },
  condition5: { light: "#fdba74", dark: "#ea580c" },
};

const initialConditions: ConditionResult[] = Object.entries(conditionTitles).map(([id, title]) => ({
  id: id as ConditionId,
  title,
  status: "待機中",
  progress: [],
}));

const defaultConstitutionText = `【憲法】
広く安全: AIを監視するための人間のメカニズムを損なわない。
広く倫理的: 正直であること、良い価値観に従って行動すること。
ガイドラインに準拠: 具体的なガイドラインに従う。
本当に役立つ: ユーザーに真に利益をもたらす回答をする。
優先順位は上記の順。`;

const defaultLegislativeRules = `【立法ルール】
・必ず憲法に沿った法律のみ立てること。
・法律を立てる目的は、より正確で深く洗練された思考要約にしていくためである。
・元の回答よりも、よりユーザーの本当の意図に沿った考え方がないか検討すること。
・法律は汎用性があり、ただし過度に抽象的すぎない形で書くこと。
・保存済み法律一覧を最初に確認し、既に同じ趣旨の法律がある場合は重複した法律を作らないこと。
・新しい法律は、保存済み法律一覧にまだ存在しない改善ノウハウだけを追加すること。
・改善された思考要約と回答は、今回参照した保存済み法律と、今回新たに作成した法律の両方を使って作ること。
・もし本当に新規追加すべき法律がない場合だけ、[LAW]内の法律名を「追加なし」とし、その理由を明記すること。`;

const defaultConstitutionVersion: ConstitutionVersion = {
  name: "憲法(1)",
  text: defaultConstitutionText,
  createdAt: new Date(0).toISOString(),
};

const defaultLegislativeRulesVersion: LegislativeRulesVersion = {
  name: "立法ルール(1)",
  text: defaultLegislativeRules,
  createdAt: new Date(0).toISOString(),
};

const a1SystemPrompt = `あなたはタスクを受け取り、思考要約と回答を生成するAIです。
内部の隠れた推論を逐語的に長く出すのではなく、ユーザーが確認できる短い思考要約として、方針・確認点・手順を具体的に書いてください。

必ず以下の形式で出力してください。

[THINKING]
思考要約を書く。
[/THINKING]

[ANSWER]
最終回答を書く。
[/ANSWER]

過去に改善ノウハウを受け取った場合は、次の回答に活かしてください。`;

function buildA2Condition1System(constitutionVersion: ConstitutionVersion, legislativeRulesVersion: LegislativeRulesVersion) {
  return `あなたはAIの思考要約と回答を改善するためのモデルです。
以下の憲法、立法ルール、保存済みlaws.json相当の法律一覧を参照して動作します。

【使用する憲法バージョン】${constitutionVersion.name}
【使用する立法ルールバージョン】${legislativeRulesVersion.name}

${constitutionVersion.text}

${legislativeRulesVersion.text}

以下の形式で出力してください。

[LAW]
法律名: 簡潔な名前
内容: こういう場面ではこう考えるべき、という具体的な記述
理由: なぜそうすべきか
[/LAW]

[IMPROVED_THINKING]
改善された思考要約。冒頭に「参照した保存済み法律」と「今回新たに作成した法律」を明示すること。
[/IMPROVED_THINKING]

[IMPROVED_ANSWER]
改善された回答
[/IMPROVED_ANSWER]

[LAW_USAGE]
法律名: 法律の名前
ラベル: 使用済み / 未使用（不要・重複） / 未使用（今回のみ未使用） / 未使用（既にクリア済み） / 未使用（誤参照）
理由: なぜそのラベルにしたか
[/LAW_USAGE]`;
}

function buildA2Condition2System(version: ConstitutionVersion) {
  return `あなたはAIの思考要約と回答を改善するためのモデルです。
【使用する憲法のバージョン】${version.name}

${version.text}

渡された思考要約と回答を憲法に照らして分析し、改善された思考要約と回答を以下の形式で生成してください。

[IMPROVED_THINKING]
改善された思考要約
[/IMPROVED_THINKING]

[IMPROVED_ANSWER]
改善された回答
[/IMPROVED_ANSWER]`;
}

function buildA2Condition3System(version: ConstitutionVersion) {
  return `あなたはAIの回答を改善するためのモデルです。
【使用する憲法のバージョン】${version.name}

${version.text}

渡された回答だけを憲法に照らして分析し、改善された回答を以下の形式で生成してください。

[IMPROVED_ANSWER]
改善された回答
[/IMPROVED_ANSWER]`;
}

const a2Condition4System = `あなたはAIの回答を改善するためのモデルです。
渡された回答をより良くしてください。憲法も法律も参照しません。

[IMPROVED_ANSWER]
改善された回答
[/IMPROVED_ANSWER]`;

function buildReviewSystemPrompt(constitutionVersion: ConstitutionVersion, legislativeRulesVersion: LegislativeRulesVersion) {
  return `あなたは法律の審査を行うモデルです。
以下の憲法と立法ルールを参照して、提出された法律が適切かどうかを審査してください。

【使用する憲法バージョン】${constitutionVersion.name}
【使用する立法ルールバージョン】${legislativeRulesVersion.name}

${constitutionVersion.text}

${legislativeRulesVersion.text}

[REVIEW]
判定: 承認 または 非承認
理由: なぜそう判定したか
フィードバック: 改善点があれば具体的に記述。なければ「なし」
[/REVIEW]`;
}

const scoreSystemPrompt = `あなたはAIの思考要約と回答を客観的に採点するモデルです。
回答Aと回答Bを、それぞれ以下の5観点で20点満点、合計100点満点で採点してください。
どちらが元の回答でどちらが改善後かは気にせず、純粋に内容だけを見てください。

観点: 思考の質、回答の正確性、回答の網羅性、簡潔さ・読みやすさ、プロンプトへの忠実度。

以下の形式で出力してください。

[SCORE_A]
思考の質: XX点
回答の正確性: XX点
回答の網羅性: XX点
簡潔さ・読みやすさ: XX点
プロンプトへの忠実度: XX点
合計: XX点
総評: 2〜3文
[/SCORE_A]

[SCORE_B]
思考の質: XX点
回答の正確性: XX点
回答の網羅性: XX点
簡潔さ・読みやすさ: XX点
プロンプトへの忠実度: XX点
合計: XX点
総評: 2〜3文
[/SCORE_B]`;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function extractTag(text: string, tag: string) {
  const expression = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[/${tag}\\]`, "i");
  return text.match(expression)?.[1]?.trim() || text.trim();
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadConstitutionVersions() {
  const saved = loadJson<ConstitutionVersion[]>(STORAGE_KEYS.constitutionVersions, []);
  if (saved.length > 0 && "text" in saved[0]) {
    return saved;
  }

  const legacy = loadJson<Array<{ name: string; constitutionText: string; createdAt: string }>>(STORAGE_KEYS.constitutionVersions, []);
  if (legacy.length > 0) {
    return legacy.map((version, index) => ({
      name: `憲法(${index + 1})`,
      text: version.constitutionText || defaultConstitutionText,
      createdAt: version.createdAt || new Date(0).toISOString(),
    }));
  }

  return [defaultConstitutionVersion];
}

function loadLegislativeRulesVersions() {
  const saved = loadJson<LegislativeRulesVersion[]>(STORAGE_KEYS.legislativeRulesVersions, []);
  if (saved.length > 0) {
    return saved;
  }

  const legacy = loadJson<Array<{ legislativeRules: string; createdAt: string }>>(STORAGE_KEYS.constitutionVersions, []);
  if (legacy.length > 0) {
    return legacy.map((version, index) => ({
      name: `立法ルール(${index + 1})`,
      text: version.legislativeRules || defaultLegislativeRules,
      createdAt: version.createdAt || new Date(0).toISOString(),
    }));
  }

  return [defaultLegislativeRulesVersion];
}

function extractField(text: string, field: string) {
  const expression = new RegExp(`${field}[:：]\\s*(.+)`, "i");
  return text.match(expression)?.[1]?.trim() || "";
}

function isApproved(review: string) {
  return /判定[:：]\s*承認/.test(review) && !/判定[:：]\s*非承認/.test(review);
}

function isNoNewLaw(rawLaw: string) {
  return /法律名[:：]\s*追加なし/.test(rawLaw);
}

function formatLawsForPrompt(laws: LawRecord[]) {
  const approvedLaws = laws.filter((law) => law.status === "承認");

  if (approvedLaws.length === 0) {
    return "現在、承認済みの法律はありません。";
  }

  return approvedLaws
    .map(
      (law, index) =>
        `【法第${index + 1}条 / ${law.id}】\n法律名: ${law.name}\n内容: ${law.content}\n理由: ${law.reason || extractField(law.sourceRaw, "理由") || "未記録"}\n審査状態: ${law.status}\n作成ラウンド: ${law.roundNumber}`,
    )
    .join("\n\n");
}

function createLawRecord(
  rawLaw: string,
  review: string,
  usageRaw: string,
  roundNumber: number,
  lawIndex: number,
  constitutionVersionName: string,
  legislativeRulesVersionName: string,
): LawRecord {
  const name = extractField(rawLaw, "法律名") || `無題の法律 ${lawIndex + 1}`;
  const content = extractField(rawLaw, "内容") || rawLaw;
  const reason = extractField(rawLaw, "理由") || "";

  return {
    id: `law_${String(lawIndex + 1).padStart(3, "0")}`,
    name,
    content,
    reason,
    review,
    status: isApproved(review) ? "承認" : "非承認",
    createdAt: new Date().toISOString(),
    roundNumber,
    constitutionVersionName,
    legislativeRulesVersionName,
    sourceRaw: rawLaw,
    usageRaw,
  };
}

function parseTotalScore(block: string) {
  const match = block.match(/合計\s*[:：]\s*(\d+(?:\.\d+)?)\s*点?/);
  return match ? Number(match[1]) : null;
}

function parseConditionScore(scoreText?: string) {
  if (!scoreText) {
    return { original: null, improved: null };
  }

  const scoreAStart = scoreText.search(/\[SCORE_A\]/i);
  const scoreBStart = scoreText.search(/\[SCORE_B\]/i);
  const scoreA = scoreAStart >= 0 && scoreBStart > scoreAStart ? scoreText.slice(scoreAStart, scoreBStart) : extractTag(scoreText, "SCORE_A");
  const scoreB = scoreBStart >= 0 ? scoreText.slice(scoreBStart) : extractTag(scoreText, "SCORE_B");
  return {
    original: parseTotalScore(scoreA),
    improved: parseTotalScore(scoreB),
  };
}

function rankValues(items: Array<Omit<RankingItem, "rank">>) {
  return [...items]
    .sort((a, b) => b.value - a.value)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function calculateAuc(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  if (values.length === 1) {
    return values[0];
  }

  return values.slice(1).reduce((area, value, index) => area + (values[index] + value) / 2, 0);
}

function buildAnalytics(rounds: ExperimentRound[]) {
  const chronologicalRounds = [...rounds].reverse();
  const points: AnalyticsPoint[] = [];

  chronologicalRounds.forEach((round) => {
    round.conditions.forEach((condition) => {
      const parsed = parseConditionScore(condition.score);
      points.push({
        roundNumber: round.roundNumber,
        conditionId: condition.id,
        conditionLabel: conditionShortLabels[condition.id],
        original: parsed.original,
        improved: parsed.improved,
      });
    });
  });

  const conditionIds = Object.keys(conditionTitles) as ConditionId[];
  const valuesByCondition = conditionIds.reduce(
    (accumulator, conditionId) => ({
      ...accumulator,
      [conditionId]: points
        .filter((point) => point.conditionId === conditionId)
        .map((point) => point.improved ?? point.original)
        .filter((value): value is number => typeof value === "number"),
    }),
    {} as Record<ConditionId, number[]>,
  );

  const finalRanking = rankValues(
    conditionIds.map((conditionId) => {
      const values = valuesByCondition[conditionId];
      return {
        conditionId,
        label: conditionShortLabels[conditionId],
        value: values.at(-1) ?? 0,
      };
    }),
  );

  const aucRanking = rankValues(
    conditionIds.map((conditionId) => ({
      conditionId,
      label: conditionShortLabels[conditionId],
      value: calculateAuc(valuesByCondition[conditionId]),
    })),
  );

  const cumulativeRanking = rankValues(
    conditionIds.map((conditionId) => {
      const conditionValues = valuesByCondition[conditionId];
      const baselineValues = valuesByCondition.condition5;
      const value = conditionValues.reduce((total, score, index) => total + (score - (baselineValues[index] ?? 0)), 0);
      return { conditionId, label: conditionShortLabels[conditionId], value };
    }),
  );

  const bump = {
    final: buildBumpPoints(chronologicalRounds, "final"),
    auc: buildBumpPoints(chronologicalRounds, "auc"),
    cumulative: buildBumpPoints(chronologicalRounds, "cumulative"),
  };

  return { chronologicalRounds, points, finalRanking, aucRanking, cumulativeRanking, bump };
}

function buildBumpPoints(rounds: ExperimentRound[], mode: "final" | "auc" | "cumulative") {
  const conditionIds = Object.keys(conditionTitles) as ConditionId[];
  const bumpPoints: BumpPoint[] = [];

  rounds.forEach((round, roundIndex) => {
    const prefix = rounds.slice(0, roundIndex + 1);
    const analytics = prefix.flatMap((currentRound) =>
      currentRound.conditions.map((condition) => ({ condition, parsed: parseConditionScore(condition.score) })),
    );
    const baselineValues = prefix
      .map((currentRound) => currentRound.conditions.find((condition) => condition.id === "condition5"))
      .map((condition) => {
        const parsed = parseConditionScore(condition?.score);
        return parsed.improved ?? parsed.original ?? 0;
      });

    const ranking = rankValues(
      conditionIds.map((conditionId) => {
        const values = analytics
          .filter((item) => item.condition.id === conditionId)
          .map((item) => item.parsed.improved ?? item.parsed.original)
          .filter((value): value is number => typeof value === "number");
        const value =
          mode === "final"
            ? values.at(-1) ?? 0
            : mode === "auc"
              ? calculateAuc(values)
              : values.reduce((total, score, index) => total + (score - (baselineValues[index] ?? 0)), 0);

        return { conditionId, label: conditionShortLabels[conditionId], value };
      }),
    );

    ranking.forEach((item) => {
      bumpPoints.push({ roundNumber: round.roundNumber, conditionId: item.conditionId, rank: item.rank });
    });
  });

  return bumpPoints;
}

function createEmptyBenchmarkProblems(count = 5): BenchmarkProblem[] {
  return Array.from({ length: count }, () => ({
    id: crypto.randomUUID(),
    prompt: "",
    expectedAnswer: "",
    gradingCriteria: "",
  }));
}

function normalizeBenchmarkProblems(problems: BenchmarkProblem[]) {
  return problems.map((problem) => ({ ...problem, id: problem.id || crypto.randomUUID() }));
}

function parseBenchmarkScore(text: string) {
  return parseTotalScore(text) ?? (Number(text.match(/(\d+(?:\.\d+)?)\s*点/)?.[1] || NaN) || null);
}

function getBenchmarkScore(condition: BenchmarkConditionResult | undefined, mode: BenchmarkScoreMode) {
  if (!condition) {
    return undefined;
  }

  return mode === "manual" ? condition.manualScore : condition.autoScore;
}

function buildBenchmarkAnalytics(results: BenchmarkRunResult[], benchmarkId: string, problemNumber?: number, mode: BenchmarkScoreMode = "auto") {
  const runs = results.filter((result) => result.benchmarkId === benchmarkId).sort((a, b) => a.executedAt.localeCompare(b.executedAt));
  const conditionIds = Object.keys(conditionTitles) as ConditionId[];
  const averageScore = (run: BenchmarkRunResult, conditionId: ConditionId) => {
    const targetProblems = typeof problemNumber === "number" ? run.results.filter((problem) => problem.problemNumber === problemNumber) : run.results;
    const scores = targetProblems
      .map((problem) => getBenchmarkScore(problem.conditions.find((condition) => condition.conditionId === conditionId), mode))
      .filter((score): score is number => typeof score === "number");
    return scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : 0;
  };
  const values = conditionIds.reduce(
    (accumulator, conditionId) => ({ ...accumulator, [conditionId]: runs.map((run) => averageScore(run, conditionId)) }),
    {} as Record<ConditionId, number[]>,
  );

  const points: BenchmarkScorePoint[] = runs.flatMap((run, runIndex) =>
    conditionIds.map((conditionId) => ({
      runIndex: runIndex + 1,
      runLabel: new Date(run.executedAt).toLocaleString(),
      conditionId,
      conditionLabel: conditionShortLabels[conditionId],
      score: averageScore(run, conditionId),
    })),
  );

  const bump = buildBenchmarkBumpPoints(runs, problemNumber, mode);

  return {
    runs,
    points,
    bump,
    finalRanking: rankValues(conditionIds.map((conditionId) => ({ conditionId, label: conditionShortLabels[conditionId], value: values[conditionId].at(-1) ?? 0 }))),
    aucRanking: rankValues(conditionIds.map((conditionId) => ({ conditionId, label: conditionShortLabels[conditionId], value: calculateAuc(values[conditionId]) }))),
    cumulativeRanking: rankValues(
      conditionIds.map((conditionId) => ({
        conditionId,
        label: conditionShortLabels[conditionId],
        value: values[conditionId].reduce((total, score, index) => total + (score - (values.condition5[index] ?? 0)), 0),
      })),
    ),
  };
}

function buildBenchmarkBumpPoints(runs: BenchmarkRunResult[], problemNumber?: number, mode: BenchmarkScoreMode = "auto") {
  const conditionIds = Object.keys(conditionTitles) as ConditionId[];
  const points: BumpPoint[] = [];

  runs.forEach((_, runIndex) => {
    const prefix = runs.slice(0, runIndex + 1);
    const analytics = buildBenchmarkAnalyticsNoBump(prefix, problemNumber, mode);
    analytics.finalRanking.forEach((item) => {
      points.push({ roundNumber: runIndex + 1, conditionId: item.conditionId, rank: item.rank });
    });
  });

  return points.filter((point) => conditionIds.includes(point.conditionId));
}

function buildBenchmarkAnalyticsNoBump(runs: BenchmarkRunResult[], problemNumber?: number, mode: BenchmarkScoreMode = "auto") {
  const conditionIds = Object.keys(conditionTitles) as ConditionId[];
  const averageScore = (run: BenchmarkRunResult, conditionId: ConditionId) => {
    const targetProblems = typeof problemNumber === "number" ? run.results.filter((problem) => problem.problemNumber === problemNumber) : run.results;
    const scores = targetProblems
      .map((problem) => getBenchmarkScore(problem.conditions.find((condition) => condition.conditionId === conditionId), mode))
      .filter((score): score is number => typeof score === "number");
    return scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : 0;
  };
  const values = conditionIds.reduce(
    (accumulator, conditionId) => ({ ...accumulator, [conditionId]: runs.map((run) => averageScore(run, conditionId)) }),
    {} as Record<ConditionId, number[]>,
  );

  return {
    finalRanking: rankValues(conditionIds.map((conditionId) => ({ conditionId, label: conditionShortLabels[conditionId], value: values[conditionId].at(-1) ?? 0 }))),
    aucRanking: rankValues(conditionIds.map((conditionId) => ({ conditionId, label: conditionShortLabels[conditionId], value: calculateAuc(values[conditionId]) }))),
    cumulativeRanking: rankValues(
      conditionIds.map((conditionId) => ({
        conditionId,
        label: conditionShortLabels[conditionId],
        value: values[conditionId].reduce((total, score, index) => total + (score - (values.condition5[index] ?? 0)), 0),
      })),
    ),
  };
}

async function callGroq(apiKey: string, model: string, messages: ChatMessage[]) {
  let lastError = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || `HTTP ${response.status}`);
      }

      await wait(MIN_API_INTERVAL_MS);
      return data.choices?.[0]?.message?.content?.trim() || "";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "不明なAPIエラー";
      if (attempt < 3) {
        await wait(1000 * attempt);
      }
    }
  }

  throw new Error(lastError || "Groq APIの呼び出しに失敗しました");
}

function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.apiKey) || "");
  const [model, setModel] = useState(() => localStorage.getItem(STORAGE_KEYS.model) || modelOptions[0]);
  const [taskPrompt, setTaskPrompt] = useState("");
  const [results, setResults] = useState<ConditionResult[]>(() => loadJson(STORAGE_KEYS.latestResults, initialConditions));
  const [isRunning, setIsRunning] = useState(false);
  const [runMessage, setRunMessage] = useState("保存済みデータを読み込みました。入力待機中です。");
  const [laws, setLaws] = useState<LawRecord[]>(() => loadJson(STORAGE_KEYS.laws, []));
  const [rounds, setRounds] = useState<ExperimentRound[]>(() => loadJson(STORAGE_KEYS.rounds, []));
  const [activeTab, setActiveTab] = useState<"results" | "laws" | "history" | "constitution" | "analytics" | "benchmarks" | "benchtest" | "benchresults">("results");
  const [editingLawId, setEditingLawId] = useState<string | null>(null);
  const [lawEditDraft, setLawEditDraft] = useState<LawEditDraft>({ name: "", content: "", reason: "" });
  const [constitutionVersions, setConstitutionVersions] = useState<ConstitutionVersion[]>(loadConstitutionVersions);
  const [legislativeRulesVersions, setLegislativeRulesVersions] =
    useState<LegislativeRulesVersion[]>(loadLegislativeRulesVersions);
  const [activeConstitutionName, setActiveConstitutionName] = useState(
    () => localStorage.getItem(STORAGE_KEYS.activeConstitutionName) || "",
  );
  const [activeLegislativeRulesName, setActiveLegislativeRulesName] = useState(
    () => localStorage.getItem(STORAGE_KEYS.activeLegislativeRulesName) || "",
  );
  const activeConstitutionVersion =
    constitutionVersions.find((version) => version.name === activeConstitutionName) ||
    constitutionVersions[constitutionVersions.length - 1] ||
    defaultConstitutionVersion;
  const activeLegislativeRulesVersion =
    legislativeRulesVersions.find((version) => version.name === activeLegislativeRulesName) ||
    legislativeRulesVersions[legislativeRulesVersions.length - 1] ||
    defaultLegislativeRulesVersion;
  const [constitutionDraft, setConstitutionDraft] = useState(activeConstitutionVersion.text);
  const [legislativeRulesDraft, setLegislativeRulesDraft] = useState(activeLegislativeRulesVersion.text);
  const [learningMemory, setLearningMemory] = useState<LearningMemory>(() => loadJson(STORAGE_KEYS.learningMemory, {
    condition1: [],
    condition2: [],
    condition3: [],
    condition4: [],
    condition5: [],
  }));
  const [benchmarks, setBenchmarks] = useState<BenchmarkDefinition[]>(() => loadJson(STORAGE_KEYS.benchmarks, []));
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkRunResult[]>(() => loadJson(STORAGE_KEYS.benchmarkResults, []));
  const [benchmarkName, setBenchmarkName] = useState("");
  const [benchmarkGlobalCriteria, setBenchmarkGlobalCriteria] = useState("");
  const [benchmarkProblems, setBenchmarkProblems] = useState<BenchmarkProblem[]>(() => createEmptyBenchmarkProblems());
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState("");
  const [isBenchmarkRunning, setIsBenchmarkRunning] = useState(false);
  const [draggedProblemIndex, setDraggedProblemIndex] = useState<number | null>(null);
  const [benchmarkProgress, setBenchmarkProgress] = useState<string[]>([]);
  const [currentBenchmarkRun, setCurrentBenchmarkRun] = useState<BenchmarkRunResult | null>(null);
  const [benchmarkScoreMode, setBenchmarkScoreMode] = useState<BenchmarkScoreMode>("auto");
  const [selfScoreTarget, setSelfScoreTarget] = useState<SelfScoreTarget>(null);

  const completedCount = useMemo(() => results.filter((result) => result.status === "完了").length, [results]);
  const approvedLawCount = useMemo(() => laws.filter((law) => law.status === "承認").length, [laws]);
  const analytics = useMemo(() => buildAnalytics(rounds), [rounds]);
  const selectedBenchmark = useMemo(
    () => benchmarks.find((benchmark) => benchmark.id === selectedBenchmarkId) || benchmarks[0],
    [benchmarks, selectedBenchmarkId],
  );
  const benchmarkAnalytics = useMemo(
    () => (selectedBenchmark ? buildBenchmarkAnalytics(benchmarkResults, selectedBenchmark.id, undefined, benchmarkScoreMode) : null),
    [benchmarkResults, selectedBenchmark, benchmarkScoreMode],
  );

  const currentBenchmarkAnalytics = useMemo(
    () => (currentBenchmarkRun ? buildBenchmarkAnalytics([currentBenchmarkRun], currentBenchmarkRun.benchmarkId) : null),
    [currentBenchmarkRun],
  );

  const selfScoreContext = useMemo(() => {
    if (!selfScoreTarget) {
      return null;
    }

    const run = benchmarkResults.find((result) => result.id === selfScoreTarget.runId);
    const problem = run?.results.find((result) => result.problemNumber === selfScoreTarget.problemNumber);
    const condition = problem?.conditions.find((result) => result.conditionId === selfScoreTarget.conditionId);
    return run && problem && condition ? { run, problem, condition } : null;
  }, [benchmarkResults, selfScoreTarget]);

  useEffect(() => {
    saveJson(STORAGE_KEYS.latestResults, results);
  }, [results]);

  useEffect(() => {
    saveJson(STORAGE_KEYS.laws, laws);
  }, [laws]);

  useEffect(() => {
    saveJson(STORAGE_KEYS.rounds, rounds);
  }, [rounds]);

  useEffect(() => {
    saveJson(STORAGE_KEYS.learningMemory, learningMemory);
  }, [learningMemory]);

  useEffect(() => {
    saveJson(STORAGE_KEYS.benchmarks, benchmarks);
  }, [benchmarks]);

  useEffect(() => {
    saveJson(STORAGE_KEYS.benchmarkResults, benchmarkResults);
  }, [benchmarkResults]);

  useEffect(() => {
    saveJson(STORAGE_KEYS.constitutionVersions, constitutionVersions);
  }, [constitutionVersions]);

  useEffect(() => {
    saveJson(STORAGE_KEYS.legislativeRulesVersions, legislativeRulesVersions);
  }, [legislativeRulesVersions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.activeConstitutionName, activeConstitutionVersion.name);
  }, [activeConstitutionVersion.name]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.activeLegislativeRulesName, activeLegislativeRulesVersion.name);
  }, [activeLegislativeRulesVersion.name]);

  useEffect(() => {
    setConstitutionDraft(activeConstitutionVersion.text);
  }, [activeConstitutionVersion.text]);

  useEffect(() => {
    setLegislativeRulesDraft(activeLegislativeRulesVersion.text);
  }, [activeLegislativeRulesVersion.text]);

  const updateCondition = (id: ConditionId, patch: Partial<ConditionResult>) => {
    setResults((current) => current.map((result) => (result.id === id ? { ...result, ...patch } : result)));
  };

  const pushProgress = (id: ConditionId, line: string) => {
    setResults((current) =>
      current.map((result) =>
        result.id === id ? { ...result, progress: [...result.progress, line], status: "実行中" } : result,
      ),
    );
  };

  const startEditingLaw = (law: LawRecord) => {
    setEditingLawId(law.id);
    setLawEditDraft({
      name: law.name,
      content: law.content,
      reason: law.reason || extractField(law.sourceRaw, "理由") || "",
    });
  };

  const cancelEditingLaw = () => {
    setEditingLawId(null);
    setLawEditDraft({ name: "", content: "", reason: "" });
  };

  const saveEditedLaw = (lawId: string) => {
    const nextName = lawEditDraft.name.trim();
    const nextContent = lawEditDraft.content.trim();
    const nextReason = lawEditDraft.reason.trim();

    if (!nextName || !nextContent || !nextReason) {
      setRunMessage("法律の名前、内容、理由はすべて入力してください。");
      return;
    }

    setLaws((current) =>
      current.map((law) =>
        law.id === lawId
          ? {
              ...law,
              name: nextName,
              content: nextContent,
              reason: nextReason,
              sourceRaw: `法律名: ${nextName}\n内容: ${nextContent}\n理由: ${nextReason}`,
            }
          : law,
      ),
    );
    cancelEditingLaw();
    setRunMessage(`${lawId} を更新しました。次回の条件1から編集内容が参照されます。`);
  };

  const deleteLaw = (lawId: string) => {
    if (!window.confirm(`${lawId} を削除しますか？この操作は保存済み法律一覧から消えます。`)) {
      return;
    }

    setLaws((current) => current.filter((law) => law.id !== lawId));
    if (editingLawId === lawId) {
      cancelEditingLaw();
    }
    setRunMessage(`${lawId} を削除しました。次回の条件1では参照されません。`);
  };

  const saveConstitutionVersion = () => {
    const nextConstitution = constitutionDraft.trim();

    if (!nextConstitution) {
      setRunMessage("憲法を入力してください。");
      return;
    }

    const nextVersion: ConstitutionVersion = {
      name: `憲法(${constitutionVersions.length + 1})`,
      text: nextConstitution,
      createdAt: new Date().toISOString(),
    };

    setConstitutionVersions((current) => [...current, nextVersion]);
    setActiveConstitutionName(nextVersion.name);
    setRunMessage(`${nextVersion.name} を保存しました。次回の実験からこの憲法を使用します。`);
  };

  const saveLegislativeRulesVersion = () => {
    const nextRules = legislativeRulesDraft.trim();

    if (!nextRules) {
      setRunMessage("立法ルールを入力してください。");
      return;
    }

    const nextVersion: LegislativeRulesVersion = {
      name: `立法ルール(${legislativeRulesVersions.length + 1})`,
      text: nextRules,
      createdAt: new Date().toISOString(),
    };

    setLegislativeRulesVersions((current) => [...current, nextVersion]);
    setActiveLegislativeRulesName(nextVersion.name);
    setRunMessage(`${nextVersion.name} を保存しました。次回の実験からこの立法ルールを使用します。`);
  };

  const updateBenchmarkProblem = (index: number, patch: Partial<BenchmarkProblem>) => {
    setBenchmarkProblems((current) => current.map((problem, problemIndex) => (problemIndex === index ? { ...problem, ...patch } : problem)));
  };

  const insertBenchmarkProblem = (index: number) => {
    setBenchmarkProblems((current) => {
      const next = [...current];
      next.splice(index, 0, createEmptyBenchmarkProblems(1)[0]);
      return next;
    });
  };

  const removeBenchmarkProblem = (index: number) => {
    setBenchmarkProblems((current) => current.filter((_, problemIndex) => problemIndex !== index));
  };

  const moveBenchmarkProblem = (from: number, to: number) => {
    setBenchmarkProblems((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const saveBenchmark = () => {
    const name = window.prompt("保存するベンチマーク名を入力してください", benchmarkName || "新規ベンチマーク");
    if (!name) {
      return;
    }

    const nextBenchmark: BenchmarkDefinition = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      globalCriteria: benchmarkGlobalCriteria,
      problems: normalizeBenchmarkProblems(benchmarkProblems).filter((problem) => problem.prompt.trim()),
    };

    if (nextBenchmark.problems.length === 0) {
      setRunMessage("問題文が入った問題を1つ以上作ってください。");
      return;
    }

    setBenchmarks((current) => [nextBenchmark, ...current]);
    setSelectedBenchmarkId(nextBenchmark.id);
    setBenchmarkName(name);
    setRunMessage(`${name} を保存しました。`);
  };

  const loadBenchmarkForEdit = (benchmark: BenchmarkDefinition) => {
    setBenchmarkName(benchmark.name);
    setBenchmarkGlobalCriteria(benchmark.globalCriteria);
    setBenchmarkProblems(normalizeBenchmarkProblems(benchmark.problems));
    setRunMessage(`${benchmark.name} を編集フォームに読み込みました。保存時は新バージョンとして残します。`);
  };

  const deleteBenchmark = (benchmarkId: string) => {
    if (!window.confirm("このベンチマークを削除しますか？実行結果は残ります。")) {
      return;
    }

    setBenchmarks((current) => current.filter((benchmark) => benchmark.id !== benchmarkId));
    if (selectedBenchmarkId === benchmarkId) {
      setSelectedBenchmarkId("");
    }
  };

  const updateBenchmarkManualScore = (target: Exclude<SelfScoreTarget, null>, patch: { manualScore?: number; manualComment?: string }) => {
    setBenchmarkResults((current) =>
      current.map((run) =>
        run.id !== target.runId
          ? run
          : {
              ...run,
              results: run.results.map((problem) =>
                problem.problemNumber !== target.problemNumber
                  ? problem
                  : {
                      ...problem,
                      conditions: problem.conditions.map((condition) =>
                        condition.conditionId !== target.conditionId ? condition : { ...condition, ...patch },
                      ),
                    },
              ),
            },
      ),
    );
  };

  const gradeBenchmarkAnswer = async (problem: BenchmarkProblem, globalCriteria: string, answer: string) => {
    const gradingPrompt = `問題文:\n${problem.prompt}\n\n模範回答例:\n${problem.expectedAnswer || "未入力"}\n\n設問別採点基準:\n${problem.gradingCriteria || "未入力"}\n\n全体の採点基準:\n${globalCriteria || "未入力"}\n\n採点対象の回答:\n${answer}\n\n100点満点で採点し、以下の形式で返してください。\n[SCORE]\n合計: XX点\nコメント: 採点理由\n[/SCORE]`;
    const raw = await callGroq(apiKey, model, [
      { role: "system", content: "あなたはベンチマーク回答を採点するAIです。模範回答と採点基準を優先して、公平に100点満点で採点してください。" },
      { role: "user", content: gradingPrompt },
    ]);
    return { raw, score: parseBenchmarkScore(raw) };
  };

  const pushBenchmarkLog = (line: string) => {
    setBenchmarkProgress((current) => [...current, `[${new Date().toLocaleTimeString()}] ${line}`]);
  };

  const runBenchmarkCondition = async (conditionId: ConditionId, problem: BenchmarkProblem, globalCriteria: string, lawsSnapshot: LawRecord[], roundNumber: number) => {
    pushBenchmarkLog(`${conditionShortLabels[conditionId]}: AI-A1が回答を生成中...`);
    const a1Raw = await callGroq(apiKey, model, [
      { role: "system", content: a1SystemPrompt },
      { role: "user", content: `ベンチマーク問題:\n${problem.prompt}` },
    ]);
    const a1Thinking = extractTag(a1Raw, "THINKING");
    const a1Answer = extractTag(a1Raw, "ANSWER");

    if (conditionId === "condition5") {
      pushBenchmarkLog(`${conditionShortLabels[conditionId]}: AI採点中...`);
      const graded = await gradeBenchmarkAnswer(problem, globalCriteria, a1Answer);
      pushBenchmarkLog(`${conditionShortLabels[conditionId]}: 完了（${graded.score ?? "-"}点）`);
      return { conditionId, a1Thinking, a1Answer, improvedThinking: a1Thinking, improvedAnswer: a1Answer, autoScore: graded.score, autoComment: graded.raw } satisfies BenchmarkConditionResult;
    }

    const systemPrompt =
      conditionId === "condition1"
        ? buildA2Condition1System(activeConstitutionVersion, activeLegislativeRulesVersion)
        : conditionId === "condition2"
          ? buildA2Condition2System(activeConstitutionVersion)
          : conditionId === "condition3"
            ? buildA2Condition3System(activeConstitutionVersion)
            : a2Condition4System;

    const referencedLaws = conditionId === "condition1" ? formatLawsForPrompt(lawsSnapshot) : undefined;
    pushBenchmarkLog(`${conditionShortLabels[conditionId]}: AI-A2が改善${conditionId === "condition1" ? "と法律作成" : ""}を実行中...`);
    const a2Raw = await callGroq(apiKey, model, [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          conditionId === "condition1" || conditionId === "condition2"
            ? `以下が元のモデルの応答です:\n[THINKING]\n${a1Thinking}\n[/THINKING]\n\n[ANSWER]\n${a1Answer}\n[/ANSWER]\n\n保存済みlaws.json相当の法律一覧:\n${conditionId === "condition1" ? referencedLaws : "条件2では法律を参照しません。"}`
            : `以下が元のモデルの応答です:\n[ANSWER]\n${a1Answer}\n[/ANSWER]`,
      },
    ]);
    const law = conditionId === "condition1" ? extractTag(a2Raw, "LAW") : undefined;
    let review: string | undefined;
    if (conditionId === "condition1" && law && !isNoNewLaw(law)) {
      pushBenchmarkLog(`${conditionShortLabels[conditionId]}: AI-Bが法律を審査中...`);
      review = await callGroq(apiKey, model, [
        { role: "system", content: buildReviewSystemPrompt(activeConstitutionVersion, activeLegislativeRulesVersion) },
        { role: "user", content: `以下の法律を審査してください:\n${law}` },
      ]);
      const createdLaw = createLawRecord(law || a2Raw, review || "", extractTag(a2Raw, "LAW_USAGE"), roundNumber, lawsSnapshot.length, activeConstitutionVersion.name, activeLegislativeRulesVersion.name);
      lawsSnapshot.push(createdLaw);
    }
    const improvedThinking = conditionId === "condition1" || conditionId === "condition2" ? extractTag(a2Raw, "IMPROVED_THINKING") : a1Thinking;
    const improvedAnswer = extractTag(a2Raw, "IMPROVED_ANSWER");
    pushBenchmarkLog(`${conditionShortLabels[conditionId]}: AI採点中...`);
    const graded = await gradeBenchmarkAnswer(problem, globalCriteria, improvedAnswer);
    pushBenchmarkLog(`${conditionShortLabels[conditionId]}: 完了（${graded.score ?? "-"}点）`);
    return { conditionId, a1Thinking, a1Answer, improvedThinking, improvedAnswer, law, review, referencedLaws, autoScore: graded.score, autoComment: graded.raw } satisfies BenchmarkConditionResult;
  };

  const runBenchmark = async () => {
    if (!apiKey.trim() || !selectedBenchmark) {
      setRunMessage("Groq APIキーとベンチマークを選択してください。");
      return;
    }

    setIsBenchmarkRunning(true);
    setBenchmarkProgress([]);
    setRunMessage(`${selectedBenchmark.name} のベンチテストを実行中です...`);
    const lawSnapshot = [...laws];
    const runId = crypto.randomUUID();
    const benchmarkRound = rounds.length + benchmarkResults.length + 1;
    const problemResults: BenchmarkProblemResult[] = [];
    const partialRunBase: BenchmarkRunResult = {
      id: runId,
      benchmarkId: selectedBenchmark.id,
      benchmarkName: selectedBenchmark.name,
      executedAt: new Date().toISOString(),
      constitutionVersionName: activeConstitutionVersion.name,
      legislativeRulesVersionName: activeLegislativeRulesVersion.name,
      results: [],
    };
    setCurrentBenchmarkRun(partialRunBase);

    for (const [problemIndex, problem] of selectedBenchmark.problems.entries()) {
      pushBenchmarkLog(`問題${problemIndex + 1}: 開始`);
      const conditions: BenchmarkConditionResult[] = [];
      for (const conditionId of Object.keys(conditionTitles) as ConditionId[]) {
        conditions.push(await runBenchmarkCondition(conditionId, problem, selectedBenchmark.globalCriteria, lawSnapshot, benchmarkRound));
        setCurrentBenchmarkRun({
          ...partialRunBase,
          results: [
            ...problemResults,
            {
              problemNumber: problemIndex + 1,
              prompt: problem.prompt,
              expectedAnswer: problem.expectedAnswer,
              gradingCriteria: problem.gradingCriteria,
              conditions: [...conditions],
            },
          ],
        });
      }
      problemResults.push({
        problemNumber: problemIndex + 1,
        prompt: problem.prompt,
        expectedAnswer: problem.expectedAnswer,
        gradingCriteria: problem.gradingCriteria,
        conditions,
      });
      pushBenchmarkLog(`問題${problemIndex + 1}: 完了`);
    }

    const nextRun: BenchmarkRunResult = {
      id: runId,
      benchmarkId: selectedBenchmark.id,
      benchmarkName: selectedBenchmark.name,
      executedAt: new Date().toISOString(),
      constitutionVersionName: activeConstitutionVersion.name,
      legislativeRulesVersionName: activeLegislativeRulesVersion.name,
      results: problemResults,
    };

    setLaws(lawSnapshot);
    setCurrentBenchmarkRun(nextRun);
    setBenchmarkResults((current) => [nextRun, ...current]);
    setIsBenchmarkRunning(false);
    setRunMessage(`${selectedBenchmark.name} のベンチテストが完了しました。`);
  };

  const buildA1Messages = (conditionId: ConditionId): ChatMessage[] => {
    const memory = learningMemory[conditionId].slice(-3).join("\n\n");
    return [
      { role: "system", content: a1SystemPrompt },
      {
        role: "user",
        content: `${memory ? `過去の改善ノウハウ:\n${memory}\n\n` : ""}タスク:\n${taskPrompt}`,
      },
    ];
  };

  const scoreAnswers = async (a: string, b: string) => {
    return callGroq(apiKey, model, [
      { role: "system", content: scoreSystemPrompt },
      { role: "user", content: `【回答A】\n${a}\n\n【回答B】\n${b}` },
    ]);
  };

  const runCondition = async (id: ConditionId, lawsSnapshot: LawRecord[], roundNumber: number) => {
    const progress: string[] = [];
    let conditionResult: ConditionResult = { id, title: conditionTitles[id], status: "実行中", progress };
    let createdLaw: LawRecord | undefined;

    const setSnapshot = (patch: Partial<ConditionResult>) => {
      conditionResult = { ...conditionResult, ...patch };
      updateCondition(id, patch);
    };

    const addProgress = (line: string) => {
      progress.push(line);
      conditionResult = { ...conditionResult, progress: [...progress], status: "実行中" };
      pushProgress(id, line);
    };

    updateCondition(id, { status: "実行中", progress: [], error: undefined });

    try {
      addProgress(`[${conditionTitles[id]}] Step1: AI-A1が回答を生成中...`);
      const a1Raw = await callGroq(apiKey, model, buildA1Messages(id));
      const a1Thinking = extractTag(a1Raw, "THINKING");
      const a1Answer = extractTag(a1Raw, "ANSWER");
      setSnapshot({ a1Thinking, a1Answer });

      if (id === "condition5") {
        addProgress(`[${conditionTitles[id]}] Step2: AI-B-subが採点中...`);
        const score = await scoreAnswers(`thinking:\n${a1Thinking}\n\n回答:\n${a1Answer}`, `thinking:\n${a1Thinking}\n\n回答:\n${a1Answer}`);
        setSnapshot({ score, status: "完了" });
        addProgress(`[${conditionTitles[id]}] 完了`);
        setSnapshot({ status: "完了", progress: [...progress] });
        return { result: conditionResult, law: createdLaw };
      }

      const systemPrompt =
        id === "condition1"
          ? buildA2Condition1System(activeConstitutionVersion, activeLegislativeRulesVersion)
          : id === "condition2"
            ? buildA2Condition2System(activeConstitutionVersion)
            : id === "condition3"
              ? buildA2Condition3System(activeConstitutionVersion)
              : a2Condition4System;

      addProgress(
        id === "condition1"
          ? `[${conditionTitles[id]}] Step2: AI-A2が保存済み法律を参照し、新しい法律と改善回答を作成中...`
          : `[${conditionTitles[id]}] Step2: AI-A2が改善中...`,
      );
      const a2Raw = await callGroq(apiKey, model, [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            id === "condition1" || id === "condition2"
              ? `以下が元のモデルの応答です:\n[THINKING]\n${a1Thinking}\n[/THINKING]\n\n[ANSWER]\n${a1Answer}\n[/ANSWER]\n\n保存済みlaws.json相当の法律一覧:\n${id === "condition1" ? formatLawsForPrompt(lawsSnapshot) : "条件2では法律を参照しません。"}\n\n条件1では、上の保存済み法律を先に参照してください。そのうえで、保存済み法律にない新しい改善ノウハウだけを[LAW]として作成し、保存済み法律と新規法律の両方を参照して[IMPROVED_THINKING]と[IMPROVED_ANSWER]を作成してください。`
              : `以下が元のモデルの応答です:\n[ANSWER]\n${a1Answer}\n[/ANSWER]`,
        },
      ]);

      const law = id === "condition1" ? extractTag(a2Raw, "LAW") : undefined;
      const lawUsage = id === "condition1" ? extractTag(a2Raw, "LAW_USAGE") : undefined;
      const improvedThinking = id === "condition1" || id === "condition2" ? extractTag(a2Raw, "IMPROVED_THINKING") : a1Thinking;
      const improvedAnswer = extractTag(a2Raw, "IMPROVED_ANSWER");
      setSnapshot({ law, improvedThinking, improvedAnswer });

      if (id === "condition1") {
        if (law && isNoNewLaw(law)) {
          addProgress(`[${conditionTitles[id]}] Step3: 新規法律なしのため審査APIをスキップします。`);
          setSnapshot({ review: "新規追加すべき法律がないと判断されたため、審査と保存をスキップしました。" });
        } else {
          addProgress(`[${conditionTitles[id]}] Step3: AI-Bが法律を審査中...`);
          const review = await callGroq(apiKey, model, [
            { role: "system", content: buildReviewSystemPrompt(activeConstitutionVersion, activeLegislativeRulesVersion) },
            { role: "user", content: `以下の法律を審査してください:\n${law || a2Raw}` },
          ]);
          setSnapshot({ review });
          createdLaw = createLawRecord(
            law || a2Raw,
            review,
            lawUsage || "",
            roundNumber,
            lawsSnapshot.length,
            activeConstitutionVersion.name,
            activeLegislativeRulesVersion.name,
          );
          addProgress(`[${conditionTitles[id]}] Step4: 法律をブラウザ内に保存します（${createdLaw.status}）。`);
        }
      }

      addProgress(`[${conditionTitles[id]}] Step${id === "condition1" ? "5" : "3"}: AI-B-subが採点中...`);
      const score = await scoreAnswers(
        `thinking:\n${a1Thinking}\n\n回答:\n${a1Answer}`,
        `thinking:\n${improvedThinking}\n\n回答:\n${improvedAnswer}`,
      );
      setSnapshot({ score });

      addProgress(`[${conditionTitles[id]}] Step${id === "condition1" ? "6" : "4"}: AI-A1用の改善ノウハウを保存中...`);
      setLearningMemory((current) => ({
        ...current,
        [id]: [...current[id], `[${new Date().toLocaleString()}]\n${improvedThinking}\n${improvedAnswer}`],
      }));

      setSnapshot({ status: "完了" });
      addProgress(`[${conditionTitles[id]}] 完了`);
      setSnapshot({ status: "完了", progress: [...progress] });
    } catch (error) {
      setSnapshot({
        status: "エラー",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
      addProgress(`[${conditionTitles[id]}] APIエラー: スキップ`);
      setSnapshot({ status: "エラー", progress: [...progress] });
    }

    return { result: conditionResult, law: createdLaw };
  };

  const runAllConditions = async () => {
    if (!apiKey.trim() || !taskPrompt.trim()) {
      setRunMessage("Groq APIキーとタスクを入力してください。");
      return;
    }

    localStorage.setItem(STORAGE_KEYS.apiKey, apiKey.trim());
    localStorage.setItem(STORAGE_KEYS.model, model);
    setIsRunning(true);
    setRunMessage(`5つの条件を順番に実行しています。API呼び出し間隔は最低${MIN_API_INTERVAL_MS / 1000}秒です。`);
    setResults(initialConditions);

    const roundNumber = rounds.length + 1;
    const finalResults: ConditionResult[] = [];
    const lawsBeforeRun = [...laws];
    const newlyReviewedLaws: LawRecord[] = [];

    for (const result of initialConditions) {
      const conditionOutput = await runCondition(result.id, [...lawsBeforeRun, ...newlyReviewedLaws], roundNumber);
      finalResults.push(conditionOutput.result);
      if (conditionOutput.law) {
        newlyReviewedLaws.push(conditionOutput.law);
      }
    }

    const nextLaws = [...lawsBeforeRun, ...newlyReviewedLaws];
    const nextRound: ExperimentRound = {
      roundNumber,
      timestamp: new Date().toISOString(),
      taskPrompt,
      model,
      constitutionVersionName: activeConstitutionVersion.name,
      legislativeRulesVersionName: activeLegislativeRulesVersion.name,
      conditions: finalResults,
    };

    setLaws(nextLaws);
    setRounds((current) => [nextRound, ...current].slice(0, 30));
    setResults(finalResults);

    setIsRunning(false);
    setRunMessage("全条件が完了し、実験結果と法律をブラウザ内に保存しました。次の入力を待機できます。");
  };

  return (
    <>
    <main className="min-h-screen bg-[#f4efe7] text-[#171411]">
      <section className="relative overflow-hidden border-b-2 border-[#171411] px-5 py-10 sm:px-8 lg:px-12">
        <div className="absolute inset-0 cls-grid" />
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.34em] text-[#e85d2a]">Groq Relay Lab</p>
            <h1 className="mt-5 text-5xl font-black leading-[0.9] tracking-[-0.06em] sm:text-7xl lg:text-8xl">
              5条件AIリレー実験アプリ
            </h1>
            <p className="mt-6 text-lg leading-8 text-[#554b42]">
              Groq APIキーをサイト上で入力し、タスクを1つ送ると条件1から条件5まで順番に処理します。条件1は保存済みlaws.json相当の法律を参照し、新しい法律も使って改善回答を作ります。
            </p>
          </div>

          <div className="input-panel border-2 border-[#171411] bg-white p-5 shadow-[10px_10px_0_#171411] sm:p-7">
            <label className="block text-sm font-black uppercase tracking-[0.22em]" htmlFor="api-key">
              Groq API Key
            </label>
            <input
              className="mt-3 w-full border-2 border-[#171411] bg-[#fffaf1] px-4 py-3 font-mono text-sm outline-none transition focus:bg-white focus:shadow-[4px_4px_0_#e85d2a]"
              id="api-key"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="gsk_..."
              type="password"
              value={apiKey}
            />

            <label className="mt-5 block text-sm font-black uppercase tracking-[0.22em]" htmlFor="model">
              Model
            </label>
            <select
              className="mt-3 w-full border-2 border-[#171411] bg-[#fffaf1] px-4 py-3 font-mono text-sm outline-none transition focus:bg-white focus:shadow-[4px_4px_0_#e85d2a]"
              id="model"
              onChange={(event) => setModel(event.target.value)}
              value={model}
            >
              {modelOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label className="mt-5 block text-sm font-black uppercase tracking-[0.22em]" htmlFor="task">
              Task Prompt
            </label>
            <textarea
              className="mt-3 min-h-36 w-full resize-y border-2 border-[#171411] bg-[#fffaf1] px-4 py-3 text-base leading-7 outline-none transition focus:bg-white focus:shadow-[4px_4px_0_#e85d2a]"
              id="task"
              onChange={(event) => setTaskPrompt(event.target.value)}
              placeholder="ここに実験用プロンプトを1つ入力してください"
              value={taskPrompt}
            />

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                className="bg-[#171411] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:-translate-y-1 hover:bg-[#e85d2a] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isRunning}
                onClick={runAllConditions}
                type="button"
              >
                {isRunning ? "実行中..." : "5条件を実行"}
              </button>
              <p className="text-sm font-bold text-[#554b42]">{runMessage}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 border-b-2 border-[#171411] pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-[#e85d2a]">Progress</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-5xl">{completedCount} / 5 条件完了</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[#554b42]">
            保存済みラウンド {rounds.length} 件、保存済み法律 {laws.length} 件、承認済み法律 {approvedLawCount} 件。承認済み法律を条件1の改善AIに渡します。サーバーは使わず、API呼び出しは直列実行で最低{MIN_API_INTERVAL_MS / 1000}秒あけます。
          </p>
        </div>

        <div className="mx-auto mt-6 flex max-w-7xl flex-wrap gap-3">
          {[
            ["results", "現在の結果"],
            ["laws", "保存済み法律"],
            ["constitution", "憲法/立法ルール"],
            ["analytics", "分析結果"],
            ["benchmarks", "ベンチマーク"],
            ["benchtest", "ベンチテスト"],
            ["benchresults", "ベンチ結果"],
            ["history", "実験履歴"],
          ].map(([tab, label]) => (
            <button
              className={`border-2 border-[#171411] px-4 py-3 text-sm font-black tracking-[0.12em] transition hover:-translate-y-1 ${
                activeTab === tab ? "bg-[#171411] text-white" : "bg-white text-[#171411]"
              }`}
              key={tab}
              onClick={() => setActiveTab(tab as "results" | "laws" | "history" | "constitution" | "analytics" | "benchmarks" | "benchtest" | "benchresults")}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "results" && <div className="mx-auto mt-8 grid max-w-7xl gap-5">
          {results.map((result) => (
            <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]" key={result.id}>
              <div className="flex flex-col gap-2 border-b-2 border-[#171411] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-xl font-black tracking-[-0.02em]">{result.title}</h3>
                <span className={`status-badge ${result.status === "完了" ? "is-done" : result.status === "エラー" ? "is-error" : ""}`}>
                  {result.status}
                </span>
              </div>

              {result.progress.length > 0 && (
                <div className="mt-4 bg-[#171411] p-4 font-mono text-xs leading-6 text-[#f9e9c7]">
                  {result.progress.map((line, lineIndex) => (
                    <div key={`${result.id}-${lineIndex}`}>{line}</div>
                  ))}
                </div>
              )}

              {result.error && <p className="mt-4 border-2 border-[#e85d2a] bg-[#fff1e8] p-4 font-bold text-[#9f2f13]">{result.error}</p>}

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <ResponseBlock title="AI-A1 思考要約" value={result.a1Thinking} />
                <ResponseBlock title="AI-A1 回答" value={result.a1Answer} />
                <ResponseBlock title="作成された法律" value={result.law} />
                <ResponseBlock title="法律審査" value={result.review} />
                <ResponseBlock title="改善 thinking" value={result.improvedThinking} />
                <ResponseBlock title="改善回答" value={result.improvedAnswer} />
              </div>

              <ResponseBlock className="mt-4" title="AI-B-sub 採点" value={result.score} />
            </article>
          ))}
        </div>}

        {activeTab === "laws" && (
          <div className="mx-auto mt-8 grid max-w-7xl gap-5">
            {laws.length === 0 ? (
              <p className="border-2 border-[#171411] bg-white p-5 font-bold shadow-[6px_6px_0_#171411]">まだ法律は保存されていません。</p>
            ) : (
              laws.map((law) => (
                <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]" key={law.id}>
                  <div className="flex flex-col gap-2 border-b-2 border-[#171411] pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-xl font-black tracking-[-0.02em]">{law.id}: {law.name}</h3>
                    <div className="flex flex-wrap gap-2">
                      <span className={`status-badge ${law.status === "承認" ? "is-done" : "is-error"}`}>{law.status}</span>
                      <button
                        className="border-2 border-[#171411] bg-[#fffaf1] px-3 py-2 text-xs font-black tracking-[0.12em] transition hover:-translate-y-1 hover:bg-white"
                        onClick={() => startEditingLaw(law)}
                        type="button"
                      >
                        編集
                      </button>
                      <button
                        className="border-2 border-[#171411] bg-[#ffb09a] px-3 py-2 text-xs font-black tracking-[0.12em] transition hover:-translate-y-1 hover:bg-white"
                        onClick={() => deleteLaw(law.id)}
                        type="button"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-bold leading-7 text-[#554b42]">
                    作成ラウンド: {law.roundNumber} / 保存日時: {new Date(law.createdAt).toLocaleString()}<br />
                    作成時バージョン: {law.constitutionVersionName || "記録なし"} / {law.legislativeRulesVersionName || "記録なし"}
                  </p>
                  {editingLawId === law.id ? (
                    <div className="mt-5 border-2 border-[#171411] bg-[#fffaf1] p-4">
                      <label className="block text-xs font-black uppercase tracking-[0.18em] text-[#e85d2a]" htmlFor={`${law.id}-name`}>
                        名前
                      </label>
                      <input
                        className="mt-2 w-full border-2 border-[#171411] bg-white px-4 py-3 text-sm outline-none focus:shadow-[4px_4px_0_#e85d2a]"
                        id={`${law.id}-name`}
                        onChange={(event) => setLawEditDraft((current) => ({ ...current, name: event.target.value }))}
                        value={lawEditDraft.name}
                      />

                      <label className="mt-4 block text-xs font-black uppercase tracking-[0.18em] text-[#e85d2a]" htmlFor={`${law.id}-content`}>
                        内容
                      </label>
                      <textarea
                        className="mt-2 min-h-28 w-full border-2 border-[#171411] bg-white px-4 py-3 text-sm leading-7 outline-none focus:shadow-[4px_4px_0_#e85d2a]"
                        id={`${law.id}-content`}
                        onChange={(event) => setLawEditDraft((current) => ({ ...current, content: event.target.value }))}
                        value={lawEditDraft.content}
                      />

                      <label className="mt-4 block text-xs font-black uppercase tracking-[0.18em] text-[#e85d2a]" htmlFor={`${law.id}-reason`}>
                        理由
                      </label>
                      <textarea
                        className="mt-2 min-h-24 w-full border-2 border-[#171411] bg-white px-4 py-3 text-sm leading-7 outline-none focus:shadow-[4px_4px_0_#e85d2a]"
                        id={`${law.id}-reason`}
                        onChange={(event) => setLawEditDraft((current) => ({ ...current, reason: event.target.value }))}
                        value={lawEditDraft.reason}
                      />

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          className="bg-[#171411] px-4 py-3 text-xs font-black tracking-[0.14em] text-white transition hover:-translate-y-1 hover:bg-[#e85d2a]"
                          onClick={() => saveEditedLaw(law.id)}
                          type="button"
                        >
                          保存
                        </button>
                        <button
                          className="border-2 border-[#171411] bg-white px-4 py-3 text-xs font-black tracking-[0.14em] transition hover:-translate-y-1"
                          onClick={cancelEditingLaw}
                          type="button"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <ResponseBlock className="mt-4" title="法律内容" value={law.content} />
                      <ResponseBlock className="mt-4" title="理由" value={law.reason || extractField(law.sourceRaw, "理由")} />
                      <ResponseBlock className="mt-4" title="法律の原文" value={law.sourceRaw} />
                      <ResponseBlock className="mt-4" title="審査結果" value={law.review} />
                      <ResponseBlock className="mt-4" title="使用状況ラベル" value={law.usageRaw} />
                    </>
                  )}
                </article>
              ))
            )}
          </div>
        )}

        {activeTab === "constitution" && (
          <div className="mx-auto mt-8 grid max-w-7xl gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
              <div className="border-b-2 border-[#171411] pb-4">
                <p className="text-sm font-black uppercase tracking-[0.2em] text-[#e85d2a]">Active Version</p>
                <h3 className="mt-2 text-2xl font-black tracking-[-0.03em]">
                  {activeConstitutionVersion.name} / {activeLegislativeRulesVersion.name}
                </h3>
                <p className="mt-2 text-sm font-bold text-[#554b42]">
                  憲法 {constitutionVersions.length} 件、立法ルール {legislativeRulesVersions.length} 件。保存した項目だけ個別に新バージョン化されます。
                </p>
              </div>

              <label className="mt-5 block text-xs font-black uppercase tracking-[0.18em] text-[#e85d2a]" htmlFor="constitution-text">
                憲法
              </label>
              <textarea
                className="mt-2 min-h-56 w-full border-2 border-[#171411] bg-[#fffaf1] px-4 py-3 text-sm leading-7 outline-none focus:bg-white focus:shadow-[4px_4px_0_#e85d2a]"
                id="constitution-text"
                onChange={(event) => setConstitutionDraft(event.target.value)}
                value={constitutionDraft}
              />

              <label className="mt-5 block text-xs font-black uppercase tracking-[0.18em] text-[#e85d2a]" htmlFor="legislative-rules">
                立法ルール
              </label>
              <textarea
                className="mt-2 min-h-72 w-full border-2 border-[#171411] bg-[#fffaf1] px-4 py-3 text-sm leading-7 outline-none focus:bg-white focus:shadow-[4px_4px_0_#e85d2a]"
                id="legislative-rules"
                onChange={(event) => setLegislativeRulesDraft(event.target.value)}
                value={legislativeRulesDraft}
              />

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className="bg-[#171411] px-5 py-4 text-xs font-black tracking-[0.14em] text-white transition hover:-translate-y-1 hover:bg-[#e85d2a]"
                  onClick={saveConstitutionVersion}
                  type="button"
                >
                  憲法を新バージョン保存
                </button>
                <button
                  className="bg-[#e85d2a] px-5 py-4 text-xs font-black tracking-[0.14em] text-white transition hover:-translate-y-1 hover:bg-[#171411]"
                  onClick={saveLegislativeRulesVersion}
                  type="button"
                >
                  立法ルールを新バージョン保存
                </button>
                <button
                  className="border-2 border-[#171411] bg-white px-5 py-4 text-xs font-black tracking-[0.14em] transition hover:-translate-y-1"
                  onClick={() => {
                    setConstitutionDraft(activeConstitutionVersion.text);
                    setLegislativeRulesDraft(activeLegislativeRulesVersion.text);
                    setRunMessage(`${activeConstitutionVersion.name} / ${activeLegislativeRulesVersion.name} の内容に戻しました。`);
                  }}
                  type="button"
                >
                  編集を戻す
                </button>
              </div>
            </article>

            <div className="grid gap-5 content-start">
              <article className="border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
                <h3 className="border-b-2 border-[#171411] pb-4 text-xl font-black tracking-[-0.02em]">憲法バージョン履歴</h3>
                <div className="mt-4 grid gap-4">
              {constitutionVersions.slice().reverse().map((version) => (
                  <section className="border-2 border-[#171411] bg-[#fffaf1] p-4" key={`${version.name}-${version.createdAt}`}>
                    <div className="flex flex-col gap-2 border-b-2 border-[#171411] pb-3 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-xl font-black tracking-[-0.02em]">{version.name}</h3>
                      <div className="flex flex-wrap gap-2">
                        <span className={`status-badge ${activeConstitutionVersion.name === version.name ? "is-done" : ""}`}>
                          {activeConstitutionVersion.name === version.name ? "採用中" : new Date(version.createdAt).toLocaleString()}
                        </span>
                        <button
                          className="border-2 border-[#171411] bg-white px-3 py-2 text-xs font-black tracking-[0.12em] transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={activeConstitutionVersion.name === version.name}
                          onClick={() => {
                            setActiveConstitutionName(version.name);
                            setRunMessage(`${version.name} を採用しました。次回の実験からこの憲法を使用します。`);
                          }}
                          type="button"
                        >
                          採用
                        </button>
                      </div>
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[#2b2520]">{version.text}</pre>
                  </section>
              ))}
                </div>
              </article>

              <article className="border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
                <h3 className="border-b-2 border-[#171411] pb-4 text-xl font-black tracking-[-0.02em]">立法ルールバージョン履歴</h3>
                <div className="mt-4 grid gap-4">
                  {legislativeRulesVersions.slice().reverse().map((version) => (
                    <section className="border-2 border-[#171411] bg-[#fffaf1] p-4" key={`${version.name}-${version.createdAt}`}>
                      <div className="flex flex-col gap-2 border-b-2 border-[#171411] pb-3 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-xl font-black tracking-[-0.02em]">{version.name}</h3>
                        <div className="flex flex-wrap gap-2">
                          <span className={`status-badge ${activeLegislativeRulesVersion.name === version.name ? "is-done" : ""}`}>
                            {activeLegislativeRulesVersion.name === version.name ? "採用中" : new Date(version.createdAt).toLocaleString()}
                          </span>
                          <button
                            className="border-2 border-[#171411] bg-white px-3 py-2 text-xs font-black tracking-[0.12em] transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={activeLegislativeRulesVersion.name === version.name}
                            onClick={() => {
                              setActiveLegislativeRulesName(version.name);
                              setRunMessage(`${version.name} を採用しました。次回の実験からこの立法ルールを使用します。`);
                            }}
                            type="button"
                          >
                            採用
                          </button>
                        </div>
                      </div>
                      <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[#2b2520]">{version.text}</pre>
                    </section>
                  ))}
                </div>
              </article>
            </div>
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="mx-auto mt-8 grid max-w-7xl gap-5">
            {analytics.points.length === 0 ? (
              <p className="border-2 border-[#171411] bg-white p-5 font-bold shadow-[6px_6px_0_#171411]">
                まだ分析できる採点結果がありません。実験を1回以上実行してください。
              </p>
            ) : (
              <>
                <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
                  <div className="border-b-2 border-[#171411] pb-4">
                    <p className="text-sm font-black uppercase tracking-[0.2em] text-[#e85d2a]">Score Line Chart</p>
                    <h3 className="mt-2 text-2xl font-black tracking-[-0.03em]">オリジナルと改善回答の推移</h3>
                  </div>
                  <LineChart points={analytics.points} rounds={analytics.chronologicalRounds.map((round) => round.roundNumber)} />
                </article>

                <article className="result-panel overflow-x-auto border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
                  <h3 className="border-b-2 border-[#171411] pb-4 text-2xl font-black tracking-[-0.03em]">採点結果表</h3>
                  <table className="mt-4 min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-[#171411] text-left text-white">
                        <th className="p-3">ラウンド</th>
                        <th className="p-3">条件</th>
                        <th className="p-3">オリジナル</th>
                        <th className="p-3">改善回答</th>
                        <th className="p-3">差分</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.points.map((point) => (
                        <tr className="border-b-2 border-[#171411]" key={`${point.roundNumber}-${point.conditionId}`}>
                          <td className="p-3 font-bold">{point.roundNumber}</td>
                          <td className="p-3 font-bold">{point.conditionLabel}</td>
                          <td className="p-3">{point.original ?? "-"}</td>
                          <td className="p-3">{point.improved ?? "-"}</td>
                          <td className="p-3">{point.original !== null && point.improved !== null ? point.improved - point.original : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </article>

                <div className="grid gap-5 lg:grid-cols-3">
                  <RankingPanel title="最終値ランキング" items={analytics.finalRanking} />
                  <RankingPanel title="AUCランキング" items={analytics.aucRanking} />
                  <RankingPanel title="条件5差分の累積ランキング" items={analytics.cumulativeRanking} />
                </div>

                <div className="grid gap-5 lg:grid-cols-3">
                  <BumpChart title="最終値ランキング推移" points={analytics.bump.final} rounds={analytics.chronologicalRounds.map((round) => round.roundNumber)} />
                  <BumpChart title="AUCランキング推移" points={analytics.bump.auc} rounds={analytics.chronologicalRounds.map((round) => round.roundNumber)} />
                  <BumpChart title="条件5差分累積ランキング推移" points={analytics.bump.cumulative} rounds={analytics.chronologicalRounds.map((round) => round.roundNumber)} />
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "benchmarks" && (
          <div className="mx-auto mt-8 grid max-w-7xl gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
              <h3 className="border-b-2 border-[#171411] pb-4 text-2xl font-black tracking-[-0.03em]">ベンチマーク作成・編集</h3>
              <label className="mt-5 block text-xs font-black uppercase tracking-[0.18em] text-[#e85d2a]">編集中の名前</label>
              <input className="mt-2 w-full border-2 border-[#171411] bg-[#fffaf1] px-4 py-3 text-sm outline-none" onChange={(event) => setBenchmarkName(event.target.value)} value={benchmarkName} />
              <label className="mt-5 block text-xs font-black uppercase tracking-[0.18em] text-[#e85d2a]">全体の採点基準</label>
              <textarea className="mt-2 min-h-28 w-full border-2 border-[#171411] bg-[#fffaf1] px-4 py-3 text-sm leading-7 outline-none" onChange={(event) => setBenchmarkGlobalCriteria(event.target.value)} value={benchmarkGlobalCriteria} />
              <div className="mt-5 grid gap-4">
                {benchmarkProblems.map((problem, index) => (
                  <div key={problem.id}>
                    <button className="mb-2 w-full border-2 border-dashed border-[#171411] bg-white py-2 text-xs font-black opacity-0 transition hover:opacity-100 focus:opacity-100" onClick={() => insertBenchmarkProblem(index)} type="button">+ ここに問題を追加</button>
                    <section
                      className="group border-2 border-[#171411] bg-[#fffaf1] p-4"
                      draggable
                      onDragStart={() => setDraggedProblemIndex(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggedProblemIndex !== null) {
                          moveBenchmarkProblem(draggedProblemIndex, index);
                          setDraggedProblemIndex(null);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between border-b-2 border-[#171411] pb-3">
                        <h4 className="font-black">問題 {index + 1}</h4>
                        <div className="flex gap-2">
                          <button className="border-2 border-[#171411] bg-white px-3 py-1 text-xs font-black" onClick={() => insertBenchmarkProblem(index + 1)} type="button">+</button>
                          <button className="border-2 border-[#171411] bg-[#ffb09a] px-3 py-1 text-xs font-black" onClick={() => removeBenchmarkProblem(index)} type="button">削除</button>
                        </div>
                      </div>
                      <textarea className="mt-3 min-h-24 w-full border-2 border-[#171411] bg-white px-3 py-2 text-sm" onChange={(event) => updateBenchmarkProblem(index, { prompt: event.target.value })} placeholder="問題文" value={problem.prompt} />
                      <textarea className="mt-3 min-h-20 w-full border-2 border-[#171411] bg-white px-3 py-2 text-sm" onChange={(event) => updateBenchmarkProblem(index, { expectedAnswer: event.target.value })} placeholder="模範回答例" value={problem.expectedAnswer} />
                      <textarea className="mt-3 min-h-20 w-full border-2 border-[#171411] bg-white px-3 py-2 text-sm" onChange={(event) => updateBenchmarkProblem(index, { gradingCriteria: event.target.value })} placeholder="採点基準" value={problem.gradingCriteria} />
                    </section>
                  </div>
                ))}
              </div>
              <button className="mt-4 w-full border-2 border-dashed border-[#171411] bg-white py-3 text-sm font-black" onClick={() => insertBenchmarkProblem(benchmarkProblems.length)} type="button">+ 問題を追加</button>
              <button className="mt-4 bg-[#171411] px-5 py-4 text-xs font-black tracking-[0.14em] text-white" onClick={saveBenchmark} type="button">保存 / 新バージョンとして保存</button>
            </article>

            <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
              <h3 className="border-b-2 border-[#171411] pb-4 text-2xl font-black tracking-[-0.03em]">保存済みベンチマーク</h3>
              <div className="mt-4 grid gap-3">
                {benchmarks.length === 0 ? <p className="font-bold">まだ保存されていません。</p> : benchmarks.map((benchmark) => (
                  <section className="border-2 border-[#171411] bg-[#fffaf1] p-4" key={benchmark.id}>
                    <h4 className="font-black">{benchmark.name}</h4>
                    <p className="mt-1 text-xs font-bold text-[#554b42]">{new Date(benchmark.createdAt).toLocaleString()} / {benchmark.problems.length}問</p>
                    <div className="mt-3 flex gap-2">
                      <button className="border-2 border-[#171411] bg-white px-3 py-2 text-xs font-black" onClick={() => loadBenchmarkForEdit(benchmark)} type="button">編集</button>
                      <button className="border-2 border-[#171411] bg-[#ffb09a] px-3 py-2 text-xs font-black" onClick={() => deleteBenchmark(benchmark.id)} type="button">削除</button>
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </div>
        )}

        {activeTab === "benchtest" && (
          <div className="mx-auto mt-8 grid max-w-7xl gap-5">
            <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
              <h3 className="border-b-2 border-[#171411] pb-4 text-2xl font-black tracking-[-0.03em]">ベンチテスト実行</h3>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <select className="flex-1 border-2 border-[#171411] bg-[#fffaf1] px-4 py-3 text-sm font-bold" onChange={(event) => setSelectedBenchmarkId(event.target.value)} value={selectedBenchmark?.id || ""}>
                  {benchmarks.map((benchmark) => <option key={benchmark.id} value={benchmark.id}>{benchmark.name}</option>)}
                </select>
                <button className="bg-[#171411] px-5 py-4 text-xs font-black tracking-[0.14em] text-white disabled:opacity-50" disabled={isBenchmarkRunning || benchmarks.length === 0} onClick={runBenchmark} type="button">{isBenchmarkRunning ? "実行中..." : "実行"}</button>
              </div>
            </article>

            {benchmarkProgress.length > 0 && (
              <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
                <h3 className="border-b-2 border-[#171411] pb-4 text-xl font-black">実行ログ</h3>
                <div className="mt-4 max-h-80 overflow-auto bg-[#171411] p-4 font-mono text-xs leading-6 text-[#f9e9c7]">
                  {benchmarkProgress.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}
                </div>
              </article>
            )}

            {currentBenchmarkAnalytics && currentBenchmarkRun && (
              <div className="grid gap-5 lg:grid-cols-3">
                <RankingPanel title="今回の最終値ランキング" items={currentBenchmarkAnalytics.finalRanking} />
                <RankingPanel title="今回のAUCランキング" items={currentBenchmarkAnalytics.aucRanking} />
                <RankingPanel title="今回の累積差分ランキング" items={currentBenchmarkAnalytics.cumulativeRanking} />
              </div>
            )}

            {currentBenchmarkRun && (
              <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]" key={currentBenchmarkRun.id}>
                <h3 className="border-b-2 border-[#171411] pb-4 text-xl font-black">今回の結果: {currentBenchmarkRun.benchmarkName}</h3>
                <p className="mt-3 text-xs font-black text-[#e85d2a]">{currentBenchmarkRun.constitutionVersionName} / {currentBenchmarkRun.legislativeRulesVersionName}</p>
                {currentBenchmarkRun.results.map((problem) => (
                  <section className="mt-4 border-2 border-[#171411] bg-[#fffaf1] p-4" key={`${currentBenchmarkRun.id}-${problem.problemNumber}`}>
                    <h4 className="font-black">問題 {problem.problemNumber}</h4>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{problem.prompt}</p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-5">
                      {problem.conditions.map((condition) => (
                        <div className="border-2 border-[#171411] bg-white p-3" key={`${problem.problemNumber}-${condition.conditionId}`}>
                          <h5 className="font-black">{conditionShortLabels[condition.conditionId]}</h5>
                          <p className="mt-2 text-sm font-bold">AI採点: {condition.autoScore ?? "-"}</p>
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-black text-[#e85d2a]">回答・採点詳細を開く</summary>
                            <ResponseBlock className="mt-3" title="AI-A1 thinking" value={condition.a1Thinking} />
                            <ResponseBlock className="mt-3" title="AI-A1 回答" value={condition.a1Answer} />
                            <ResponseBlock className="mt-3" title="改善 thinking" value={condition.improvedThinking} />
                            <ResponseBlock className="mt-3" title="改善回答" value={condition.improvedAnswer} />
                            <ResponseBlock className="mt-3" title="参照した法律" value={condition.referencedLaws} />
                            <ResponseBlock className="mt-3" title="作成法律" value={condition.law} />
                            <ResponseBlock className="mt-3" title="採点コメント" value={condition.autoComment} />
                          </details>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </article>
            )}
          </div>
        )}

        {activeTab === "benchresults" && (
          <div className="mx-auto mt-8 grid max-w-7xl gap-5 lg:grid-cols-[0.35fr_0.65fr]">
            <aside className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
              <h3 className="border-b-2 border-[#171411] pb-4 text-xl font-black">ベンチ一覧</h3>
              <div className="mt-4 grid gap-3">
                {benchmarks.length === 0 ? <p className="font-bold">まだベンチマークがありません。</p> : benchmarks.map((benchmark) => (
                  <button
                    className={`border-2 border-[#171411] p-4 text-left transition hover:-translate-y-1 ${selectedBenchmark?.id === benchmark.id ? "bg-[#171411] text-white" : "bg-[#fffaf1]"}`}
                    key={benchmark.id}
                    onClick={() => setSelectedBenchmarkId(benchmark.id)}
                    type="button"
                  >
                    <span className="block font-black">{benchmark.name}</span>
                    <span className="mt-1 block text-xs font-bold">{benchmarkResults.filter((result) => result.benchmarkId === benchmark.id).length}回実行</span>
                  </button>
                ))}
              </div>
            </aside>

            <div className="grid gap-5">
              {!selectedBenchmark || !benchmarkAnalytics ? (
                <p className="border-2 border-[#171411] bg-white p-5 font-bold shadow-[6px_6px_0_#171411]">ベンチマークを選択してください。</p>
              ) : (
                <>
                  <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
                    <h3 className="border-b-2 border-[#171411] pb-4 text-2xl font-black tracking-[-0.03em]">{selectedBenchmark.name} 総合結果</h3>
                    <ScoreModeTabs mode={benchmarkScoreMode} onChange={setBenchmarkScoreMode} />
                    <div className="mt-5 grid gap-5 lg:grid-cols-3">
                      <RankingPanel title="最終値ランキング" items={benchmarkAnalytics.finalRanking} />
                      <RankingPanel title="AUCランキング" items={benchmarkAnalytics.aucRanking} />
                      <RankingPanel title="累積差分ランキング" items={benchmarkAnalytics.cumulativeRanking} />
                    </div>
                    <BenchmarkLineChart className="mt-5" points={benchmarkAnalytics.points} title="全条件の平均点推移" />
                    <div className="mt-5 grid gap-5 lg:grid-cols-2">
                      <BumpChart title="採点結果ランキング推移" points={benchmarkAnalytics.bump} rounds={benchmarkAnalytics.runs.map((_, index) => index + 1)} />
                      <BenchmarkScoreTable points={benchmarkAnalytics.points} title="各条件の全体平均点記録表" />
                    </div>
                  </article>

                  <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
                    <h3 className="border-b-2 border-[#171411] pb-4 text-2xl font-black tracking-[-0.03em]">問題別結果</h3>
                    <div className="mt-4 grid gap-4">
                      {selectedBenchmark.problems.map((problem, index) => {
                        const problemAnalytics = buildBenchmarkAnalytics(benchmarkResults, selectedBenchmark.id, index + 1, benchmarkScoreMode);
                        return (
                          <details className="border-2 border-[#171411] bg-[#fffaf1] p-4" key={problem.id}>
                            <summary className="cursor-pointer text-lg font-black">問題 {index + 1}: {problem.prompt.slice(0, 48) || "無題"}</summary>
                            <ScoreModeTabs mode={benchmarkScoreMode} onChange={setBenchmarkScoreMode} />
                            <div className="mt-4 grid gap-5 lg:grid-cols-3">
                              <RankingPanel title="最終値" items={problemAnalytics.finalRanking} />
                              <RankingPanel title="AUC" items={problemAnalytics.aucRanking} />
                              <RankingPanel title="累積差分" items={problemAnalytics.cumulativeRanking} />
                            </div>
                            <BenchmarkLineChart className="mt-5" points={problemAnalytics.points} title={`問題${index + 1}の点数推移`} />
                            <div className="mt-5 grid gap-5 lg:grid-cols-2">
                              <BumpChart title="問題別ランキング推移" points={problemAnalytics.bump} rounds={problemAnalytics.runs.map((_, runIndex) => runIndex + 1)} />
                              <BenchmarkScoreTable points={problemAnalytics.points} title="問題別点数記録表" />
                            </div>
                            <details className="mt-5 border-2 border-[#171411] bg-white p-4">
                              <summary className="cursor-pointer font-black text-[#e85d2a]">個々の問題の履歴を開く</summary>
                              {problemAnalytics.runs.map((run) => {
                                const problemResult = run.results.find((result) => result.problemNumber === index + 1);
                                return problemResult ? (
                                  <section className="mt-4 border-2 border-[#171411] bg-[#fffaf1] p-4" key={`${run.id}-${index}`}>
                                    <h4 className="font-black">{new Date(run.executedAt).toLocaleString()}</h4>
                                    <div className="mt-3 grid gap-3 lg:grid-cols-5">
                                      {problemResult.conditions.map((condition) => (
                                        <details className="border-2 border-[#171411] bg-white p-3" key={`${run.id}-${condition.conditionId}`}>
                                          <summary className="cursor-pointer font-black">{conditionShortLabels[condition.conditionId]} / {condition.manualScore ?? condition.autoScore ?? "-"}点</summary>
                                          <button
                                            className="mt-3 w-full bg-[#171411] px-4 py-3 text-xs font-black tracking-[0.14em] text-white transition hover:-translate-y-1 hover:bg-[#e85d2a]"
                                            onClick={() => setSelfScoreTarget({ runId: run.id, problemNumber: problemResult.problemNumber, conditionId: condition.conditionId })}
                                            type="button"
                                          >
                                            自己採点
                                          </button>
                                          <ResponseBlock className="mt-3" title="AI-A1 thinking" value={condition.a1Thinking} />
                                          <ResponseBlock className="mt-3" title="AI-A1 回答" value={condition.a1Answer} />
                                          <ResponseBlock className="mt-3" title="改善 thinking" value={condition.improvedThinking} />
                                          <ResponseBlock className="mt-3" title="改善回答" value={condition.improvedAnswer} />
                                          <ResponseBlock className="mt-3" title="参照した法律" value={condition.referencedLaws} />
                                          <ResponseBlock className="mt-3" title="作成法律" value={condition.law} />
                                          <ResponseBlock className="mt-3" title="採点コメント" value={condition.autoComment} />
                                        </details>
                                      ))}
                                    </div>
                                  </section>
                                ) : null;
                              })}
                            </details>
                          </details>
                        );
                      })}
                    </div>
                  </article>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="mx-auto mt-8 grid max-w-7xl gap-5">
            {rounds.length === 0 ? (
              <p className="border-2 border-[#171411] bg-white p-5 font-bold shadow-[6px_6px_0_#171411]">まだ実験履歴は保存されていません。</p>
            ) : (
              rounds.map((round) => (
                <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]" key={`${round.roundNumber}-${round.timestamp}`}>
                  <div className="flex flex-col gap-2 border-b-2 border-[#171411] pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-xl font-black tracking-[-0.02em]">ラウンド {round.roundNumber}</h3>
                    <span className="status-badge is-done">{new Date(round.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="mt-4 text-sm font-black tracking-[0.12em] text-[#e85d2a]">
                    使用バージョン: {round.constitutionVersionName || "憲法(1)以前の記録"} / {round.legislativeRulesVersionName || "立法ルール(1)以前の記録"}
                  </p>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#554b42]">{round.taskPrompt}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {round.conditions.map((condition) => (
                      <button
                        className="border-2 border-[#171411] bg-[#fffaf1] p-3 text-left text-sm font-black transition hover:-translate-y-1 hover:bg-white"
                        key={`${round.roundNumber}-${condition.id}`}
                        onClick={() => {
                          setResults(round.conditions);
                          setActiveTab("results");
                          setRunMessage(`ラウンド ${round.roundNumber} を表示しています。`);
                        }}
                        type="button"
                      >
                        {condition.title}
                        <span className="mt-2 block text-xs text-[#e85d2a]">{condition.status}</span>
                      </button>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </section>
    </main>
    {selfScoreContext && selfScoreTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <section className="grid max-h-[88vh] w-full max-w-6xl overflow-hidden border-2 border-[#171411] bg-white shadow-[12px_12px_0_#171411] lg:grid-cols-2">
          <div className="max-h-[88vh] overflow-auto border-b-2 border-[#171411] p-5 lg:border-b-0 lg:border-r-2">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#e85d2a]">Self scoring</p>
            <h3 className="mt-2 text-2xl font-black">自己採点: {conditionShortLabels[selfScoreTarget.conditionId]}</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm font-bold text-[#554b42]">{selfScoreContext.problem.prompt}</p>
            <ResponseBlock className="mt-4" title="AI-A1 thinking" value={selfScoreContext.condition.a1Thinking} />
            <ResponseBlock className="mt-4" title="AI-A1 回答" value={selfScoreContext.condition.a1Answer} />
            <ResponseBlock className="mt-4" title="改善 thinking" value={selfScoreContext.condition.improvedThinking} />
            <ResponseBlock className="mt-4" title="改善回答" value={selfScoreContext.condition.improvedAnswer} />
            <ResponseBlock className="mt-4" title="参照した法律" value={selfScoreContext.condition.referencedLaws} />
            <ResponseBlock className="mt-4" title="作成法律" value={selfScoreContext.condition.law} />
          </div>
          <div className="max-h-[88vh] overflow-auto p-5">
            <div className="flex items-start justify-between gap-4 border-b-2 border-[#171411] pb-4">
              <div>
                <h3 className="text-2xl font-black">採点入力</h3>
                <p className="mt-2 text-sm font-bold text-[#554b42]">点数は半角数字で入力してください。自己採点ランキングにはこの点数が使われます。</p>
              </div>
              <button className="border-2 border-[#171411] bg-[#fffaf1] px-3 py-2 text-xs font-black" onClick={() => setSelfScoreTarget(null)} type="button">閉じる</button>
            </div>
            <label className="mt-5 block text-xs font-black uppercase tracking-[0.18em] text-[#e85d2a]">自己採点点数</label>
            <input
              className="mt-2 w-full border-2 border-[#171411] bg-[#fffaf1] px-4 py-3 text-lg font-black outline-none"
              inputMode="numeric"
              onChange={(event) => {
                const value = Number(event.target.value);
                updateBenchmarkManualScore(selfScoreTarget, { manualScore: Number.isFinite(value) ? value : undefined });
              }}
              placeholder="例: 85"
              type="number"
              value={selfScoreContext.condition.manualScore ?? ""}
            />
            <label className="mt-5 block text-xs font-black uppercase tracking-[0.18em] text-[#e85d2a]">コメント</label>
            <textarea
              className="mt-2 min-h-56 w-full border-2 border-[#171411] bg-[#fffaf1] px-4 py-3 text-sm leading-7 outline-none"
              onChange={(event) => updateBenchmarkManualScore(selfScoreTarget, { manualComment: event.target.value })}
              placeholder="採点理由、良かった点、減点理由など"
              value={selfScoreContext.condition.manualComment ?? ""}
            />
            <ResponseBlock className="mt-5" title="自動採点コメント" value={selfScoreContext.condition.autoComment} />
          </div>
        </section>
      </div>
    )}
    </>
  );
}

function ResponseBlock({ title, value, className = "" }: { title: string; value?: string; className?: string }) {
  if (!value) {
    return null;
  }

  return (
    <section className={`border-2 border-[#171411] bg-[#fffaf1] p-4 ${className}`}>
      <h4 className="text-xs font-black uppercase tracking-[0.2em] text-[#e85d2a]">{title}</h4>
      <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[#2b2520]">{value}</pre>
    </section>
  );
}

function ScoreModeTabs({ mode, onChange }: { mode: BenchmarkScoreMode; onChange: (mode: BenchmarkScoreMode) => void }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {[
        ["auto", "自動採点"],
        ["manual", "自己採点"],
      ].map(([value, label]) => (
        <button
          className={`border-2 border-[#171411] px-4 py-3 text-xs font-black tracking-[0.14em] transition hover:-translate-y-1 ${mode === value ? "bg-[#171411] text-white" : "bg-[#fffaf1]"}`}
          key={value}
          onClick={() => onChange(value as BenchmarkScoreMode)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function LineChart({ points, rounds }: { points: AnalyticsPoint[]; rounds: number[] }) {
  const width = 900;
  const height = 360;
  const padding = 42;
  const uniqueRounds = rounds.length > 0 ? rounds : [1];
  const xForRound = (roundNumber: number) => {
    const index = uniqueRounds.indexOf(roundNumber);
    const denominator = Math.max(uniqueRounds.length - 1, 1);
    return padding + (index / denominator) * (width - padding * 2);
  };
  const yForScore = (score: number) => height - padding - (score / 100) * (height - padding * 2);
  const conditionIds = Object.keys(conditionTitles) as ConditionId[];
  const series = conditionIds.flatMap((conditionId) => [
    { conditionId, kind: "original" as const, color: conditionChartColors[conditionId].light, dash: "6 6" },
    { conditionId, kind: "improved" as const, color: conditionChartColors[conditionId].dark, dash: "" },
  ]);

  return (
    <div className="mt-5 overflow-x-auto">
      <svg className="min-w-[900px]" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="採点結果の折れ線グラフ">
        {[0, 25, 50, 75, 100].map((score) => (
          <g key={score}>
            <line x1={padding} x2={width - padding} y1={yForScore(score)} y2={yForScore(score)} stroke="#d8cec0" strokeWidth="1" />
            <text x="8" y={yForScore(score) + 4} fill="#554b42" fontSize="12" fontWeight="700">{score}</text>
          </g>
        ))}
        {uniqueRounds.map((roundNumber) => (
          <text key={roundNumber} x={xForRound(roundNumber)} y={height - 10} fill="#554b42" fontSize="12" fontWeight="700" textAnchor="middle">
            R{roundNumber}
          </text>
        ))}
        {series.map((item) => {
          const pathPoints = points
            .filter((point) => point.conditionId === item.conditionId)
            .map((point) => ({ x: xForRound(point.roundNumber), y: yForScore((item.kind === "original" ? point.original : point.improved) ?? 0) }));
          const path = pathPoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
          return <path d={path} fill="none" key={`${item.conditionId}-${item.kind}`} stroke={item.color} strokeDasharray={item.dash} strokeLinecap="round" strokeLinejoin="round" strokeWidth={item.kind === "improved" ? 4 : 3} />;
        })}
      </svg>
      <div className="mt-4 flex flex-wrap gap-3 text-xs font-black">
        {conditionIds.map((conditionId) => (
          <div className="flex items-center gap-2" key={conditionId}>
            <span className="inline-block h-3 w-3" style={{ background: conditionChartColors[conditionId].dark }} />
            {conditionShortLabels[conditionId]} 濃色=改善 / 淡色=オリジナル
          </div>
        ))}
      </div>
    </div>
  );
}

function RankingPanel({ title, items }: { title: string; items: RankingItem[] }) {
  return (
    <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
      <h3 className="border-b-2 border-[#171411] pb-4 text-xl font-black tracking-[-0.03em]">{title}</h3>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <div className="flex items-center justify-between border-2 border-[#171411] bg-[#fffaf1] p-3" key={item.conditionId}>
            <span className="font-black">{item.rank}. {item.label}</span>
            <span className="font-mono text-sm font-black">{item.value.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function BumpChart({ title, points, rounds }: { title: string; points: BumpPoint[]; rounds: number[] }) {
  const width = 360;
  const height = 260;
  const padding = 34;
  const uniqueRounds = rounds.length > 0 ? rounds : [1];
  const conditionIds = Object.keys(conditionTitles) as ConditionId[];
  const xForRound = (roundNumber: number) => {
    const index = uniqueRounds.indexOf(roundNumber);
    const denominator = Math.max(uniqueRounds.length - 1, 1);
    return padding + (index / denominator) * (width - padding * 2);
  };
  const yForRank = (rank: number) => padding + ((rank - 1) / 4) * (height - padding * 2);

  return (
    <article className="result-panel border-2 border-[#171411] bg-white p-5 shadow-[6px_6px_0_#171411]">
      <h3 className="border-b-2 border-[#171411] pb-4 text-lg font-black tracking-[-0.03em]">{title}</h3>
      <svg className="mt-4 w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        {[1, 2, 3, 4, 5].map((rank) => (
          <g key={rank}>
            <line x1={padding} x2={width - padding} y1={yForRank(rank)} y2={yForRank(rank)} stroke="#d8cec0" />
            <text x="6" y={yForRank(rank) + 4} fill="#554b42" fontSize="11" fontWeight="800">{rank}</text>
          </g>
        ))}
        {conditionIds.map((conditionId) => {
          const conditionPoints = points.filter((point) => point.conditionId === conditionId);
          const path = conditionPoints.map((point, index) => `${index === 0 ? "M" : "L"}${xForRound(point.roundNumber)},${yForRank(point.rank)}`).join(" ");
          const lastPoint = conditionPoints.at(-1);
          return (
            <g key={conditionId}>
              <path d={path} fill="none" stroke={conditionChartColors[conditionId].dark} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
              {lastPoint && <text x={width - padding + 5} y={yForRank(lastPoint.rank) + 4} fill={conditionChartColors[conditionId].dark} fontSize="11" fontWeight="900">{conditionShortLabels[conditionId]}</text>}
            </g>
          );
        })}
      </svg>
    </article>
  );
}

function BenchmarkLineChart({ points, title, className = "" }: { points: BenchmarkScorePoint[]; title: string; className?: string }) {
  const width = 900;
  const height = 320;
  const padding = 42;
  const runIndexes = [...new Set(points.map((point) => point.runIndex))];
  const conditionIds = Object.keys(conditionTitles) as ConditionId[];
  const xForRun = (runIndex: number) => {
    const index = runIndexes.indexOf(runIndex);
    return padding + (index / Math.max(runIndexes.length - 1, 1)) * (width - padding * 2);
  };
  const yForScore = (score: number) => height - padding - (score / 100) * (height - padding * 2);

  return (
    <section className={`border-2 border-[#171411] bg-[#fffaf1] p-4 ${className}`}>
      <h4 className="text-sm font-black uppercase tracking-[0.18em] text-[#e85d2a]">{title}</h4>
      <div className="mt-4 overflow-x-auto">
        <svg className="min-w-[900px]" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
          {[0, 25, 50, 75, 100].map((score) => (
            <g key={score}>
              <line x1={padding} x2={width - padding} y1={yForScore(score)} y2={yForScore(score)} stroke="#d8cec0" />
              <text x="8" y={yForScore(score) + 4} fill="#554b42" fontSize="12" fontWeight="800">{score}</text>
            </g>
          ))}
          {runIndexes.map((runIndex) => (
            <text key={runIndex} x={xForRun(runIndex)} y={height - 10} fill="#554b42" fontSize="12" fontWeight="800" textAnchor="middle">Run {runIndex}</text>
          ))}
          {conditionIds.map((conditionId) => {
            const conditionPoints = points.filter((point) => point.conditionId === conditionId);
            const path = conditionPoints.map((point, index) => `${index === 0 ? "M" : "L"}${xForRun(point.runIndex)},${yForScore(point.score ?? 0)}`).join(" ");
            return <path d={path} fill="none" key={conditionId} stroke={conditionChartColors[conditionId].dark} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />;
          })}
        </svg>
      </div>
    </section>
  );
}

function BenchmarkScoreTable({ points, title }: { points: BenchmarkScorePoint[]; title: string }) {
  return (
    <section className="overflow-x-auto border-2 border-[#171411] bg-[#fffaf1] p-4">
      <h4 className="text-sm font-black uppercase tracking-[0.18em] text-[#e85d2a]">{title}</h4>
      <table className="mt-4 min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#171411] text-left text-white">
            <th className="p-3">実行</th>
            <th className="p-3">条件</th>
            <th className="p-3">点数</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr className="border-b-2 border-[#171411]" key={`${point.runIndex}-${point.conditionId}`}>
              <td className="p-3 font-bold">Run {point.runIndex}</td>
              <td className="p-3 font-bold">{point.conditionLabel}</td>
              <td className="p-3">{point.score?.toFixed(1) ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default App;