from django.db import migrations


def add_persistence(apps, schema_editor):
    # Oracle commits DDL. Inspect each object so an interrupted migration can resume.
    with schema_editor.connection.cursor() as cursor:
        for table, column, definition in [
            ('PEDIDOS', 'REVISION', 'NUMBER(19) DEFAULT 0 NOT NULL'),
            ('PEDIDOS', 'EXTERNAL_ID', 'NVARCHAR2(36)'),
            ('PEDIDOS', 'REQUEST_KEY', 'NVARCHAR2(36)'),
            ('PEDIDOS', 'REQUEST_HASH', 'NVARCHAR2(64)'),
            ('DETALLES_PEDIDO', 'EXTERNAL_ID', 'NVARCHAR2(36)'),
        ]:
            cursor.execute('SELECT COUNT(*) FROM user_tab_columns WHERE table_name=%s AND column_name=%s', [table, column])
            if not cursor.fetchone()[0]:
                cursor.execute(f'ALTER TABLE {table} ADD ({column} {definition})')
        # Oracle composite unique constraints do not allow repeated (pedido_id, NULL).
        cursor.execute('UPDATE detalles_pedido SET external_id=TO_CHAR(id) WHERE external_id IS NULL')
        for table, name, columns in [
            ('PEDIDOS', 'UQ_PEDIDOS_EXTERNAL', 'external_id'),
            ('DETALLES_PEDIDO', 'UQ_DETALLES_EXTERNAL', 'pedido_id, external_id'),
        ]:
            cursor.execute('SELECT COUNT(*) FROM user_constraints WHERE constraint_name=%s', [name])
            if not cursor.fetchone()[0]:
                cursor.execute(f'ALTER TABLE {table} ADD CONSTRAINT {name} UNIQUE ({columns})')


class Migration(migrations.Migration):
    atomic = False
    dependencies = [('ventas', '0001_initial')]
    # No reverse SQL: removing these columns would discard coordination/history.
    operations = [migrations.RunPython(add_persistence)]
