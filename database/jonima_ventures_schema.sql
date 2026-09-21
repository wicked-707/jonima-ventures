
-- ============================================================
-- JONIMA VENTURES
-- COMPLETE POSTGRESQL DATABASE SCHEMA
-- Version: 1.0
-- Purpose: Lipa Mdogo Mdogo phone-financing management system
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================
-- 01. COMMON FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 02. COMPANY / SYSTEM CONFIGURATION
-- ============================================================

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    legal_name VARCHAR(200),
    registration_number VARCHAR(100),
    phone VARCHAR(30),
    email CITEXT,
    address TEXT,
    county VARCHAR(100),
    town VARCHAR(100),
    logo_url TEXT,
    currency_code CHAR(3) NOT NULL DEFAULT 'KES',
    timezone VARCHAR(100) NOT NULL DEFAULT 'Africa/Nairobi',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    setting_key VARCHAR(150) NOT NULL,
    setting_value JSONB NOT NULL,
    description TEXT,
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, setting_key)
);

CREATE TABLE number_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    sequence_type VARCHAR(50) NOT NULL,
    prefix VARCHAR(30) NOT NULL,
    current_value BIGINT NOT NULL DEFAULT 0 CHECK (current_value >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, sequence_type)
);

-- ============================================================
-- 03. AUTHENTICATION / AUTHORIZATION
-- ============================================================

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_system_role BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    user_number VARCHAR(40) NOT NULL,
    email CITEXT,
    phone VARCHAR(30) NOT NULL,
    password_hash TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN (
            'PENDING','UNDER_REVIEW','APPROVED','ACTIVE',
            'SUSPENDED','INACTIVE','REJECTED'
        )),
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, user_number),
    UNIQUE (company_id, email),
    UNIQUE (company_id, phone)
);

CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','INACTIVE')),
    CHECK (effective_until IS NULL OR effective_until > effective_from)
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT,
    ip_address INET,
    user_agent TEXT,
    device_label VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT
);

CREATE TABLE login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    login_identifier VARCHAR(200) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    failure_reason VARCHAR(150),
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 04. ORGANIZATION / REGIONS / LOCATIONS
-- ============================================================

CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name VARCHAR(120) NOT NULL,
    code VARCHAR(30) NOT NULL,
    description TEXT,
    primary_location VARCHAR(150),
    status VARCHAR(20) NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('PLANNED','ACTIVE','SUSPENDED','CLOSED')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code),
    UNIQUE (company_id, name)
);

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    location_type VARCHAR(40) NOT NULL
        CHECK (location_type IN (
            'HEAD_OFFICE','WAREHOUSE','BRANCH','AGENT_POINT',
            'SERVICE_POINT','OTHER'
        )),
    county VARCHAR(100),
    sub_county VARCHAR(100),
    town VARCHAR(100),
    area VARCHAR(150),
    address TEXT,
    landmark TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
    location_id UUID REFERENCES locations(id) ON DELETE RESTRICT,
    supervisor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assignment_type VARCHAR(40) NOT NULL
        CHECK (assignment_type IN (
            'REGIONAL_ADMIN','AGENT','CUSTOMER_SERVICE','OTHER'
        )),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','ENDED')),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (effective_until IS NULL OR effective_until > effective_from)
);

-- ============================================================
-- 05. USER PROFILE / KYC / DOCUMENTS / NEXT OF KIN
-- ============================================================

CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(30),
    national_id VARCHAR(50),
    county VARCHAR(100),
    sub_county VARCHAR(100),
    town VARCHAR(100),
    area VARCHAR(150),
    residential_address TEXT,
    landmark TEXT,
    service_location TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    document_type VARCHAR(50) NOT NULL
        CHECK (document_type IN (
            'PASSPORT_PHOTO','ID_FRONT','ID_BACK','PASSPORT',
            'ADDRESS_PROOF','OTHER'
        )),
    storage_bucket VARCHAR(150) NOT NULL,
    storage_path TEXT NOT NULL,
    original_filename TEXT,
    mime_type VARCHAR(100),
    file_size_bytes BIGINT CHECK (file_size_bytes >= 0),
    document_hash VARCHAR(128),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','UNDER_REVIEW','VERIFIED','REJECTED','REPLACED')),
    rejection_reason TEXT,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ
);

