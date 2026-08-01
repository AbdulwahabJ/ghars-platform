-- Phase 2 seed: implant system options and lookup suggestions.
-- Idempotent (ON CONFLICT DO NOTHING) and purely additive — never deletes
-- or overwrites existing rows, so re-running is always safe.

INSERT INTO "implant_system_options" ("name", "sort_order") VALUES
  ('ROT / Root', 0),
  ('Bio', 1),
  ('Neodent', 2),
  ('Neoss', 3),
  ('Ora', 4),
  ('KOR', 5),
  ('Ritt', 6),
  ('MegaGen', 7),
  ('Mediden', 8),
  ('Other', 9)
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "lookup_options" ("category", "value", "sort_order") VALUES
  ('q_value', '0', 0),
  ('q_value', '5', 1),
  ('q_value', '10', 2),
  ('q_value', '15', 3),
  ('q_value', '20', 4),
  ('q_value', '25', 5),
  ('q_value', '30', 6),
  ('q_value', '35', 7),
  ('q_value', '40', 8),
  ('q_value', '45', 9),
  ('q_value', '50', 10),
  ('q_value', '70', 11),
  ('q_value', '75', 12),
  ('q_value', '80', 13),
  ('former_value', 'N', 0),
  ('former_value', 'Y', 1),
  ('former_value', 'M17', 2),
  ('former_value', 'M30', 3),
  ('former_value', 'MST', 4),
  ('former_value', 'ST', 5),
  ('former_value', 'MU15', 6),
  ('former_value', 'MU17', 7),
  ('former_value', 'MU30', 8),
  ('former_value', 'MUST', 9),
  ('graft_value', 'N', 0),
  ('graft_value', 'Y', 1),
  ('graft_value', 'ALLO', 2),
  ('procedure_tag', 'DIRECT', 0),
  ('procedure_tag', 'IMMED', 1),
  ('procedure_tag', 'FLAPLESS', 2),
  ('procedure_tag', 'Sas101', 3),
  ('procedure_tag', 'R.R', 4),
  ('procedure_tag', 'F', 5),
  ('procedure_tag', 'مؤقت', 6),
  ('procedure_tag', 'مخصص', 7)
ON CONFLICT ("category", "value") DO NOTHING;
