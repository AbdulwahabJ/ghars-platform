import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Global, tenant-independent media used by the public Ghars landing page.
 * fileRef is either a bundled /assets/... path or a private-storage
 * /objects/landing-media/... path.
 */
export const landingMediaTable = pgTable(
  "landing_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titleAr: text("title_ar").notNull(),
    titleEn: text("title_en").notNull(),
    descriptionAr: text("description_ar"),
    descriptionEn: text("description_en"),
    mediaType: text("media_type").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    sourceType: text("source_type").notNull(),
    fileRef: text("file_ref").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("IDX_landing_media_type_active_order").on(
      table.mediaType,
      table.isActive,
      table.sortOrder,
    ),
    uniqueIndex("UQ_landing_media_object_file_ref")
      .on(table.fileRef)
      .where(sql`${table.sourceType} = 'OBJECT'`),
  ],
);

export type LandingMedia = typeof landingMediaTable.$inferSelect;