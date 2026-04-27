-- AlterTable
ALTER TABLE "formulas" ADD COLUMN "imagePath" TEXT;

-- AlterTable
ALTER TABLE "topic_stages" ADD COLUMN "descriptionEn" TEXT;
ALTER TABLE "topic_stages" ADD COLUMN "nameEn" TEXT;

-- CreateTable
CREATE TABLE "figure_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paperId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "subFigures" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "figure_groups_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "model_config_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "configJson" TEXT NOT NULL,
    "actor" TEXT,
    "diffSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "paper_candidate_pool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "paperId" TEXT,
    "sourcePaperId" TEXT,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "published" DATETIME,
    "summary" TEXT,
    "arxivUrl" TEXT,
    "pdfUrl" TEXT,
    "openAlexId" TEXT,
    "semanticScholarId" TEXT,
    "branchId" TEXT,
    "stageIndex" INTEGER,
    "stageLabel" TEXT,
    "stageStartDate" DATETIME,
    "stageEndDateExclusive" DATETIME,
    "recallRunId" TEXT,
    "querySetHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "candidateType" TEXT,
    "discoverySource" TEXT,
    "discoveryChannels" TEXT,
    "queryHits" TEXT,
    "downloadStatus" TEXT NOT NULL DEFAULT 'pending',
    "downloadError" TEXT,
    "downloadAttemptedAt" DATETIME,
    "groundedAt" DATETIME,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "hasStructuredEvidence" BOOLEAN NOT NULL DEFAULT false,
    "retentionTier" TEXT NOT NULL DEFAULT 'compact',
    "retentionExpiresAt" DATETIME,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rejectReason" TEXT,
    "rejectFilter" TEXT,
    "rejectScore" REAL,
    "snowballParentId" TEXT,
    "snowballDepth" INTEGER,
    "snowballType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "reviewDecision" TEXT,
    "reviewComment" TEXT,
    CONSTRAINT "paper_candidate_pool_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "research_pipeline_states" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "research_world_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "world" TEXT NOT NULL,
    "fingerprint" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "topic_guidance_ledgers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "directives" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "topic_session_memories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "summary" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "zotero_config" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "userId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "username" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "extraction_stats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paperId" TEXT NOT NULL,
    "topicId" TEXT,
    "extractionMethod" TEXT NOT NULL,
    "figureCount" INTEGER NOT NULL DEFAULT 0,
    "figureAvgConf" REAL,
    "figureMethods" TEXT NOT NULL DEFAULT '{}',
    "tableCount" INTEGER NOT NULL DEFAULT 0,
    "tableAvgConf" REAL,
    "tableMethods" TEXT NOT NULL DEFAULT '{}',
    "formulaCount" INTEGER NOT NULL DEFAULT 0,
    "formulaAvgConf" REAL,
    "formulaMethods" TEXT NOT NULL DEFAULT '{}',
    "qualityWarnings" TEXT NOT NULL DEFAULT '[]',
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "extractedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "extraction_stats_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_node_papers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "node_papers_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "node_papers_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "research_nodes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_node_papers" ("id", "nodeId", "order", "paperId") SELECT "id", "nodeId", "order", "paperId" FROM "node_papers";
DROP TABLE "node_papers";
ALTER TABLE "new_node_papers" RENAME TO "node_papers";
CREATE INDEX "node_papers_paperId_idx" ON "node_papers"("paperId");
CREATE INDEX "node_papers_nodeId_idx" ON "node_papers"("nodeId");
CREATE UNIQUE INDEX "node_papers_nodeId_paperId_key" ON "node_papers"("nodeId", "paperId");
CREATE TABLE "new_papers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleZh" TEXT NOT NULL,
    "titleEn" TEXT,
    "authors" TEXT NOT NULL,
    "published" DATETIME NOT NULL,
    "summary" TEXT NOT NULL,
    "explanation" TEXT,
    "arxivUrl" TEXT,
    "openAlexId" TEXT,
    "pdfUrl" TEXT,
    "pdfPath" TEXT,
    "citationCount" INTEGER,
    "coverPath" TEXT,
    "figurePaths" TEXT NOT NULL DEFAULT '',
    "tablePaths" TEXT NOT NULL DEFAULT '',
    "formulaPaths" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "tags" TEXT NOT NULL,
    "contentMode" TEXT NOT NULL DEFAULT 'editorial',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "papers_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_papers" ("arxivUrl", "authors", "citationCount", "contentMode", "coverPath", "createdAt", "explanation", "figurePaths", "id", "pdfPath", "pdfUrl", "published", "status", "summary", "tablePaths", "tags", "title", "titleEn", "titleZh", "topicId", "updatedAt") SELECT "arxivUrl", "authors", "citationCount", "contentMode", "coverPath", "createdAt", "explanation", "figurePaths", "id", "pdfPath", "pdfUrl", "published", "status", "summary", "tablePaths", "tags", "title", "titleEn", "titleZh", "topicId", "updatedAt" FROM "papers";
