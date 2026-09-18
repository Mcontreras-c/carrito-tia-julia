from django.urls import path

from .views import ProductoListView, CsrfView, OrdersView, OrderChangeView

app_name = "ventas"

urlpatterns = [
    path("productos/", ProductoListView.as_view(), name="productos-lista"),
    path("csrf/", CsrfView.as_view(), name="csrf"),
    path("pedidos/", OrdersView.as_view(), name="pedidos"),
    path("pedidos/<int:pk>/operaciones/", OrderChangeView.as_view(), name="pedido-operacion"),
]
