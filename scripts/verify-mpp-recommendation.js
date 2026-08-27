"use strict";

const assert = require("assert");
const {
  getScenarioSummary,
  getAutoAllocationOptions,
  normalizeScenario,
  projectRecommendationRows,
  renderMaterialQueue,
  renderScenarioBadge,
  renderScenarioSource,
  selectRecommendationItems,
} = require("../public/js/ppic-monthly-recommendation");

const matrixRows = [
  {
    key: "wc:inspection",
    type: "INHOUSE",
    days: {
      "2026-09-01": { qty: 40, minutes: 40, allocations: [] },
      "2026-09-08": { qty: 0, minutes: 0, allocations: [] },
    },
    children: [
      {
        key: "wc:inspection:route-insp",
        partCode: "FG-BRACKET",
        monthlyProductionQty: 40,
        days: {
          "2026-09-01": {
            qty: 40,
            minutes: 40,
            allocations: [
              {
                allocationId: "allocation-1",
                qty: 40,
                scheduleDate: "2026-09-01",
                partCode: "FG-BRACKET",
              },
            ],
          },
          "2026-09-08": { qty: 0, minutes: 0, allocations: [] },
        },
      },
    ],
  },
];

const scenarioFixture = {
  id: "scenario-1",
  status: "READY_WITH_OVERLOAD",
  summary: {
    fgOnTimeCount: 1,
    fgLateCount: 0,
    newAllocationCount: 1,
    movedOrSplitCount: 1,
    overloadCellCount: 1,
    materialQueueQty: 23,
    carryOverQty: 23,
  },
  items: [
    {
      id: "item-move",
      sequence: 1,
      itemType: "MOVE_ALLOCATION",
      changeType: "MOVE_ALLOCATION",
      applyStatus: "PENDING",
      workCenterId: "wc-inspection",
      sourceAllocationId: "allocation-1",
      partCode: "FG-BRACKET",
      proposedValue: {
        qty: 40,
        targetDate: "2026-09-08",
        targetRowKey: "wc:inspection",
        targetChildKey: "wc:inspection:route-insp",
        overload: false,
      },
      reasonCode: "MOVE_PROTECT_FG_DUE",
      trace: { fgRequiredDate: "2026-09-10" },
    },
    {
      id: "item-new",
      sequence: 2,
      itemType: "NEW_ALLOCATION",
      changeType: "ALLOCATE_REMAINING",
      applyStatus: "PENDING",
      workCenterId: "wc-inspection",
      partCode: "FG-BRACKET",
      proposedValue: {
        qty: 191,
        targetDate: "2026-09-08",
        targetRowKey: "wc:inspection",
        targetChildKey: "wc:inspection:route-insp",
        overload: true,
      },
      reasonCode: "NEW_EARLIEST_DUE",
      trace: { fgRequiredDate: "2026-09-10" },
    },
    {
      id: "item-queue",
      sequence: 3,
      itemType: "CARRY_OVER",
      changeType: null,
      applyStatus: "PENDING",
      workCenterId: "wc-inspection",
      partCode: "FG-BRACKET",
      processCode: "INSP-PACK",
      proposedValue: {
        qty: 23,
        earliestAvailableDate: "2026-10-01",
        inputPartCode: "WIP-PAINT",
      },
      reasonCode: "CARRY_OVER_MATERIAL",
      trace: { fgRequiredDate: "2026-09-10" },
    },
  ],
};

const normalized = normalizeScenario({ data: scenarioFixture });
assert.strictEqual(normalized.id, "scenario-1");
assert.deepStrictEqual(
  normalized.items.map((item) => item.id),
  ["item-move", "item-new", "item-queue"],
  "scenario items must remain in stable sequence order",
);

