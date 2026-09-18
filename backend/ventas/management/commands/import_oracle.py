"""One-time import into an empty PostgreSQL business schema; Oracle is read-only."""
import json
from datetime import datetime, timezone
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core import serializers
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction


LABELS = ['auth.group', 'auth.user', 'ventas.categorias', 'ventas.productos',
          'ventas.pedidos', 'ventas.detallespedido', 'ventas.pagos', 'ventas.fiado',
          'ventas.contadordia', 'ventas.numeropedido', 'admin.logentry']


def records(model, alias):
    return json.loads(serializers.serialize('json', model.objects.using(alias).order_by(model._meta.pk.name),
                                           use_natural_foreign_keys=True, use_natural_primary_keys=True))


class Command(BaseCommand):
    help = 'Importa Oracle en PostgreSQL vacío y verifica cada registro. Requiere detener las ventas durante la copia.'

    def handle(self, *args, **options):
        if connections['default'].vendor != 'postgresql' or 'oracle' not in connections:
            raise CommandError('Usa --settings=config.settings_postgresql y conserva DB_NAME/DB_USER/DB_PASSWORD de Oracle.')
        models = [apps.get_model(label) for label in LABELS]
        if any(model.objects.exists() for model in models):
            raise CommandError('El destino contiene datos. No se sobrescribió nada; usa una base nueva y vacía.')
        # A single consistent source snapshot; writes on Oracle are never performed.
        with transaction.atomic(using='oracle'):
            with connections['oracle'].cursor() as cursor:
                cursor.execute('SET TRANSACTION READ ONLY')
            source = {model._meta.label_lower: records(model, 'oracle') for model in models}
        folder = Path(settings.BASE_DIR) / '.local-backups'
        folder.mkdir(exist_ok=True)
        fixture = folder / f'oracle-import-{datetime.now(timezone.utc):%Y%m%d-%H%M%S-%f}.json'
        fixture.write_text(json.dumps([row for rows in source.values() for row in rows], ensure_ascii=False), encoding='utf-8')
        with transaction.atomic():
            call_command('loaddata', str(fixture), database='default', verbosity=0)
            for model in models:
                if records(model, 'default') != source[model._meta.label_lower]:
                    raise CommandError(f'La verificación de {model._meta.label_lower} falló. Importación revertida.')
        self.stdout.write(self.style.SUCCESS(f'Importación verificada: {sum(map(len, source.values()))} registros. Oracle intacto. Copia: {fixture.name}'))