CREATE TABLE next_of_kin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    full_name VARCHAR(200) NOT NULL,
    relationship VARCHAR(80) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email CITEXT,
    national_id VARCHAR(50),
    county VARCHAR(100),
    sub_county VARCHAR(100),
    town VARCHAR(100),
    area VARCHAR(150),
    residential_address TEXT,
    landmark TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE next_of_kin_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    next_of_kin_id UUID NOT NULL REFERENCES next_of_kin(id) ON DELETE RESTRICT,
    document_type VARCHAR(50) NOT NULL
        CHECK (document_type IN (
            'PASSPORT_PHOTO','ID_FRONT','ID_BACK','PASSPORT',
            'ADDRESS_PROOF','OTHER'
        )),
    storage_bucket VARCHAR(150) NOT NULL,
    storage_path TEXT NOT NULL,
    original_filename TEXT,
    mime_type VARCHAR(100),
    file_size_bytes BIGINT CHECK (file_size_bytes >= 0),
    document_hash VARCHAR(128),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','UNDER_REVIEW','VERIFIED','REJECTED','REPLACED')),
    rejection_reason TEXT,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ
);

-- ============================================================
-- 06. SUPPLIERS / PRODUCTS / PRICING
-- ============================================================

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    supplier_number VARCHAR(40) NOT NULL,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(30),
    email CITEXT,
    address TEXT,
    contact_person VARCHAR(150),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','INACTIVE')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, supplier_number)
);

CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, name)
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    product_code VARCHAR(50) NOT NULL,
    model VARCHAR(150) NOT NULL,
    ram_gb NUMERIC(6,2),
    storage_gb NUMERIC(8,2),
    color VARCHAR(80),
    product_type VARCHAR(50) NOT NULL DEFAULT 'SMARTPHONE',
    description TEXT,
    default_cash_price NUMERIC(14,2) NOT NULL CHECK (default_cash_price >= 0),
    default_installment_price NUMERIC(14,2) CHECK (default_installment_price >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','INACTIVE','DISCONTINUED')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, product_code)
);

CREATE TABLE product_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    price_type VARCHAR(30) NOT NULL
        CHECK (price_type IN ('CASH','INSTALLMENT','DOWN_PAYMENT','OTHER')),
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (effective_until IS NULL OR effective_until > effective_from)
);

-- ============================================================
-- 07. STOCK LOCATIONS / DEVICES / INVENTORY
-- ============================================================

CREATE TABLE stock_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
    location_id UUID REFERENCES locations(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    location_type VARCHAR(40) NOT NULL
        CHECK (location_type IN (
            'CENTRAL_WAREHOUSE','REGIONAL_STOCK','AGENT_STOCK','CUSTOMER'
        )),
    custodian_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    device_number VARCHAR(50) NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    imei1 VARCHAR(30) NOT NULL,
    imei2 VARCHAR(30),
    serial_number VARCHAR(100),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_price NUMERIC(14,2) CHECK (purchase_price >= 0),
    cash_price NUMERIC(14,2) CHECK (cash_price >= 0),
    installment_price NUMERIC(14,2) CHECK (installment_price >= 0),
    current_stock_location_id UUID REFERENCES stock_locations(id) ON DELETE RESTRICT,
    current_custodian_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(40) NOT NULL DEFAULT 'RECEIVED'
        CHECK (status IN (
            'RECEIVED','UNDER_VERIFICATION','AVAILABLE','RESERVED',
            'ASSIGNED','FINANCED','ACTIVE_INSTALLMENT','FULLY_PAID',
            'RETURNED','REPOSSESSED','DAMAGED','LOST','TRANSFERRED'
        )),
    condition_status VARCHAR(30) DEFAULT 'NEW'
        CHECK (condition_status IN ('NEW','GOOD','USED','DAMAGED')),
    received_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    sold_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, device_number),
    UNIQUE (company_id, imei1),
    UNIQUE (company_id, imei2)
);

CREATE TABLE stock_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    receipt_number VARCHAR(50) NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    destination_stock_location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
    expected_quantity INTEGER CHECK (expected_quantity >= 0),
    received_quantity INTEGER CHECK (received_quantity >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED'
        CHECK (status IN ('RECEIVED','UNDER_VERIFICATION','VERIFIED','DISCREPANCY','CANCELLED')),
    delivery_reference VARCHAR(100),
    notes TEXT,
    received_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, receipt_number)
);

