# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models


class Categorias(models.Model):
    id = models.BigAutoField(primary_key=True)
    nombre = models.CharField(unique=True, max_length=80)
    activa = models.BooleanField()

    class Meta:
        managed = False
        db_table = 'categorias'


class Productos(models.Model):
    id = models.BigAutoField(primary_key=True)
    categoria = models.ForeignKey(Categorias, models.DO_NOTHING)
    nombre = models.CharField(max_length=120)
    precio = models.BigIntegerField(db_comment='Pesos chilenos enteros; validar entradas sin decimales antes de guardar.')
    imagen = models.CharField(max_length=500, blank=True, null=True, db_comment='Ruta o clave de la imagen; el archivo se almacena fuera de Oracle.')
    disponible = models.BooleanField()
    activo = models.BooleanField()

    class Meta:
        managed = False
        db_table = 'productos'
        unique_together = (('categoria', 'nombre'),)


class Pedidos(models.Model):
    id = models.BigAutoField(primary_key=True, db_comment='Numero visible de pedido, global; puede tener saltos.')
    cliente = models.CharField(max_length=120, blank=True, null=True)
    estado = models.CharField(max_length=20)
    observaciones = models.CharField(max_length=500, blank=True, null=True)
    creado_en = models.TextField()  # This field type is a guess.
    actualizado_en = models.TextField(db_comment='La API actualiza esta fecha al modificar el pedido o sus detalles.')  # This field type is a guess.

    class Meta:
        managed = False
        db_table = 'pedidos'


class DetallesPedido(models.Model):
    id = models.BigAutoField(primary_key=True)
    pedido = models.ForeignKey(Pedidos, models.DO_NOTHING)
    producto = models.ForeignKey(Productos, models.DO_NOTHING)
    nombre_producto = models.CharField(max_length=120, db_comment='Copia del nombre al vender; conserva el historial.')
    cantidad = models.IntegerField()
    precio_unitario = models.BigIntegerField(db_comment='Copia del precio al vender; no cambia al editar el menu.')
    indicaciones = models.CharField(max_length=500, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'detalles_pedido'


class Pagos(models.Model):
    id = models.BigAutoField(primary_key=True)
    pedido = models.OneToOneField(Pedidos, models.DO_NOTHING)
    metodo = models.CharField(max_length=20)
    monto = models.BigIntegerField()
    recibido = models.BigIntegerField(blank=True, null=True)
    vuelto = models.BigIntegerField(blank=True, null=True)
    referencia = models.CharField(max_length=120, blank=True, null=True)
    creado_en = models.TextField()  # This field type is a guess.

    class Meta:
        managed = False
        db_table = 'pagos'
        db_table_comment = 'Un pago completo por pedido. Sin pagos parciales ni devoluciones en esta version.'
