-- 0057 · Three new ranks: supervisor, second-level supervisor, employee.
--
-- Nothing but the enum values. Postgres will not let a new enum value be USED in the same
-- transaction that added it, and the migration runner sends each file as one implicit transaction,
-- so everything that reads or writes these values lives in 0058.

alter type user_role add value if not exists 'supervisor';
alter type user_role add value if not exists 'supervisor_2';
alter type user_role add value if not exists 'employee';
