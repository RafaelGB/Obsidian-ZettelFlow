import { describe, it, expect } from "@jest/globals";
import * as state from "architecture/knowledge/state";
import type { StateProjection } from "architecture/knowledge/state";
import { buildHome, HomeModel, BuildHomeOptions } from "architecture/knowledge/home/home";
import { buildKnowledgeDashboard } from "architecture/knowledge/dashboard/knowledgeDashboard";
import { computeKnowledgeBalance } from "architecture/knowledge/balance/knowledgeBalance";
import { computeKnowledgeDebt, KnowledgeDebt } from "architecture/knowledge/debt/knowledgeDebt";
import { computeWeeklyReview } from "architecture/knowledge/review/weeklyReview";
import { findDiscoveries } from "architecture/knowledge/discovery/discoveries";
import { openQuestions } from "architecture/knowledge/questions/openQuestions";
import { proposeAnswers } from "architecture/knowledge/questions/proposeAnswers";
import { buildKnowledgeMap } from "architecture/knowledge/map/knowledgeMap";
import { conceptNeighbors } from "architecture/knowledge/traverse/conceptNeighbors";
import { buildEvidenceMap, EvidenceMap } from "architecture/knowledge/synthesis/evidenceMap";
import { buildHeatmapGrid } from "architecture/knowledge/journal/heatmap";
import { deriveOutline } from "architecture/knowledge/projects/deriveOutline";
import { deriveRecommendations, RECOMMENDATION_REASONS, COMMAND_ACTION_IDS } from "architecture/knowledge/state/recommendation";

describe("Knowledge State projection surface (#266, FR-1/FR-2, AC-5)", () => {
    it("re-exports the projection entry points by identity (the facade wraps nothing)", () => {
        expect(state.buildHome).toBe(buildHome);
        expect(state.buildKnowledgeDashboard).toBe(buildKnowledgeDashboard);
        expect(state.computeKnowledgeBalance).toBe(computeKnowledgeBalance);
        expect(state.computeKnowledgeDebt).toBe(computeKnowledgeDebt);
        expect(state.computeWeeklyReview).toBe(computeWeeklyReview);
        expect(state.findDiscoveries).toBe(findDiscoveries);
        expect(state.openQuestions).toBe(openQuestions);
        expect(state.proposeAnswers).toBe(proposeAnswers);
        expect(state.buildKnowledgeMap).toBe(buildKnowledgeMap);
        expect(state.conceptNeighbors).toBe(conceptNeighbors);
        expect(state.buildEvidenceMap).toBe(buildEvidenceMap);
        expect(state.buildHeatmapGrid).toBe(buildHeatmapGrid);
        expect(state.deriveOutline).toBe(deriveOutline);
    });

    it("re-exports the KnowledgeRecommendation primitive (#267)", () => {
        expect(state.deriveRecommendations).toBe(deriveRecommendations);
        expect(state.RECOMMENDATION_REASONS).toBe(RECOMMENDATION_REASONS);
        expect(state.COMMAND_ACTION_IDS).toBe(COMMAND_ACTION_IDS);
    });

    it("the entry points satisfy the StateProjection<Params, Result> contract (compile-only)", () => {
        const _debt: StateProjection<[], KnowledgeDebt> = computeKnowledgeDebt;
        const _home: StateProjection<[BuildHomeOptions], HomeModel> = buildHome;
        const _evidence: StateProjection<[string], EvidenceMap> = buildEvidenceMap;
        expect(typeof _debt).toBe("function");
        expect(typeof _home).toBe("function");
        expect(typeof _evidence).toBe("function");
    });
});