CREATE TABLE stock_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_receipt_id UUID NOT NULL REFERENCES stock_receipts(id) ON DELETE RESTRICT,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    expected BOOLEAN NOT NULL DEFAULT TRUE,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    discrepancy_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (stock_receipt_id, device_id)
);

CREATE TABLE stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    transfer_number VARCHAR(50) NOT NULL,
    from_stock_location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
    to_stock_location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL DEFAULT 'CREATED'
        CHECK (status IN (
            'CREATED','DISPATCHED','IN_TRANSIT','RECEIVED',
            'DISCREPANCY','CANCELLED'
        )),
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    dispatched_by UUID REFERENCES users(id) ON DELETE SET NULL,
    received_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dispatched_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    UNIQUE (company_id, transfer_number),
    CHECK (from_stock_location_id <> to_stock_location_id)
);

CREATE TABLE stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE RESTRICT,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','DISPATCHED','RECEIVED','MISSING','DAMAGED')),
    received_condition VARCHAR(30),
    discrepancy_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (stock_transfer_id, device_id)
);

CREATE TABLE device_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    loan_application_id UUID,
    loan_id UUID,
    reserved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','RELEASED','EXPIRED','CONVERTED','CANCELLED')),
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    reason TEXT
);

CREATE TABLE device_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    customer_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    loan_id UUID,
    assignment_type VARCHAR(30) NOT NULL
        CHECK (assignment_type IN ('AGENT','CUSTOMER','OTHER')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','ENDED')),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

CREATE TABLE device_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    from_stock_location_id UUID REFERENCES stock_locations(id) ON DELETE RESTRICT,
    to_stock_location_id UUID REFERENCES stock_locations(id) ON DELETE RESTRICT,
    from_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    to_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    movement_type VARCHAR(40) NOT NULL
        CHECK (movement_type IN (
            'RECEIVED','TRANSFERRED','ASSIGNED','RELEASED',
            'RETURNED','REPOSSESSED','DAMAGED','LOST','RECOVERED'
        )),
    reference_type VARCHAR(50),
    reference_id UUID,
    reason TEXT,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE device_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    inspection_type VARCHAR(40) NOT NULL
        CHECK (inspection_type IN ('RECEIVING','TRANSFER','RELEASE','RETURN','REPOSSESSION','OTHER')),
    condition_status VARCHAR(30) NOT NULL,
    imei1_verified BOOLEAN NOT NULL DEFAULT FALSE,
    imei2_verified BOOLEAN NOT NULL DEFAULT FALSE,
    model_verified BOOLEAN NOT NULL DEFAULT FALSE,
    color_verified BOOLEAN NOT NULL DEFAULT FALSE,
    accessories_complete BOOLEAN,
    notes TEXT,
    inspected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    inspected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE device_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    loan_id UUID,
    returned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    received_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    return_type VARCHAR(30) NOT NULL
        CHECK (return_type IN ('VOLUNTARY','REPOSSESSION','WARRANTY','DAMAGE','OTHER')),
    condition_status VARCHAR(30),
    reason TEXT,
    returned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE device_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    old_status VARCHAR(40),
    new_status VARCHAR(40) NOT NULL,
    reason TEXT,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 08. CUSTOMERS
-- ============================================================

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    customer_number VARCHAR(50) NOT NULL,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN (
            'PENDING','UNDER_REVIEW','APPROVED','ACTIVE',
            'SUSPENDED','INACTIVE','REJECTED'
        )),
    kyc_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (kyc_status IN ('PENDING','UNDER_REVIEW','VERIFIED','REJECTED')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, customer_number)
);

CREATE TABLE customer_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
    agent_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','ENDED')),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    reason TEXT,
    CHECK (effective_until IS NULL OR effective_until > effective_from)
);

CREATE TABLE customer_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    from_region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
    to_region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
    from_agent_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    to_agent_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    effective_at TIMESTAMPTZ
);

CREATE TABLE customer_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    old_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    reason TEXT,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 09. LOAN APPLICATIONS
-- ============================================================

