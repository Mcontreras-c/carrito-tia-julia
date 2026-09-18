-- Datos ficticios para desarrollo. Ejecutar una sola vez tras 01_schema.sql.
-- Se confirma todo junto; si hay un error, SQLcl / SQL*Plus revierte el DML.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

DECLARE
    v_completos NUMBER;
    v_churrascos NUMBER;
    v_bebidas NUMBER;
    v_italiano NUMBER;
    v_bebida NUMBER;
    v_pedido NUMBER;
BEGIN
    INSERT INTO categorias (nombre) VALUES ('Completos') RETURNING id INTO v_completos;
    INSERT INTO categorias (nombre) VALUES ('Churrascos') RETURNING id INTO v_churrascos;
    INSERT INTO categorias (nombre) VALUES ('Bebidas') RETURNING id INTO v_bebidas;

    INSERT INTO productos (categoria_id, nombre, precio)
    VALUES (v_completos, 'Completo italiano', 2500) RETURNING id INTO v_italiano;
    INSERT INTO productos (categoria_id, nombre, precio) VALUES (v_completos, 'Completo clasico', 2000);
    INSERT INTO productos (categoria_id, nombre, precio) VALUES (v_churrascos, 'Churrasco italiano', 5000);
    INSERT INTO productos (categoria_id, nombre, precio) VALUES (v_churrascos, 'Churrasco queso', 4500);
    INSERT INTO productos (categoria_id, nombre, precio)
    VALUES (v_bebidas, 'Bebida lata', 1500) RETURNING id INTO v_bebida;
    INSERT INTO productos (categoria_id, nombre, precio) VALUES (v_bebidas, 'Agua mineral', 1000);

    INSERT INTO pedidos (cliente) VALUES ('Ana (ejemplo)') RETURNING id INTO v_pedido;
    INSERT INTO detalles_pedido (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
    VALUES (v_pedido, v_italiano, 'Completo italiano', 1, 2500);
    INSERT INTO detalles_pedido (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, indicaciones)
    VALUES (v_pedido, v_italiano, 'Completo italiano', 1, 2500, 'Sin tomate');
    INSERT INTO detalles_pedido (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
    VALUES (v_pedido, v_bebida, 'Bebida lata', 1, 1500);
END;
/
COMMIT;

-- Resultado esperado: total 6500, estado_pago SIN_PAGAR.
SELECT id, cliente, total, estado_pago FROM resumen_pedidos ORDER BY id;
