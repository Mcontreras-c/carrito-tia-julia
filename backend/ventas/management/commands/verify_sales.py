"""Integration smoke tests on the configured DB. All test rows are rolled back."""
from datetime import timedelta, datetime, timezone as dt_timezone
from unittest.mock import patch
from uuid import uuid4

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.test import Client, override_settings
from rest_framework.exceptions import APIException

from ventas.models import Categorias, Productos, Pedidos, Pagos, Fiado
from ventas.services import create_order, mutate_order, serialize


class Command(BaseCommand):
    help = 'Prueba pedidos y fiados con rollback de todos los registros de prueba.'

    def handle(self, *args, **options):
        count = Pedidos.objects.count()
        with transaction.atomic():
            with patch('ventas.services.timezone.now', return_value=datetime(2037, 1, 16, 2, 59, tzinfo=dt_timezone.utc)):
                first = create_order(str(uuid4()))
                second = create_order(str(uuid4()))
                assert first['day'] == '2037-01-15' and first['number'] == 1
                assert second['number'] == 2
            with patch('ventas.services.timezone.now', return_value=datetime(2037, 1, 16, 3, 0, tzinfo=dt_timezone.utc)):
                key_next = str(uuid4())
                next_day = create_order(key_next)
                assert next_day['day'] == '2037-01-16' and next_day['number'] == 1
                assert create_order(key_next) == next_day
                assert create_order(str(uuid4()))['number'] == 2
            category = Categorias.objects.create(nombre='Verificacion ' + str(uuid4())[:12])
            product = Productos.objects.create(categoria=category, nombre='Producto de prueba', precio=2500)
            key = str(uuid4())
            order = create_order(key)
            assert create_order(key)['id'] == order['id']

            def command(action, data=None, revision=None, req=None):
                return {'requestId': req or str(uuid4()), 'revision': order['revision'] if revision is None else revision,
                        'action': action, 'data': data or {}}

            line = {'id': str(uuid4()), 'productId': product.pk, 'name': 'No confiar en este nombre', 'price': 2500, 'quantity': 2, 'note': 'Sin tomate'}
            for quantity in (0, -1, 1.5, True):
                try:
                    mutate_order(order['id'], command('edit', {'name': 'Prueba', 'lines': [{**line, 'quantity': quantity}]}))
                    raise AssertionError('Cantidad invalida aceptada')
                except APIException:
                    pass
            order = mutate_order(order['id'], command('edit', {'name': 'Prueba', 'lines': [line]}))
            assert order['lines'][0]['name'] == product.nombre
            try:
                mutate_order(order['id'], command('cancel', revision=0))
                raise AssertionError('Revision obsoleta aceptada')
            except APIException:
                pass
            for received in (4999, 5000.1, True):
                try:
                    mutate_order(order['id'], command('pay', {'method': 'Efectivo', 'received': received}))
                    raise AssertionError('Pago invalido aceptado')
                except APIException:
                    pass
            tomorrow = (timezone.now() + timedelta(days=1)).date().isoformat()
            order = mutate_order(order['id'], command('credit', {'name': 'Cliente de prueba', 'phone': '+56912345678', 'dueDate': tomorrow}))
            assert order['credit']['amount'] == 5000 and order['payment'] is None
            assert Fiado.objects.filter(pedido_id=order['id']).count() == 1
            try:
                mutate_order(order['id'], command('edit', {'name': 'Prueba', 'lines': []}))
                raise AssertionError('Fiado editable')
            except APIException:
                pass
            order = mutate_order(order['id'], command('advance'))
            order = mutate_order(order['id'], command('advance'))
            request = command('pay', {'method': 'Efectivo', 'received': 10000})
            order = mutate_order(order['id'], request)
            assert order['payment']['change'] == 5000
            assert mutate_order(order['id'], request) == order
            assert Pagos.objects.filter(pedido_id=order['id']).count() == 1
            reread = serialize(Pedidos.objects.get(pk=order['id']))
            assert reread['credit']['dueDate'] == tomorrow
            assert reread['payment']['total'] == 5000
            assert reread['status'] == 'Entregado'
            # Exercise HTTP JSON parsing, CSRF and deletion/cancellation on the same
            # transaction so the configured database keeps none of the test rows.
            with override_settings(ALLOWED_HOSTS=['testserver']):
                client = Client(enforce_csrf_checks=True)
                response = client.post('/api/pedidos/', {'requestId': str(uuid4())}, content_type='application/json')
                assert response.status_code == 403
                token = client.get('/api/csrf/').json()['token']
                headers = {'HTTP_X_CSRFTOKEN': token, 'HTTP_ORIGIN': 'http://localhost:5174'}
                response = client.post('/api/pedidos/', {'requestId': str(uuid4())}, content_type='application/json', **headers)
                assert response.status_code == 201, response.content
                order = response.json()
                path = f"/api/pedidos/{order['id']}/operaciones/"
                def post(action, data=None):
                    result = client.post(path, command(action, data), content_type='application/json', **headers)
                    assert result.status_code == 200, result.content
                    return result.json()
                order = post('edit', {'name': 'HTTP', 'lines': [{**line, 'id': str(uuid4())}]})
                assert len(order['lines']) == 1
                order = post('edit', {'name': 'HTTP', 'lines': []})
                assert order['lines'] == []
                order = post('cancel')
                assert order['status'] == 'Cancelado'
                response = client.get('/api/pedidos/')
                assert response.status_code == 200
                assert any(row['id'] == order['id'] for row in response.json())
            transaction.set_rollback(True)
        assert Pedidos.objects.count() == count
        self.stdout.write(self.style.SUCCESS('OK: creacion, reintento, validaciones, conflicto, fiado, entrega, pago y lectura. Pruebas revertidas.'))
