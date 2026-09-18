"""All writers lock the parent order; Oracle remains the source of amounts and dates."""
import hashlib
import json
import re
from datetime import date, timezone as dt_timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError, NotFound

from .models import Pedidos, DetallesPedido, Productos, Pagos, Fiado, ContadorDia, NumeroPedido

STATUS = {'PENDIENTE': 'Pendiente', 'EN_PREPARACION': 'En preparación', 'ENTREGADO': 'Entregado', 'CANCELADO': 'Cancelado'}
METHOD = {'EFECTIVO': 'Efectivo', 'TRANSFERENCIA': 'Transferencia', 'TARJETA': 'Tarjeta'}
METHOD_CODES = {v: k for k, v in METHOD.items()}


class Conflict(APIException):
    status_code = 409
    default_detail = 'El pedido cambió. Actualiza los pedidos y vuelve a intentarlo.'


def integer(value, minimum=0, maximum=999999999999):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValidationError('Usa un número entero dentro del rango permitido.')
    return value


def text(value, length, required=False):
    if not isinstance(value, str) or len(value) > length or (required and not value.strip()):
        raise ValidationError('Revisa los textos obligatorios y su longitud.')
    return value.strip()


def request_id(value):
    try:
        return str(UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError('Identificador de operación inválido.')


def iso(value):
    if timezone.is_naive(value):
        value = timezone.make_aware(value, dt_timezone.utc)
    return value.isoformat()


def serialize(order):
    numbering = NumeroPedido.objects.get(pedido=order)
    lines = list(order.detallespedido_set.all().order_by('id'))
    payment = Pagos.objects.filter(pedido=order).first()
    credit = Fiado.objects.filter(pedido=order).first()
    result = {
        'id': str(order.pk), 'number': numbering.numero, 'day': numbering.fecha.isoformat(), 'revision': order.revision,
        'name': order.cliente or '', 'created': iso(order.creado_en), 'status': STATUS[order.estado],
        'lines': [{'id': l.external_id or str(l.pk), 'productId': l.producto_id, 'name': l.nombre_producto,
                   'price': l.precio_unitario, 'quantity': l.cantidad, 'note': l.indicaciones or ''} for l in lines],
        'payment': None,
    }
    if payment:
        result['payment'] = {'method': METHOD[payment.metodo], 'total': payment.monto, 'received': payment.recibido,
                             'change': payment.vuelto, 'date': iso(payment.creado_en)}
    if credit:
        result['credit'] = {'name': credit.nombre, 'phone': credit.celular, 'dueDate': credit.fecha_prometida.isoformat(),
                            'amount': credit.monto, 'date': iso(credit.creado_en)}
    return result


def create_order(key):
    key = request_id(key)
    with transaction.atomic():
        now = timezone.now()
        day = now.astimezone(ZoneInfo('America/Santiago')).date()
        ContadorDia.objects.get_or_create(fecha=day)
        counter = ContadorDia.objects.select_for_update().get(fecha=day)
        order, created = Pedidos.objects.get_or_create(external_id=key, defaults={'creado_en': now})
        if created:
            counter.ultimo += 1
            counter.save(update_fields=['ultimo'])
            NumeroPedido.objects.create(pedido=order, fecha=day, numero=counter.ultimo)
        return serialize(order)


def edit_order(order, data, paid, credit):
    if paid or credit or order.estado != 'PENDIENTE':
        raise Conflict('Solo se pueden editar pedidos pendientes, sin pago ni fiado.')
    name = text(data.get('name'), 120)
    lines = data.get('lines')
    if not isinstance(lines, list) or len(lines) > 200:
        raise ValidationError('El pedido admite hasta 200 líneas.')
    old = {l.external_id or str(l.pk): l for l in order.detallespedido_set.all()}
    seen = set()
    keep = []
    for item in lines:
        if not isinstance(item, dict):
            raise ValidationError('Línea inválida.')
        key = text(item.get('id'), 36, True)
        if key in seen:
            raise ValidationError('Una línea está repetida.')
        seen.add(key)
        quantity = integer(item.get('quantity'), 1, 99)
        product_id = integer(item.get('productId'), 1)
        note = text(item.get('note', ''), 500)
        line = old.get(key)
        product = Productos.objects.filter(pk=product_id, activo=True, disponible=True, categoria__activa=True).first()
        if line:
            if line.producto_id != product_id or item.get('price') != line.precio_unitario:
                raise ValidationError('No se puede cambiar el producto ni el precio de una línea existente.')
            if quantity > line.cantidad and not product:
                raise ValidationError('El producto ya no está disponible.')
        else:
            request_id(key)
            if not product:
                raise ValidationError('Uno de los productos ya no está disponible.')
            if item.get('price') != product.precio:
                raise Conflict('Cambió el precio de un producto. Actualiza el menú antes de agregarlo.')
            line = DetallesPedido(pedido=order, external_id=key, producto=product,
                                  nombre_producto=product.nombre, precio_unitario=product.precio)
        line.cantidad, line.indicaciones = quantity, note
        line.save()
        keep.append(line.pk)
    order.detallespedido_set.exclude(pk__in=keep).delete()
    if sum(l.cantidad * l.precio_unitario for l in order.detallespedido_set.all()) > 999999999999:
        raise ValidationError('El total del pedido supera el máximo permitido.')
    order.cliente = name


def assign_credit(order, data, amount, paid, credit):
    if paid or credit or order.estado == 'CANCELADO' or amount <= 0:
        raise Conflict('Este pedido no se puede dejar fiado.')
    name = text(data.get('name'), 120, True)
    phone = text(data.get('phone'), 16, True)
    if not re.fullmatch(r'\+[1-9]\d{7,14}', phone) or (phone.startswith('+56') and not re.fullmatch(r'\+569\d{8}', phone)):
        raise ValidationError('Celular inválido. Incluye el código de país.')
    try:
        promised = date.fromisoformat(data.get('dueDate', ''))
    except (ValueError, TypeError):
        raise ValidationError('Fecha prometida inválida.')
    if promised < timezone.now().astimezone(ZoneInfo('America/Santiago')).date():
        raise ValidationError('La fecha prometida no puede estar en el pasado.')
    Fiado.objects.create(pedido=order, nombre=name, celular=phone, fecha_prometida=promised, monto=amount)
    order.cliente = name


@transaction.atomic
def mutate_order(pk, payload):
    if not isinstance(payload, dict):
        raise ValidationError('Solicitud inválida.')
    key = request_id(payload.get('requestId'))
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=True).encode()).hexdigest()
    try:
        order = Pedidos.objects.select_for_update().get(pk=pk)
    except Pedidos.DoesNotExist:
        raise NotFound('No se encontró el pedido.')
    if order.request_key == key:
        if order.request_hash != digest:
            raise Conflict('El identificador de la operación ya fue utilizado.')
        return serialize(order)
    if integer(payload.get('revision')) != order.revision:
        raise Conflict()
    paid = Pagos.objects.filter(pedido=order).first()
    credit = Fiado.objects.filter(pedido=order).first()
    amount = sum(l.cantidad * l.precio_unitario for l in order.detallespedido_set.all())
    data = payload.get('data', {})
    if not isinstance(data, dict):
        raise ValidationError('Datos inválidos.')
    action = payload.get('action')
    if action == 'edit':
        edit_order(order, data, paid, credit)
    elif action == 'advance':
        if amount <= 0 or order.estado not in ('PENDIENTE', 'EN_PREPARACION'):
            raise Conflict('No se puede avanzar este pedido.')
        order.estado = 'EN_PREPARACION' if order.estado == 'PENDIENTE' else 'ENTREGADO'
    elif action == 'cancel':
        if paid or credit or order.estado != 'PENDIENTE':
            raise Conflict('Solo se pueden cancelar pedidos pendientes, sin pago ni fiado.')
        order.estado = 'CANCELADO'
    elif action == 'credit':
        assign_credit(order, data, amount, paid, credit)
    elif action == 'pay':
        if paid or order.estado == 'CANCELADO' or amount <= 0:
            raise Conflict('Este pedido no puede cobrarse o ya está pagado.')
        method = data.get('method')
        if not isinstance(method, str) or method not in METHOD_CODES:
            raise ValidationError('Medio de pago inválido.')
        received = integer(data.get('received'), amount) if method == 'Efectivo' else None
        Pagos.objects.create(pedido=order, metodo=METHOD_CODES[method], monto=amount, recibido=received,
                             vuelto=received - amount if received is not None else None)
    else:
        raise ValidationError('Operación desconocida.')
    order.revision += 1
    order.request_key, order.request_hash = key, digest
    order.actualizado_en = timezone.now()
    order.save()
    return serialize(order)