CREATE TABLE loan_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    application_number VARCHAR(50) NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    agent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    requested_device_id UUID REFERENCES devices(id) ON DELETE RESTRICT,
    requested_amount NUMERIC(14,2) NOT NULL CHECK (requested_amount >= 0),
    requested_down_payment NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (requested_down_payment >= 0),
    requested_duration_value INTEGER NOT NULL CHECK (requested_duration_value > 0),
    requested_duration_unit VARCHAR(20) NOT NULL
        CHECK (requested_duration_unit IN ('DAY','WEEK','MONTH')),
    requested_frequency VARCHAR(20) NOT NULL
        CHECK (requested_frequency IN ('DAILY','WEEKLY','BIWEEKLY','MONTHLY','CUSTOM')),
    purpose TEXT,
    notes TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN (
            'DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED',
            'REJECTED','WITHDRAWN','CANCELLED','EXPIRED'
        )),
    submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    decision_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, application_number)
);

CREATE TABLE approval_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    decision VARCHAR(30) NOT NULL
        CHECK (decision IN ('APPROVED','REJECTED','CANCELLED','REQUESTED')),
    decided_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT,
    notes TEXT,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. LOANS / TERMS / SCHEDULES
-- ============================================================

CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    loan_number VARCHAR(50) NOT NULL,
    application_id UUID NOT NULL UNIQUE REFERENCES loan_applications(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    agent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    device_id UUID REFERENCES devices(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL DEFAULT 'APPROVED'
        CHECK (status IN (
            'APPROVED','AWAITING_RELEASE','ACTIVE','PAST_DUE',
            'DEFAULTED','FULLY_PAID','COMPLETED','CANCELLED','CLOSED'
        )),
    approved_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, loan_number)
);

CREATE TABLE loan_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL UNIQUE REFERENCES loans(id) ON DELETE RESTRICT,
    cash_price NUMERIC(14,2) NOT NULL CHECK (cash_price >= 0),
    product_installment_price NUMERIC(14,2) CHECK (product_installment_price >= 0),
    down_payment NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (down_payment >= 0),
    financed_amount NUMERIC(14,2) NOT NULL CHECK (financed_amount >= 0),
    fees_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fees_total >= 0),
    total_repayable NUMERIC(14,2) NOT NULL CHECK (total_repayable >= 0),
    duration_value INTEGER NOT NULL CHECK (duration_value > 0),
    duration_unit VARCHAR(20) NOT NULL
        CHECK (duration_unit IN ('DAY','WEEK','MONTH')),
    frequency VARCHAR(20) NOT NULL
        CHECK (frequency IN ('DAILY','WEEKLY','BIWEEKLY','MONTHLY','CUSTOM')),
    first_due_date DATE,
    terms_snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loan_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
    installment_number INTEGER NOT NULL CHECK (installment_number > 0),
    due_date DATE NOT NULL,
    scheduled_amount NUMERIC(14,2) NOT NULL CHECK (scheduled_amount >= 0),
    principal_component NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (principal_component >= 0),
    fee_component NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fee_component >= 0),
    amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    amount_remaining NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_remaining >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN (
            'PENDING','PARTIALLY_PAID','PAID','DUE',
            'OVERDUE','WAIVED','CANCELLED'
        )),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (loan_id, installment_number)
);

CREATE TABLE loan_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
    old_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    reason TEXT,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. PAYMENTS / FINANCIAL LEDGER
-- ============================================================

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    payment_number VARCHAR(50) NOT NULL,
    loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    method VARCHAR(30) NOT NULL
        CHECK (method IN (
            'MPESA','CASH','BANK_TRANSFER','BANK_DEPOSIT','OTHER'
        )),
    external_reference VARCHAR(150),
    payer_phone VARCHAR(30),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','CONFIRMED','FAILED','REVERSED','CANCELLED')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, payment_number),
    UNIQUE (company_id, external_reference)
);

