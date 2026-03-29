-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameZh" TEXT NOT NULL,
    "nameEn" TEXT,
    "focusLabel" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "topic_stages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "topic_stages_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "papers" (
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
    "pdfUrl" TEXT,
    "pdfPath" TEXT,
    "citationCount" INTEGER,
    "coverPath" TEXT,
    "figurePaths" TEXT NOT NULL,
    "tablePaths" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "tags" TEXT NOT NULL,
    "contentMode" TEXT NOT NULL DEFAULT 'editorial',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "papers_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "paper_sections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paperId" TEXT NOT NULL,
    "sourceSectionTitle" TEXT NOT NULL,
    "editorialTitle" TEXT NOT NULL,
    "paragraphs" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "paper_sections_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "research_nodes" (
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
    "primaryPaperId" TEXT NOT NULL,
    "fullContent" TEXT,
    CONSTRAINT "research_nodes_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "research_nodes_primaryPaperId_fkey" FOREIGN KEY ("primaryPaperId") REFERENCES "papers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "node_papers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "node_papers_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "research_nodes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "figures" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paperId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "caption" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "imagePath" TEXT NOT NULL,
    "analysis" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "figures_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paperId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "caption" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "headers" TEXT NOT NULL,
    "rows" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tables_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "formulas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paperId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "latex" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "formulas_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "research_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicIds" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'full',
    "status" TEXT NOT NULL DEFAULT 'running',
    "currentStage" TEXT,
    "progress" REAL NOT NULL DEFAULT 0,
    "logs" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "error" TEXT
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "model_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "baseUrl" TEXT,
    "parameters" TEXT NOT NULL,
    "capabilities" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "task_mappings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskName" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "fallbackModelId" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "node_papers_nodeId_paperId_key" ON "node_papers"("nodeId", "paperId");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "model_configs_modelId_key" ON "model_configs"("modelId");

-- CreateIndex
CREATE UNIQUE INDEX "task_mappings_taskName_key" ON "task_mappings"("taskName");
