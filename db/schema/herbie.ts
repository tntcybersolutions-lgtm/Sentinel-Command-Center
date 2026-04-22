import { pgTable, varchar, text, jsonb, timestamp, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const herbieRuns = pgTable("herbie_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  bidId: varchar("bid_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("running"),
  screenContext: text("screen_context"),
  resultJson: jsonb("result_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("herbie_runs_bid_id_idx").on(table.bidId),
  index("herbie_runs_user_id_idx").on(table.userId),
]);

export const herbieMessages = pgTable("herbie_messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id", { length: 36 }).notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  content: text("content").notNull(),
  blocksJson: jsonb("blocks_json"),
  sourcesJson: jsonb("sources_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("herbie_messages_run_id_idx").on(table.runId),
]);

export const documentTextChunks = pgTable("document_text_chunks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id", { length: 36 }).notNull(),
  bidId: varchar("bid_id", { length: 36 }).notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("doc_text_chunks_document_id_idx").on(table.documentId),
  index("doc_text_chunks_bid_id_idx").on(table.bidId),
]);

export const documentEmbeddings = pgTable("document_embeddings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  chunkId: varchar("chunk_id", { length: 36 }).notNull(),
  documentId: varchar("document_id", { length: 36 }).notNull(),
  bidId: varchar("bid_id", { length: 36 }).notNull(),
  embedding: jsonb("embedding").notNull(),
  model: varchar("model", { length: 64 }).notNull().default("text-embedding-ada-002"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("doc_embeddings_chunk_id_idx").on(table.chunkId),
  index("doc_embeddings_bid_id_idx").on(table.bidId),
]);
