-- Widen only; existing integer values remain identical.
ALTER TABLE "Leave" ALTER COLUMN "totalDays" TYPE DOUBLE PRECISION USING "totalDays"::double precision;
ALTER TABLE "LeaveBalance" ALTER COLUMN "usedLeave" TYPE DOUBLE PRECISION USING "usedLeave"::double precision;
ALTER TABLE "LeaveBalance" ALTER COLUMN "usedSick" TYPE DOUBLE PRECISION USING "usedSick"::double precision;