const projected = projectRecommendationRows(matrixRows, scenarioFixture);
assert.strictEqual(
  projected[0].children[0].days["2026-09-01"].qty,
  0,
  "moved recommendation must leave its origin cell",
);
assert.strictEqual(
  projected[0].children[0].days["2026-09-08"].qty,
  231,
  "move and new proposal must be visible together in preview",
);
assert.strictEqual(
  projected[0].children[0].days["2026-09-08"].recommended,
  true,
);
assert.strictEqual(
  projected[0].children[0].days["2026-09-08"].recommendationOverload,
  true,
);
assert.deepStrictEqual(
  projected[0].children[0].days["2026-09-08"].recommendationItemIds,
  ["item-move", "item-new"],
  "target cell must expose selectable proposal identities to the page",
);
assert.strictEqual(
  projected[0].children[0].days["2026-09-01"].recommendationMoved,
  true,
);
assert.strictEqual(
  matrixRows[0].children[0].days["2026-09-01"].qty,
  40,
  "scenario preview must not mutate the official matrix",
);
assert.strictEqual(
  projected[0].children[0].monthlyProductionQty,
  231,
  "monthly production total must subtract origin and add every destination proposal",
);

assert.deepStrictEqual(
  selectRecommendationItems(scenarioFixture, {
    mode: "WORK_CENTER",
    workCenterIds: ["wc-inspection"],
  }).map((item) => item.id),
  ["item-move", "item-new"],
  "queue and exception items cannot be selected for Capacity Editor apply",
);
assert.deepStrictEqual(
  selectRecommendationItems(scenarioFixture, { mode: "EXISTING_TASKS" }).map((item) => item.id),
  ["item-move"],
  "existing-task auto allocation must exclude new remaining allocation proposals",
);
assert.deepStrictEqual(
  selectRecommendationItems(scenarioFixture, {
    mode: "ITEMS",
    itemIds: ["item-new", "item-queue"],
  }).map((item) => item.id),
  ["item-new"],
);

assert.deepStrictEqual(getScenarioSummary(scenarioFixture), {
  fgOnTimeCount: 1,
  fgLateCount: 0,
  newAllocationCount: 1,
  movedOrSplitCount: 1,
  overloadCellCount: 1,
  materialQueueQty: 23,
  carryOverQty: 23,
  selectableCount: 2,
  fgCoverageReady: false,
  fgUncoveredCount: 1,
  remainingAllocationQty: 23,
});
assert.deepStrictEqual(
  getAutoAllocationOptions({
    ...scenarioFixture,
    summary: {
      ...scenarioFixture.summary,
      fgCoverageReady: false,
      fgUncoveredCount: 1,
      remainingAllocationQty: 23,
    },
  }),
  [
    {
      mode: "ALL",
      existingTaskCount: 1,
      newTaskCount: 1,
      projectedRemainingQty: 23,
      fgCovered: false,
      ready: false,
    },
    {
      mode: "EXISTING_TASKS",
      existingTaskCount: 1,
      newTaskCount: 0,
      projectedRemainingQty: 214,
      fgCovered: false,
      ready: false,
    },
  ],
  "auto-allocation popup must show authoritative FG and remaining-allocation gates for both scopes",
);

const overSourceScenario = {
  items: [
    {
      id: "move-too-large",
      itemType: "MOVE_ALLOCATION",
      changeType: "MOVE_ALLOCATION",
      sourceAllocationId: "allocation-1",
      applyStatus: "PENDING",
      proposedValue: {
        qty: 100,
        targetDate: "2026-09-08",
        targetRowKey: "wc:inspection",
        targetChildKey: "wc:inspection:route-insp",
      },
    },
  ],
};
const sourceCappedProjection = projectRecommendationRows(matrixRows, overSourceScenario);
assert.strictEqual(
  sourceCappedProjection[0].children[0].days["2026-09-08"].qty,
  40,
  "preview must defensively cap a move to the quantity available on its source allocation",
);
assert.strictEqual(renderScenarioBadge(scenarioFixture), "READY · OVERLOAD");
assert.strictEqual(renderScenarioSource({ generationSource: "AI", modelProfileCode: "QWEN3-4B-CPU" }), "AI RECOMMENDATION · QWEN3-4B · OFFLINE");
assert.strictEqual(renderScenarioSource({ generationSource: "RULE_BASED_FALLBACK" }), "RULE-BASED FALLBACK");
const queueHtml = renderMaterialQueue(scenarioFixture.items);
assert.match(queueHtml, /23 PCS/);
assert.match(queueHtml, /01 Okt 2026/);
assert.match(queueHtml, /WIP-PAINT/);

console.log("MPP recommendation projection contract passed.");
