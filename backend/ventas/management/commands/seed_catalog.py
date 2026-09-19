from django.core.management.base import BaseCommand
from django.db import transaction

from ventas.models import Categorias, Productos

CATALOG = {
    'Completos': [
        ('Completo Italiano', 2000),
        ('As Italiano', 3700),
        ('As Queso', 3600),
    ],
    'Sándwiches': [
        ('Churrasco Italiano', 4000),
        ('Churrasco Palta Queso', 4500),
        ('Churrasco Palta', 3600),
        ('Churrasco Mayo', 3000),
        ('Churrasco Carne', 3000),
        ('Barros Luco', 4000),
    ],
    'Papas': [
        ('Papas', 3000),
        ('Salchipapa', 3500),
        ('Salchicarne', 5000),
    ],
    'Otros': [
        ('Sopaipillas', 300),
        ('Empanadas', 2000),
    ],
    'Bebestibles': [
        ('Jugo Natural Chico', 1000),
        ('Jugo Natural Grande', 1500),
        ('Té', 1000),
        ('Café', 1200),
        ('Bebida Chica', 800),
        ('Bebida Mediana', 1500),
        ('Bebida 1½ Litro', 2500),
        ('Bebida 3 Litros', 3400),
        ('Score', 1500),
    ],
}


class Command(BaseCommand):
    help = ('Carga el menú inicial de Tía Julia (categorías y productos). '
            'Seguro de repetir: no duplica categorías ni productos existentes, '
            'ni pisa precios ya cargados.')

    @transaction.atomic
    def handle(self, *args, **options):
        for category_name, products in CATALOG.items():
            category, created = Categorias.objects.get_or_create(
                nombre=category_name, defaults={'activa': True})
            self.stdout.write(f"{'Creada' if created else 'Ya existía'}: categoría {category_name}")
            for name, price in products:
                _, created = Productos.objects.get_or_create(
                    categoria=category, nombre=name,
                    defaults={'precio': price, 'disponible': True, 'activo': True},
                )
                self.stdout.write(f"  {'Creado' if created else 'Ya existía'}: {name} (${price})")
