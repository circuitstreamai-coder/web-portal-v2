import {
  integer,
  serial,
  varchar,
  boolean,
  json,
  timestamp,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { ticketSchema } from "../ticket";

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const files = ticketSchema.table("files", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  altName: varchar("alt_name", { length: 255 }).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 255 }).notNull(),
  ext: varchar("ext", { length: 10 }).notNull(),
  size: integer("size").notNull(),
  chunkCount: integer("chunk_count").notNull(),
  storagePath: varchar("storage_path", { length: 255 }).notNull(),
  width: integer("width"),
  height: integer("height"),
  exif: json("exif").default({}),
  tags: json("tags").default({}),
  usageType: varchar("usage_type", { length: 255 }).default("general"),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const fileChunks = ticketSchema.table("file_chunks", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id")
    .notNull()
    .references(() => files.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  chunkIndex: integer("chunk_index").notNull(),
  data: bytea("data").notNull(),
});

export const filesRelations = relations(files, ({ many }) => ({
  chunks: many(fileChunks),
}));

export const fileChunksRelations = relations(fileChunks, ({ one }) => ({
  file: one(files, { fields: [fileChunks.fileId], references: [files.id] }),
}));