CREATE TABLE payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
    schedule_id UUID REFERENCES loan_schedules(id) ON DELETE RESTRICT,
    allocated_amount NUMERIC(14,2) NOT NULL CHECK (allocated_amount > 0),
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    allocated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE financial_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    loan_id UUID REFERENCES loans(id) ON DELETE RESTRICT,
    payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
    transaction_type VARCHAR(40) NOT NULL
        CHECK (transaction_type IN (
            'LOAN_DISBURSEMENT','DOWN_PAYMENT','PAYMENT',
            'FEE','ADJUSTMENT','REVERSAL','REFUND','WAIVER','CREDIT'
        )),
    direction VARCHAR(10) NOT NULL
        CHECK (direction IN ('DEBIT','CREDIT')),
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    reference_type VARCHAR(50),
    reference_id UUID,
    description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE financial_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
    amount NUMERIC(14,2) NOT NULL CHECK (amount <> 0),
    adjustment_type VARCHAR(30) NOT NULL
        CHECK (adjustment_type IN ('INCREASE','DECREASE','WAIVER','CREDIT')),
    reason TEXT NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ
);

CREATE TABLE payment_reversals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
    reversal_payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','APPROVED','REJECTED','COMPLETED')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
    receipt_number VARCHAR(50) NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    method VARCHAR(30) NOT NULL,
    external_reference VARCHAR(150),
    balance_after NUMERIC(14,2),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (receipt_number)
);

CREATE TABLE reconciliation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    provider VARCHAR(50) NOT NULL,
    external_reference VARCHAR(150) NOT NULL,
    transaction_time TIMESTAMPTZ,
    payer_phone VARCHAR(30),
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    raw_payload JSONB,
    matched_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'UNMATCHED'
        CHECK (status IN ('UNMATCHED','MATCHED','CONFIRMED','REJECTED','DUPLICATE')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, provider, external_reference)
);

-- ============================================================
-- 12. NOTIFICATIONS
-- ============================================================

CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    channel VARCHAR(20) NOT NULL
        CHECK (channel IN ('IN_APP','SMS','EMAIL')),
    subject_template TEXT,
    body_template TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','INACTIVE')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    channel VARCHAR(20) NOT NULL
        CHECK (channel IN ('IN_APP','SMS','EMAIL')),
    category VARCHAR(30) NOT NULL
        CHECK (category IN ('SECURITY','TRANSACTIONAL','OPERATIONAL','REMINDER','MARKETING')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, channel, category)
);

CREATE TABLE notification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    event_type VARCHAR(100) NOT NULL,
    channel VARCHAR(20) NOT NULL
        CHECK (channel IN ('IN_APP','SMS','EMAIL')),
    template_id UUID REFERENCES notification_templates(id) ON DELETE RESTRICT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    delay_minutes INTEGER NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    idempotency_key VARCHAR(200) NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, idempotency_key)
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    event_id UUID REFERENCES notification_events(id) ON DELETE SET NULL,
    template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
    channel VARCHAR(20) NOT NULL
        CHECK (channel IN ('IN_APP','SMS','EMAIL')),
    category VARCHAR(30) NOT NULL
        CHECK (category IN ('SECURITY','TRANSACTIONAL','OPERATIONAL','REMINDER','MARKETING')),
    title TEXT,
    body TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','QUEUED','SENT','DELIVERED','FAILED','READ','CANCELLED')),
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE RESTRICT,
    attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
    provider VARCHAR(100),
    provider_message_id VARCHAR(200),
    status VARCHAR(30) NOT NULL,
    response_payload JSONB,
    error_message TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 13. REPORTING / EXPORTS
-- ============================================================

CREATE TABLE report_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    report_type VARCHAR(80) NOT NULL,
    configuration JSONB,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE report_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    report_type VARCHAR(80) NOT NULL,
    format VARCHAR(20) NOT NULL
        CHECK (format IN ('CSV','XLSX','PDF')),
    filters JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
    storage_bucket VARCHAR(150),
    storage_path TEXT,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

CREATE TABLE report_export_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_export_id UUID NOT NULL REFERENCES report_exports(id) ON DELETE RESTRICT,
    action VARCHAR(50) NOT NULL,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dashboard_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 14. SECURITY / AUDIT
-- ============================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(80),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    reason TEXT,
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO'
        CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
    description TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE permission_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    permission_name VARCHAR(120) NOT NULL,
    resource_type VARCHAR(80),
    resource_id UUID,
    action VARCHAR(80) NOT NULL,
    allowed BOOLEAN NOT NULL,
    denial_reason TEXT,
    ip_address INET,
    request_id VARCHAR(100),
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 15. OPTIONAL DAILY METRICS / CACHE
-- Source of truth remains transactional tables.
-- ============================================================