DROP TABLE "papers";
ALTER TABLE "new_papers" RENAME TO "papers";
CREATE INDEX "papers_topicId_idx" ON "papers"("topicId");
CREATE INDEX "papers_status_idx" ON "papers"("status");
CREATE INDEX "papers_published_idx" ON "papers"("published");
CREATE TABLE "new_research_nodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "stageIndex" INTEGER NOT NULL,
    "nodeLabel" TEXT NOT NULL,
    "nodeSubtitle" TEXT,
    "nodeSummary" TEXT NOT NULL,
    "nodeExplanation" TEXT,
    "nodeCoverImage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'provisional',
    "isMergeNode" BOOLEAN NOT NULL DEFAULT false,
    "provisional" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "primaryPaperId" TEXT,
    "fullContent" TEXT,
    "fullArticleFlow" TEXT,
    "editorialPromptHash" TEXT,
    CONSTRAINT "research_nodes_primaryPaperId_fkey" FOREIGN KEY ("primaryPaperId") REFERENCES "papers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "research_nodes_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_research_nodes" ("createdAt", "fullContent", "id", "isMergeNode", "nodeCoverImage", "nodeExplanation", "nodeLabel", "nodeSubtitle", "nodeSummary", "primaryPaperId", "provisional", "stageIndex", "status", "topicId", "updatedAt") SELECT "createdAt", "fullContent", "id", "isMergeNode", "nodeCoverImage", "nodeExplanation", "nodeLabel", "nodeSubtitle", "nodeSummary", "primaryPaperId", "provisional", "stageIndex", "status", "topicId", "updatedAt" FROM "research_nodes";
DROP TABLE "research_nodes";
ALTER TABLE "new_research_nodes" RENAME TO "research_nodes";
CREATE INDEX "research_nodes_stageIndex_idx" ON "research_nodes"("stageIndex");
CREATE INDEX "research_nodes_topicId_idx" ON "research_nodes"("topicId");
CREATE TABLE "new_task_mappings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskName" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "fallbackModelId" TEXT,
    CONSTRAINT "task_mappings_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "model_configs" ("modelId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_task_mappings" ("fallbackModelId", "id", "modelId", "taskName") SELECT "fallbackModelId", "id", "modelId", "taskName" FROM "task_mappings";
DROP TABLE "task_mappings";
ALTER TABLE "new_task_mappings" RENAME TO "task_mappings";
CREATE UNIQUE INDEX "task_mappings_taskName_key" ON "task_mappings"("taskName");
CREATE TABLE "new_topics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameZh" TEXT NOT NULL,
    "nameEn" TEXT,
    "focusLabel" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "language" TEXT NOT NULL DEFAULT 'zh',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "exportedToZoteroAt" DATETIME,
    "zoteroCollectionKey" TEXT
);
INSERT INTO "new_topics" ("createdAt", "description", "focusLabel", "id", "nameEn", "nameZh", "status", "summary", "updatedAt") SELECT "createdAt", "description", "focusLabel", "id", "nameEn", "nameZh", "status", "summary", "updatedAt" FROM "topics";
DROP TABLE "topics";
ALTER TABLE "new_topics" RENAME TO "topics";
CREATE INDEX "topics_language_idx" ON "topics"("language");
CREATE INDEX "topics_status_idx" ON "topics"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "figure_groups_paperId_idx" ON "figure_groups"("paperId");

