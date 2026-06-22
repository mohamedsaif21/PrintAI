-- Materials Table: Tracks raw materials available in the inventory.
CREATE TABLE materials (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50) NOT NULL, -- e.g., 'sheets', 'kg', 'liters'
    total_stock INT NOT NULL DEFAULT 0,
    available_stock INT NOT NULL DEFAULT 0,
    threshold_level INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bill of Materials (BOM) Table: Defines the materials and quantities required for each product.
CREATE TABLE bom (
    id SERIAL PRIMARY KEY,
    product_id VARCHAR(255) NOT NULL, -- Assuming product_id is a string, could be a foreign key to a products table
    material_id INT REFERENCES materials(id),
    quantity_per_unit INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Material Usage Table: Tracks the status of material allocation and consumption for each order.
CREATE TABLE material_usage (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL, -- Assuming order_id is a string
    material_id INT REFERENCES materials(id),
    required_qty INT NOT NULL,
    consumed_qty INT NOT NULL DEFAULT 0,
    status VARCHAR(50) CHECK (status IN ('reserved', 'consuming', 'completed', 'released')) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory Logs Table: Provides an audit trail for all inventory transactions.
CREATE TABLE inventory_logs (
    id SERIAL PRIMARY KEY,
    material_id INT REFERENCES materials(id),
    type VARCHAR(50) CHECK (type IN ('reserve', 'consume', 'release', 'stock_in')) NOT NULL,
    quantity INT NOT NULL,
    reference_id VARCHAR(255), -- e.g., order_id or a stock-in reference
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_materials_name ON materials(name);
CREATE INDEX idx_bom_product_id ON bom(product_id);
CREATE INDEX idx_material_usage_order_id ON material_usage(order_id);
CREATE INDEX idx_inventory_logs_material_id ON inventory_logs(material_id);
CREATE INDEX idx_inventory_logs_type ON inventory_logs(type);

-- Stored procedure to reserve material
CREATE OR REPLACE FUNCTION reserve_material(p_material_id INT, p_quantity INT, p_order_id VARCHAR)
RETURNS void AS $$
DECLARE
    current_available_stock INT;
BEGIN
    -- Lock the material row to prevent race conditions
    SELECT available_stock INTO current_available_stock FROM materials WHERE id = p_material_id FOR UPDATE;

    IF current_available_stock >= p_quantity THEN
        -- Decrease available stock
        UPDATE materials SET available_stock = available_stock - p_quantity, updated_at = NOW() WHERE id = p_material_id;

        -- Create a material usage record
        INSERT INTO material_usage (order_id, material_id, required_qty, status)
        VALUES (p_order_id, p_material_id, p_quantity, 'reserved');

        -- Log the reservation
        INSERT INTO inventory_logs (material_id, type, quantity, reference_id)
        VALUES (p_material_id, 'reserve', p_quantity, p_order_id);
    ELSE
        RAISE EXCEPTION 'Insufficient stock for material %', p_material_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Stored procedure to consume material
CREATE OR REPLACE FUNCTION consume_material(p_material_id INT, p_quantity INT, p_order_id VARCHAR)
RETURNS void AS $$
BEGIN
    -- Update consumed quantity
    UPDATE material_usage 
    SET consumed_qty = consumed_qty + p_quantity, status = 'consuming', updated_at = NOW()
    WHERE material_id = p_material_id AND order_id = p_order_id;

    -- Decrease total stock
    UPDATE materials SET total_stock = total_stock - p_quantity, updated_at = NOW() WHERE id = p_material_id;

    -- Log the consumption
    INSERT INTO inventory_logs (material_id, type, quantity, reference_id)
    VALUES (p_material_id, 'consume', p_quantity, p_order_id);
END;
$$ LANGUAGE plpgsql;

-- Stored procedure to release material
CREATE OR REPLACE FUNCTION release_material(p_material_id INT, p_quantity INT, p_order_id VARCHAR)
RETURNS void AS $$
BEGIN
    -- Increase available stock
    UPDATE materials SET available_stock = available_stock + p_quantity, updated_at = NOW() WHERE id = p_material_id;

    -- Update material usage record
    UPDATE material_usage SET status = 'released', updated_at = NOW() 
    WHERE material_id = p_material_id AND order_id = p_order_id;

    -- Log the release
    INSERT INTO inventory_logs (material_id, type, quantity, reference_id)
    VALUES (p_material_id, 'release', p_quantity, p_order_id);
END;
$$ LANGUAGE plpgsql;


-- Example Data (for demonstration)
INSERT INTO materials (name, unit, total_stock, available_stock, threshold_level) VALUES
('Glossy Sheet', 'sheets', 10000, 10000, 1000),
('Matte Sheet', 'sheets', 10000, 10000, 1000);

INSERT INTO bom (product_id, material_id, quantity_per_unit) VALUES
('brochure_glossy', 1, 1),
('flyer_matte', 2, 1);
