import { eq, and, like } from "drizzle-orm";
import { extname } from "path";
import { db } from "../../db/db.js";
import { files, fileChunks, attachments, tickets, users } from "../../db/schema/index.js";

const STAFF_ROLES = ["super_admin", "noc", "state_planner", "project_head"];

/**
 * Returns true when the requesting user may access the file.
 * Allowed if: staff role, OR is the ticket owner, OR is the assigned engineer.
 */
export async function canAccessFile(
  fileId: number,
  userId: string,
  role: string,
): Promise<boolean> {
  if (STAFF_ROLES.includes(role)) return true;

  // Allow users to access their own avatar
  const [avatarOwner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.avatarFileId, fileId), eq(users.id, userId)));
  if (avatarOwner) return true;

  const rows = await db
    .select({
      author: tickets.author,
      assignedEngineerId: tickets.assignedEngineerId,
    })
    .from(attachments)
    .innerJoin(tickets, eq(attachments.ticketId, tickets.id))
    .where(
      and(
        like(attachments.fileUrl, `%/file/${fileId}`),
        eq(attachments.deleted, false),
        eq(tickets.deleted, false),
      ),
    );

  return rows.some(
    (r) => r.author === userId || r.assignedEngineerId === userId,
  );
}

export interface UploadInput {
  filename: string;
  mimetype: string;
  data: Buffer;
}

export interface FileRecord {
  id: number;
  name: string | null;
  filename: string | null;
  mimeType: string | null;
}

/**
 * Persist an uploaded file (metadata + binary chunk) and return its id.
 */
export async function uploadFile(
  input: UploadInput,
): Promise<{ fileId: number }> {
  const ext = extname(input.filename) || ".bin";

  const [file] = await db
    .insert(files)
    .values({
      name: input.filename,
      altName: input.filename,
      filename: input.filename,
      mimeType: input.mimetype,
      ext,
      size: input.data.length,
      chunkCount: 1,
      storagePath: "",
    })
    .returning({ id: files.id });

  await db.insert(fileChunks).values({
    fileId: file.id,
    chunkIndex: 0,
    data: input.data,
  });

  return { fileId: file.id };
}

/**
 * Retrieve file metadata and binary data by id.
 * Throws a 404-shaped error if not found.
 */
export async function getFile(
  id: number,
): Promise<{ file: typeof files.$inferSelect; data: Buffer }> {
  const [file] = await db.select().from(files).where(eq(files.id, id));
  if (!file) throw { statusCode: 404, message: "File not found" };

  const [chunk] = await db
    .select()
    .from(fileChunks)
    .where(eq(fileChunks.fileId, id));
  if (!chunk) throw { statusCode: 404, message: "File data not found" };

  return { file, data: chunk.data as Buffer };
}