CREATE TABLE daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    metric_date DATE NOT NULL,
    total_customers INTEGER NOT NULL DEFAULT 0,
    active_customers INTEGER NOT NULL DEFAULT 0,
    active_loans INTEGER NOT NULL DEFAULT 0,
    outstanding_portfolio NUMERIC(14,2) NOT NULL DEFAULT 0,
    collections NUMERIC(14,2) NOT NULL DEFAULT 0,
    overdue_portfolio NUMERIC(14,2) NOT NULL DEFAULT 0,
    devices_available INTEGER NOT NULL DEFAULT 0,
    devices_financed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, metric_date)
);

CREATE TABLE regional_daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
    metric_date DATE NOT NULL,
    customers INTEGER NOT NULL DEFAULT 0,
    active_loans INTEGER NOT NULL DEFAULT 0,
    collections NUMERIC(14,2) NOT NULL DEFAULT 0,
    outstanding_portfolio NUMERIC(14,2) NOT NULL DEFAULT 0,
    overdue_portfolio NUMERIC(14,2) NOT NULL DEFAULT 0,
    devices_available INTEGER NOT NULL DEFAULT 0,
    devices_financed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, region_id, metric_date)
);

-- ============================================================
-- 16. TRIGGERS
-- ============================================================

CREATE TRIGGER trg_companies_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_system_settings_updated_at
BEFORE UPDATE ON system_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_number_sequences_updated_at
BEFORE UPDATE ON number_sequences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_regions_updated_at
BEFORE UPDATE ON regions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_locations_updated_at
BEFORE UPDATE ON locations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_next_of_kin_updated_at
BEFORE UPDATE ON next_of_kin
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_suppliers_updated_at
BEFORE UPDATE ON suppliers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_brands_updated_at
BEFORE UPDATE ON brands
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_devices_updated_at
BEFORE UPDATE ON devices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_loan_applications_updated_at
BEFORE UPDATE ON loan_applications
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_loans_updated_at
BEFORE UPDATE ON loans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_loan_schedules_updated_at
BEFORE UPDATE ON loan_schedules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_notification_templates_updated_at
BEFORE UPDATE ON notification_templates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_dashboard_preferences_updated_at
BEFORE UPDATE ON dashboard_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 17. INDEXES
-- ============================================================

CREATE INDEX idx_users_company_status ON users(company_id, status);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_login_attempts_identifier ON login_attempts(login_identifier);
CREATE INDEX idx_login_attempts_time ON login_attempts(attempted_at);

CREATE INDEX idx_regions_company_status ON regions(company_id, status);
CREATE INDEX idx_locations_region ON locations(region_id);
CREATE INDEX idx_user_assignments_user ON user_assignments(user_id);
CREATE INDEX idx_user_assignments_region ON user_assignments(region_id);
CREATE INDEX idx_user_assignments_supervisor ON user_assignments(supervisor_user_id);

CREATE INDEX idx_user_profiles_national_id ON user_profiles(national_id);
CREATE INDEX idx_user_documents_user ON user_documents(user_id);
CREATE INDEX idx_user_documents_status ON user_documents(status);
CREATE INDEX idx_next_of_kin_documents_kin ON next_of_kin_documents(next_of_kin_id);

CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_devices_product ON devices(product_id);
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_stock_location ON devices(current_stock_location_id);
CREATE INDEX idx_devices_custodian ON devices(current_custodian_user_id);
CREATE INDEX idx_devices_imei1 ON devices(imei1);
CREATE INDEX idx_devices_imei2 ON devices(imei2);
CREATE INDEX idx_stock_receipts_supplier ON stock_receipts(supplier_id);
CREATE INDEX idx_stock_transfer_from ON stock_transfers(from_stock_location_id);
CREATE INDEX idx_stock_transfer_to ON stock_transfers(to_stock_location_id);
CREATE INDEX idx_stock_transfer_items_device ON stock_transfer_items(device_id);
CREATE INDEX idx_device_movements_device ON device_movements(device_id);
CREATE INDEX idx_device_movements_time ON device_movements(performed_at);
CREATE INDEX idx_device_reservations_device ON device_reservations(device_id);
CREATE INDEX idx_device_reservations_status ON device_reservations(status);

CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_kyc_status ON customers(kyc_status);
CREATE INDEX idx_customer_assignments_customer ON customer_assignments(customer_id);
CREATE INDEX idx_customer_assignments_region ON customer_assignments(region_id);
CREATE INDEX idx_customer_assignments_agent ON customer_assignments(agent_user_id);
CREATE INDEX idx_customer_transfers_customer ON customer_transfers(customer_id);

CREATE INDEX idx_applications_customer ON loan_applications(customer_id);
CREATE INDEX idx_applications_agent ON loan_applications(agent_user_id);
CREATE INDEX idx_applications_region ON loan_applications(region_id);
CREATE INDEX idx_applications_status ON loan_applications(status);

CREATE INDEX idx_loans_customer ON loans(customer_id);
CREATE INDEX idx_loans_agent ON loans(agent_user_id);
CREATE INDEX idx_loans_region ON loans(region_id);
CREATE INDEX idx_loans_device ON loans(device_id);
CREATE INDEX idx_loans_status ON loans(status);

CREATE INDEX idx_loan_schedules_loan ON loan_schedules(loan_id);
CREATE INDEX idx_loan_schedules_due_date ON loan_schedules(due_date);
CREATE INDEX idx_loan_schedules_status ON loan_schedules(status);

CREATE INDEX idx_payments_loan ON payments(loan_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_received_at ON payments(received_at);
CREATE INDEX idx_payment_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_loan ON payment_allocations(loan_id);
CREATE INDEX idx_payment_allocations_schedule ON payment_allocations(schedule_id);
CREATE INDEX idx_financial_transactions_loan ON financial_transactions(loan_id);
CREATE INDEX idx_financial_transactions_payment ON financial_transactions(payment_id);
CREATE INDEX idx_financial_transactions_created ON financial_transactions(created_at);
CREATE INDEX idx_adjustments_loan ON financial_adjustments(loan_id);
CREATE INDEX idx_adjustments_status ON financial_adjustments(status);
CREATE INDEX idx_reconciliation_status ON reconciliation_records(status);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notification_events_type ON notification_events(event_type);
CREATE INDEX idx_notification_logs_notification ON notification_logs(notification_id);

CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_region ON audit_logs(region_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_security_events_user ON security_events(user_id);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_resolved ON security_events(resolved);
CREATE INDEX idx_permission_checks_user ON permission_checks(user_id);

-- ============================================================
-- 18. BUSINESS-SAFETY CONSTRAINTS / PARTIAL UNIQUE INDEXES
-- ============================================================

-- One active customer assignment per customer.
CREATE UNIQUE INDEX uq_active_customer_assignment
ON customer_assignments(customer_id)
WHERE status = 'ACTIVE';

-- One active assignment of a Regional Admin to a region.
CREATE UNIQUE INDEX uq_active_regional_admin_assignment
ON user_assignments(region_id)
WHERE assignment_type = 'REGIONAL_ADMIN' AND status = 'ACTIVE';

-- One active reservation per device.
CREATE UNIQUE INDEX uq_active_device_reservation
ON device_reservations(device_id)
WHERE status = 'ACTIVE';

-- One active device assignment per device.
CREATE UNIQUE INDEX uq_active_device_assignment
ON device_assignments(device_id)
WHERE status = 'ACTIVE';

-- One active customer device/loan relationship.
CREATE UNIQUE INDEX uq_active_customer_device_assignment
ON device_assignments(customer_user_id, loan_id)
WHERE status = 'ACTIVE' AND customer_user_id IS NOT NULL;

-- Prevent duplicate active role assignment.
CREATE UNIQUE INDEX uq_active_user_role
ON user_roles(user_id, role_id)
WHERE status = 'ACTIVE';

-- ============================================================
-- 19. NUMBER GENERATION FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION next_business_number(
    p_company_id UUID,
    p_sequence_type VARCHAR,
    p_prefix VARCHAR
)
RETURNS TEXT AS $$
DECLARE
    v_next BIGINT;
BEGIN
    INSERT INTO number_sequences (
        company_id,
        sequence_type,
        prefix,
        current_value
    )
    VALUES (
        p_company_id,
        p_sequence_type,
        p_prefix,
        1
    )
    ON CONFLICT (company_id, sequence_type)
    DO UPDATE SET
        current_value = number_sequences.current_value + 1,
        updated_at = NOW()
    RETURNING current_value INTO v_next;

    IF v_next IS NULL THEN
        SELECT current_value
        INTO v_next
        FROM number_sequences
        WHERE company_id = p_company_id
          AND sequence_type = p_sequence_type;
    END IF;

    RETURN p_prefix || LPAD(v_next::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 20. INITIAL DATA
-- ============================================================

-- Roles
INSERT INTO roles (name, description) VALUES
('OWNER', 'Business owner with company-wide strategic and oversight authority'),
('SUPERADMIN', 'Central operational administrator'),
('REGIONAL_ADMIN', 'Regional operational administrator'),
('AGENT', 'Customer-facing sales and financing agent'),
('CUSTOMER', 'Customer with access to own account and financing information')
ON CONFLICT (name) DO NOTHING;

-- Core permissions
INSERT INTO permissions (name, description) VALUES
('dashboard.view', 'View authorized dashboard'),
('user.view', 'View users'),
('user.create', 'Create users'),
('user.approve', 'Approve users'),
('user.reject', 'Reject users'),
('user.suspend', 'Suspend users'),
('user.activate', 'Activate users'),

('region.view', 'View regions'),
('region.create', 'Create regions'),
('region.update', 'Update regions'),

('kyc.view', 'View authorized KYC information'),
('kyc.review', 'Review KYC'),
('kyc.verify', 'Verify KYC'),
('kyc.reject', 'Reject KYC'),

('customer.view', 'View customers'),
('customer.create', 'Create customers'),
('customer.approve', 'Approve customers'),
('customer.reject', 'Reject customers'),
('customer.suspend', 'Suspend customers'),
('customer.transfer', 'Transfer customers'),

('product.view', 'View products'),
('product.create', 'Create products'),
('product.update', 'Update products'),

('device.view', 'View devices'),
('device.create', 'Create devices'),
('device.verify', 'Verify devices'),
('device.transfer', 'Transfer devices'),
('device.reserve', 'Reserve devices'),
('device.release', 'Release devices'),
('device.return', 'Process device returns'),
('device.repossess', 'Process repossession'),

('loan_application.view', 'View authorized applications'),
('loan_application.create', 'Create loan applications'),
('loan_application.submit', 'Submit loan applications'),
('loan_application.approve', 'Approve loan applications'),
('loan_application.reject', 'Reject loan applications'),

('loan.view', 'View authorized loans'),
('loan.activate', 'Activate loans'),
('loan.cancel', 'Cancel loans'),

('payment.view', 'View authorized payments'),
('payment.create', 'Record payments'),
('payment.confirm', 'Confirm payments'),
('payment.reverse', 'Reverse payments'),

('financial_adjustment.request', 'Request financial adjustments'),
('financial_adjustment.approve', 'Approve financial adjustments'),

('report.view', 'View reports'),
('report.export', 'Export reports'),

('notification.view', 'View notifications'),
('notification.manage', 'Manage notification configuration'),

('audit.view', 'View audit logs'),
('security.view', 'View security information')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 21. PERMISSION MAPPING
-- ============================================================

-- Owner: broad oversight.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'OWNER'
ON CONFLICT DO NOTHING;

-- Superadmin: all current operational permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'SUPERADMIN'
ON CONFLICT DO NOTHING;

-- Regional Admin.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
    'dashboard.view',
    'user.view',
    'customer.view',
    'customer.create',
    'customer.transfer',
    'kyc.view',
    'product.view',
    'device.view',
    'device.transfer',
    'loan_application.view',
    'loan.view',
    'payment.view',
    'report.view',
    'notification.view'
)
WHERE r.name = 'REGIONAL_ADMIN'
ON CONFLICT DO NOTHING;

-- Agent.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
    'dashboard.view',
    'customer.view',
    'customer.create',
    'kyc.view',
    'product.view',
    'device.view',
    'loan_application.view',
    'loan_application.create',
    'loan_application.submit',
    'loan.view',
    'payment.view',
    'notification.view'
)
WHERE r.name = 'AGENT'
ON CONFLICT DO NOTHING;

-- Customer.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
    'dashboard.view',
    'customer.view',
    'loan_application.view',
    'loan.view',
    'payment.view',
    'notification.view'
)
WHERE r.name = 'CUSTOMER'
ON CONFLICT DO NOTHING;

-- ============================================================
-- END
-- ============================================================

COMMIT;
