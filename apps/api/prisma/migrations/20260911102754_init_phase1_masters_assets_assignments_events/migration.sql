-- CreateEnum
CREATE TYPE "location_type" AS ENUM ('OFFICE', 'STORE_ROOM', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "tracking_mode" AS ENUM ('SERIALIZED', 'BULK');

-- CreateEnum
CREATE TYPE "employee_status" AS ENUM ('ACTIVE', 'EXITED');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'STORE_KEEPER', 'VIEWER');

-- CreateEnum
CREATE TYPE "asset_status" AS ENUM ('IN_STOCK', 'ASSIGNED', 'RETURNED_PENDING_CHECK', 'IN_REPAIR', 'RETIRED', 'LOST');

-- CreateEnum
CREATE TYPE "condition_grade" AS ENUM ('NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "assignment_status" AS ENUM ('OPEN', 'CLOSED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "asset_event_type" AS ENUM ('PURCHASED', 'STOCK_IN', 'ISSUED', 'RETURNED', 'INSPECTED', 'SENT_FOR_REPAIR', 'REPAIR_COMPLETED', 'TRANSFERRED', 'MARKED_LOST', 'WRITTEN_OFF', 'RETIRED', 'NOTE_ADDED');

-- CreateEnum
CREATE TYPE "event_reference_type" AS ENUM ('ASSIGNMENT', 'REPAIR_TICKET', 'PURCHASE_ITEM');

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by" TEXT,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "location_type" NOT NULL,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "address" TEXT,
    "is_service_centre" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tracking_mode" "tracking_mode" NOT NULL,
    "requires_serial" BOOLEAN NOT NULL DEFAULT true,
    "default_useful_life_months" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "asset_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_model" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "default_warranty_months" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "asset_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" TEXT NOT NULL,
    "employee_code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "department" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "date_joined" DATE NOT NULL,
    "date_exited" DATE,
    "status" "employee_status" NOT NULL DEFAULT 'ACTIVE',
    "reporting_manager_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
    "id" TEXT NOT NULL,
    "asset_tag" TEXT NOT NULL,
    "serial_number" TEXT,
    "model_id" TEXT NOT NULL,
    "status" "asset_status" NOT NULL DEFAULT 'IN_STOCK',
    "condition_grade" "condition_grade" NOT NULL,
    "location_id" TEXT NOT NULL,
    "purchase_item_id" TEXT,
    "warranty_expires_on" DATE,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "issued_on" DATE NOT NULL,
    "issued_by" TEXT NOT NULL,
    "expected_return_on" DATE,
    "condition_out" "condition_grade" NOT NULL,
    "issue_remarks" TEXT,
    "returned_on" DATE,
    "closed_on" DATE,
    "received_by" TEXT,
    "condition_in" "condition_grade",
    "return_remarks" TEXT,
    "status" "assignment_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_event" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "event_type" "asset_event_type" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performed_by" TEXT NOT NULL,
    "from_status" "asset_status",
    "to_status" "asset_status",
    "employee_id" TEXT,
    "location_id" TEXT,
    "reference_type" "event_reference_type",
    "reference_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE INDEX "app_user_is_active_idx" ON "app_user"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_user_id_expires_at_idx" ON "refresh_token"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "location_is_active_idx" ON "location"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "location_name_city_key" ON "location"("name", "city");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_name_key" ON "vendor"("name");

-- CreateIndex
CREATE INDEX "vendor_is_active_idx" ON "vendor"("is_active");

-- CreateIndex
CREATE INDEX "vendor_is_service_centre_idx" ON "vendor"("is_service_centre");

-- CreateIndex
CREATE UNIQUE INDEX "asset_category_name_key" ON "asset_category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "asset_category_code_key" ON "asset_category"("code");

-- CreateIndex
CREATE INDEX "asset_category_is_active_idx" ON "asset_category"("is_active");

-- CreateIndex
CREATE INDEX "asset_model_category_id_idx" ON "asset_model"("category_id");

-- CreateIndex
CREATE INDEX "asset_model_is_active_idx" ON "asset_model"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "asset_model_category_id_manufacturer_model_name_key" ON "asset_model"("category_id", "manufacturer", "model_name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_employee_code_key" ON "employee"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "employee_email_key" ON "employee"("email");

-- CreateIndex
CREATE INDEX "employee_status_idx" ON "employee"("status");

-- CreateIndex
CREATE INDEX "employee_department_idx" ON "employee"("department");

-- CreateIndex
CREATE INDEX "employee_location_id_idx" ON "employee"("location_id");

-- CreateIndex
CREATE INDEX "employee_last_name_first_name_idx" ON "employee"("last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "asset_asset_tag_key" ON "asset"("asset_tag");

-- CreateIndex
CREATE UNIQUE INDEX "asset_serial_number_key" ON "asset"("serial_number");

-- CreateIndex
CREATE INDEX "asset_status_idx" ON "asset"("status");

-- CreateIndex
CREATE INDEX "asset_model_id_idx" ON "asset"("model_id");

-- CreateIndex
CREATE INDEX "asset_location_id_idx" ON "asset"("location_id");

-- CreateIndex
CREATE INDEX "asset_condition_grade_idx" ON "asset"("condition_grade");

-- CreateIndex
CREATE INDEX "asset_warranty_expires_on_idx" ON "asset"("warranty_expires_on");

-- CreateIndex
CREATE INDEX "asset_status_location_id_idx" ON "asset"("status", "location_id");

-- CreateIndex
CREATE INDEX "assignment_asset_id_issued_on_idx" ON "assignment"("asset_id", "issued_on" DESC);

-- CreateIndex
CREATE INDEX "assignment_employee_id_status_idx" ON "assignment"("employee_id", "status");

-- CreateIndex
CREATE INDEX "assignment_status_idx" ON "assignment"("status");

-- CreateIndex
CREATE INDEX "assignment_expected_return_on_idx" ON "assignment"("expected_return_on");

-- CreateIndex
CREATE INDEX "asset_event_asset_id_occurred_at_idx" ON "asset_event"("asset_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "asset_event_event_type_occurred_at_idx" ON "asset_event"("event_type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "asset_event_employee_id_occurred_at_idx" ON "asset_event"("employee_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "asset_event_reference_type_reference_id_idx" ON "asset_event"("reference_type", "reference_id");

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_model" ADD CONSTRAINT "asset_model_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "asset_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_reporting_manager_id_fkey" FOREIGN KEY ("reporting_manager_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "asset_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_event" ADD CONSTRAINT "asset_event_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_event" ADD CONSTRAINT "asset_event_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_event" ADD CONSTRAINT "asset_event_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_event" ADD CONSTRAINT "asset_event_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written additions (CLAUDE.md §2.3, §2.4). Prisma schema language cannot
-- express partial indexes or table-level rules, so they live here.
-- ---------------------------------------------------------------------------

-- §2.4 — at most one OPEN assignment per asset, enforced by the database.
-- Two concurrent issue requests can both pass an application-level SELECT
-- check; the second INSERT fails here and is translated into a 409.
CREATE UNIQUE INDEX "assignment_one_open_per_asset"
  ON "assignment" ("asset_id")
  WHERE "status" = 'OPEN';

-- §2.3 — asset_event is append-only. Application code never issues an UPDATE
-- or DELETE against it, and this rule means a stray query cannot either.
CREATE OR REPLACE FUNCTION "asset_event_is_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'asset_event is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "asset_event_no_update"
  BEFORE UPDATE ON "asset_event"
  FOR EACH ROW EXECUTE FUNCTION "asset_event_is_append_only"();

CREATE TRIGGER "asset_event_no_delete"
  BEFORE DELETE ON "asset_event"
  FOR EACH ROW EXECUTE FUNCTION "asset_event_is_append_only"();

-- A closed assignment must record when it closed; an open one must not.
ALTER TABLE "assignment"
  ADD CONSTRAINT "assignment_closed_has_closed_on"
  CHECK (
    ("status" = 'OPEN' AND "closed_on" IS NULL)
    OR ("status" <> 'OPEN' AND "closed_on" IS NOT NULL)
  );

-- A physical return records the condition it came back in (CLAUDE.md §7.3).
-- A write-off has no physical return, so neither field is set.
ALTER TABLE "assignment"
  ADD CONSTRAINT "assignment_returned_has_condition_in"
  CHECK (
    ("returned_on" IS NULL AND "condition_in" IS NULL)
    OR ("returned_on" IS NOT NULL AND "condition_in" IS NOT NULL)
  );

-- An exited employee has an exit date, and vice versa (CLAUDE.md §2.2).
ALTER TABLE "employee"
  ADD CONSTRAINT "employee_exited_has_date"
  CHECK (
    ("status" = 'ACTIVE' AND "date_exited" IS NULL)
    OR ("status" = 'EXITED' AND "date_exited" IS NOT NULL)
  );

-- A BULK category is counted, not serialised, so it can never require serials.
ALTER TABLE "asset_category"
  ADD CONSTRAINT "asset_category_bulk_needs_no_serial"
  CHECK (NOT ("tracking_mode" = 'BULK' AND "requires_serial" = true));
