-- Drizzle generated this migration from the current schema baseline. The
-- tables and columns in that diff already exist through migrations 0014-0021;
-- this forward migration only adds the new tenant-scoped template identity.
CREATE UNIQUE INDEX "UQ_whatsapp_templates_tenant_name"
  ON "whatsapp_templates" USING btree ("tenant_id", "name");