-- CreateIndex
CREATE UNIQUE INDEX "model_config_history_version_key" ON "model_config_history"("version");

-- CreateIndex
CREATE INDEX "model_config_history_createdAt_idx" ON "model_config_history"("createdAt");

-- CreateIndex
CREATE INDEX "paper_candidate_pool_createdAt_idx" ON "paper_candidate_pool"("createdAt");

-- CreateIndex
CREATE INDEX "paper_candidate_pool_discoverySource_idx" ON "paper_candidate_pool"("discoverySource");

-- CreateIndex
CREATE INDEX "paper_candidate_pool_confidence_idx" ON "paper_candidate_pool"("confidence");

-- CreateIndex
CREATE INDEX "paper_candidate_pool_retentionExpiresAt_idx" ON "paper_candidate_pool"("retentionExpiresAt");

-- CreateIndex
CREATE INDEX "paper_candidate_pool_status_idx" ON "paper_candidate_pool"("status");

-- CreateIndex
CREATE INDEX "paper_candidate_pool_topicId_stageIndex_idx" ON "paper_candidate_pool"("topicId", "stageIndex");

-- CreateIndex
CREATE INDEX "paper_candidate_pool_topicId_stageIndex_status_idx" ON "paper_candidate_pool"("topicId", "stageIndex", "status");

-- CreateIndex
CREATE INDEX "paper_candidate_pool_topicId_idx" ON "paper_candidate_pool"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "research_pipeline_states_topicId_key" ON "research_pipeline_states"("topicId");

-- CreateIndex
CREATE INDEX "research_pipeline_states_topicId_idx" ON "research_pipeline_states"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "research_world_snapshots_topicId_key" ON "research_world_snapshots"("topicId");

-- CreateIndex
CREATE INDEX "research_world_snapshots_topicId_idx" ON "research_world_snapshots"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "topic_guidance_ledgers_topicId_key" ON "topic_guidance_ledgers"("topicId");

-- CreateIndex
CREATE INDEX "topic_guidance_ledgers_topicId_idx" ON "topic_guidance_ledgers"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "topic_session_memories_topicId_key" ON "topic_session_memories"("topicId");

-- CreateIndex
CREATE INDEX "topic_session_memories_topicId_idx" ON "topic_session_memories"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "extraction_stats_paperId_key" ON "extraction_stats"("paperId");

-- CreateIndex
CREATE INDEX "extraction_stats_paperId_idx" ON "extraction_stats"("paperId");

-- CreateIndex
CREATE INDEX "extraction_stats_topicId_idx" ON "extraction_stats"("topicId");

-- CreateIndex
CREATE INDEX "extraction_stats_extractedAt_idx" ON "extraction_stats"("extractedAt");

-- CreateIndex
CREATE INDEX "figures_paperId_idx" ON "figures"("paperId");

-- CreateIndex
CREATE INDEX "formulas_paperId_idx" ON "formulas"("paperId");

-- CreateIndex
CREATE INDEX "model_configs_provider_idx" ON "model_configs"("provider");

-- CreateIndex
CREATE INDEX "paper_sections_paperId_idx" ON "paper_sections"("paperId");

-- CreateIndex
CREATE INDEX "research_sessions_status_idx" ON "research_sessions"("status");

-- CreateIndex
CREATE INDEX "tables_paperId_idx" ON "tables"("paperId");

-- CreateIndex
CREATE INDEX "topic_stages_topicId_idx" ON "topic_stages"("topicId");

