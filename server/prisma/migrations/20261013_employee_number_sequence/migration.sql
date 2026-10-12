-- PostgreSQL allocation is global across stores. Do not renumber historical rows
-- or reuse a number consumed by a deleted employee or rolled-back transaction.
CREATE SEQUENCE IF NOT EXISTS employee_number_sequence
  START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 999 CACHE 1 NO CYCLE;
SELECT setval('employee_number_sequence',
  GREATEST(1, sequence.last_value, staff.maximum),
  sequence.is_called OR staff.maximum > 0)
FROM employee_number_sequence AS sequence
CROSS JOIN (
  SELECT COALESCE(MAX(substring("employeeNumber" FROM 4)::bigint), 0) AS maximum
  FROM "Staff" WHERE "employeeNumber" ~ '^EMP[0-9]{3}$'
) AS staff;
