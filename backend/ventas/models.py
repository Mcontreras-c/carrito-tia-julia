# PostgreSQL administra el esquema; Oracle se conserva como origen de migración.
from django.db import models
from django.conf import settings
from django.utils import timezone
from .fields import OracleTimestampTZField


class Categorias(models.Model):
    id = models.BigAutoField(primary_key=True)
    nombre = models.CharField(unique=True, max_length=80)
    activa = models.BooleanField(default=True)

    class Meta:
        managed = settings.DATABASES['default']['ENGINE'] == 'django.db.backends.postgresql'
        db_table = 'categorias'


class Productos(models.Model):
    id = models.BigAutoField(primary_key=True)
    categoria = models.ForeignKey(Categorias, models.PROTECT)
    nombre = models.CharField(max_length=120)
    precio = models.BigIntegerField(db_comment='Pesos chilenos enteros; validar entradas sin decimales antes de guardar.')
    imagen = models.CharField(max_length=500, blank=True, null=True, db_comment='Ruta o clave de la imagen; el archivo se almacena fuera de Oracle.')
    disponible = models.BooleanField(default=True)
    activo = models.BooleanField(default=True)

    class Meta:
        managed = settings.DATABASES['default']['ENGINE'] == 'django.db.backends.postgresql'
        db_table = 'productos'
        unique_together = (('categoria', 'nombre'),)
        constraints = [models.CheckConstraint(condition=models.Q(precio__gt=0), name='ck_productos_precio')]


class Pedidos(models.Model):
    id = models.BigAutoField(primary_key=True, db_comment='Numero visible de pedido, global; puede tener saltos.')
    cliente = models.CharField(max_length=120, blank=True, null=True)
    estado = models.CharField(max_length=20, default='PENDIENTE', choices=[('PENDIENTE', 'Pendiente'), ('EN_PREPARACION', 'En preparación'), ('ENTREGADO', 'Entregado'), ('CANCELADO', 'Cancelado')])
    observaciones = models.CharField(max_length=500, blank=True, null=True)
    creado_en = OracleTimestampTZField(default=timezone.now, editable=False)
    actualizado_en = OracleTimestampTZField(default=timezone.now, db_comment='La API actualiza esta fecha al modificar el pedido o sus detalles.')
    revision = models.PositiveBigIntegerField(default=0)
    external_id = models.CharField(max_length=36, unique=True, null=True, blank=True)
    request_key = models.CharField(max_length=36, null=True, blank=True)
    request_hash = models.CharField(max_length=64, null=True, blank=True)

    class Meta:
        managed = settings.DATABASES['default']['ENGINE'] == 'django.db.backends.postgresql'
        db_table = 'pedidos'
        constraints = [models.CheckConstraint(condition=models.Q(estado__in=['PENDIENTE', 'EN_PREPARACION', 'ENTREGADO', 'CANCELADO']), name='ck_pedidos_estado')]
        indexes = [models.Index(fields=['estado', 'creado_en'], name='ix_pedidos_estado_fecha')]


class DetallesPedido(models.Model):
    id = models.BigAutoField(primary_key=True)
    pedido = models.ForeignKey(Pedidos, models.PROTECT)
    producto = models.ForeignKey(Productos, models.PROTECT)
    nombre_producto = models.CharField(max_length=120, db_comment='Copia del nombre al vender; conserva el historial.')
    cantidad = models.IntegerField()
    precio_unitario = models.BigIntegerField(db_comment='Copia del precio al vender; no cambia al editar el menu.')
    indicaciones = models.CharField(max_length=500, blank=True, null=True)
    external_id = models.CharField(max_length=36, null=True, blank=True)

    class Meta:
        managed = settings.DATABASES['default']['ENGINE'] == 'django.db.backends.postgresql'
        db_table = 'detalles_pedido'
        constraints = [
            models.CheckConstraint(condition=models.Q(cantidad__gt=0), name='ck_detalles_cantidad'),
            models.CheckConstraint(condition=models.Q(precio_unitario__gt=0), name='ck_detalles_precio'),
            models.UniqueConstraint(fields=['pedido', 'external_id'], name='uq_detalles_external'),
        ]


class Pagos(models.Model):
    id = models.BigAutoField(primary_key=True)
    pedido = models.OneToOneField(Pedidos, models.PROTECT)
    metodo = models.CharField(max_length=20, choices=[('EFECTIVO', 'Efectivo'), ('TRANSFERENCIA', 'Transferencia'), ('TARJETA', 'Tarjeta')])
    monto = models.BigIntegerField()
    recibido = models.BigIntegerField(blank=True, null=True)
    vuelto = models.BigIntegerField(blank=True, null=True)
    referencia = models.CharField(max_length=120, blank=True, null=True)
    creado_en = OracleTimestampTZField(default=timezone.now, editable=False)

    class Meta:
        managed = settings.DATABASES['default']['ENGINE'] == 'django.db.backends.postgresql'
        db_table = 'pagos'
        db_table_comment = 'Un pago completo por pedido. Sin pagos parciales ni devoluciones en esta version.'
        constraints = [
            models.CheckConstraint(condition=models.Q(monto__gt=0), name='ck_pagos_monto'),
            models.CheckConstraint(condition=models.Q(metodo__in=['EFECTIVO', 'TRANSFERENCIA', 'TARJETA']), name='ck_pagos_metodo'),
            models.CheckConstraint(condition=(
                models.Q(metodo='EFECTIVO', recibido__isnull=False, vuelto__isnull=False,
                         recibido__gte=models.F('monto'), vuelto=models.F('recibido') - models.F('monto'))
                | models.Q(metodo__in=['TRANSFERENCIA', 'TARJETA'], recibido__isnull=True, vuelto__isnull=True)
            ), name='ck_pagos_efectivo'),
        ]


class Fiado(models.Model):
    pedido = models.OneToOneField(Pedidos, on_delete=models.PROTECT, related_name='fiado')
    nombre = models.CharField(max_length=120)
    celular = models.CharField(max_length=16)
    fecha_prometida = models.DateField()
    monto = models.PositiveBigIntegerField()
    creado_en = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = 'fiados'
        constraints = [models.CheckConstraint(condition=models.Q(monto__gt=0), name='ck_fiados_monto')]


class ContadorDia(models.Model):
    fecha = models.DateField(primary_key=True)
    ultimo = models.PositiveBigIntegerField(default=0)

    class Meta:
        db_table = 'contador_pedidos_dia'


class NumeroPedido(models.Model):
    pedido = models.OneToOneField(Pedidos, models.PROTECT, primary_key=True)
    fecha = models.DateField()
    numero = models.PositiveBigIntegerField()

    class Meta:
        db_table = 'numeros_pedido'
        constraints = [models.UniqueConstraint(fields=['fecha', 'numero'], name='uq_numero_pedido_dia')]

