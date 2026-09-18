import json
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Exporta una copia JSON local de las tablas de ventas existentes, sin credenciales.'

    def handle(self, *args, **options):
        data = {}
        with connection.cursor() as cursor:
            for table in ('categorias', 'productos', 'pedidos', 'detalles_pedido', 'pagos', 'fiados', 'contador_pedidos_dia', 'numeros_pedido'):
                if connection.vendor == 'oracle':
                    cursor.execute('SELECT column_name, data_type FROM user_tab_columns WHERE table_name = %s ORDER BY column_id', [table.upper()])
                else:
                    cursor.execute('SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = %s ORDER BY ordinal_position', [table])
                metadata = cursor.fetchall()
                if not metadata:
                    continue
                # Preserve timezone-bearing timestamps without Thin driver region decoding.
                columns_sql = ', '.join(
                    f"TO_CHAR({name}, 'YYYY-MM-DD\"T\"HH24:MI:SS.FF TZH:TZM') AS {name}"
                    if 'TIME ZONE' in kind else name for name, kind in metadata
                )
                cursor.execute(f'SELECT {columns_sql} FROM {table}')
                columns = [c[0] for c in cursor.description]
                data[table] = [dict(zip(columns, row)) for row in cursor.fetchall()]
        folder = Path(settings.BASE_DIR) / '.local-backups'
        folder.mkdir(exist_ok=True)
        path = folder / f'sales-{datetime.now(timezone.utc):%Y%m%d-%H%M%S-%f}.json'
        path.write_text(json.dumps(data, default=str, ensure_ascii=False, indent=2), encoding='utf-8')
        self.stdout.write(f'Copia guardada: {path.name}. Filas: {sum(map(len, data.values()))}')
