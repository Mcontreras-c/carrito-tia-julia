from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny

from .models import Productos
from .serializers import ProductoSerializer
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import JSONParser
from rest_framework.exceptions import ValidationError
from .models import Pedidos
from .services import create_order, mutate_order, serialize


class ProductoListView(ListAPIView):
    """Catálogo de consulta para la primera etapa de desarrollo local."""

    serializer_class = ProductoSerializer
    authentication_classes = []
    permission_classes = [AllowAny]
    pagination_class = None
    queryset = (
        Productos.objects.filter(activo=True, categoria__activa=True)
        .select_related("categoria")
        .order_by("categoria__nombre", "nombre", "id")
    )


class CsrfView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'token': get_token(request)})


@method_decorator(csrf_protect, name='dispatch')
class OrdersView(APIView):
    # Local development only. Add user authentication before network deployment.
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def get(self, request):
        return Response([serialize(order) for order in Pedidos.objects.all().order_by('id')])

    def post(self, request):
        if not isinstance(request.data, dict):
            raise ValidationError('Solicitud inválida.')
        return Response(create_order(request.data.get('requestId')), status=201)


@method_decorator(csrf_protect, name='dispatch')
class OrderChangeView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def post(self, request, pk):
        return Response(mutate_order(pk, request.data))
